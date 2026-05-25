import fs from 'node:fs';
import process from 'node:process';
import WebSocket from 'ws';

type ProviderSecretRecord = {
  provider?: string;
  keyName?: string;
  secret?: string;
};

type LocalBackup = {
  providerSecrets?: ProviderSecretRecord[];
  state?: {
    personaVoiceBindings?: Record<
      string,
      {
        modelId?: string;
        voiceId?: string;
      }
    >;
  };
};

type SmokeResult = {
  deltaChars: number;
  doneTextLooksJson?: boolean;
  error: string | null;
  eventCount: number;
  leakedJsonInDeltas?: boolean;
  name: string;
  ok: boolean;
  status: number;
  toolsUsed: string[];
  audioChunks?: number;
};

const args = process.argv.slice(2);

function getArg(name: string, fallback = '') {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1] ?? fallback;
}

function hasFlag(name: string) {
  return args.includes(name);
}

function readBackup(path: string): LocalBackup {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as LocalBackup;
}

function getSecret(backup: LocalBackup, provider: string) {
  return (
    backup.providerSecrets?.find((entry) => entry.provider === provider)?.secret?.trim() ?? ''
  );
}

function parseSseEvents(text: string) {
  const events: Array<Record<string, unknown>> = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data) {
      continue;
    }
    try {
      events.push(JSON.parse(data) as Record<string, unknown>);
    } catch {
      events.push({ type: 'parse-error', raw: data });
    }
  }
  return events;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function getAiLiveUrl(baseUrl: string) {
  const url = new URL(baseUrl.replace(/\/$/, ''));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/ai/live`;
  return url.toString();
}

async function postAiChat(
  baseUrl: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
) {
  return fetch(`${baseUrl.replace(/\/$/, '')}/ai/chat`, {
    body: JSON.stringify(body),
    headers,
    method: 'POST',
  });
}

async function runToolSmoke({
  baseUrl,
  headers,
  llmProvider,
  model,
  name,
  openAiStateMode = 'stateless',
  transportMode,
}: {
  baseUrl: string;
  headers: Record<string, string>;
  llmProvider: string;
  model: string;
  name: string;
  openAiStateMode?: string;
  transportMode: string;
}): Promise<SmokeResult> {
  const response = await postAiChat(baseUrl, headers, {
    activeChatters: 1,
    llmProvider,
    maxTokens: 180,
    messages: [
      {
        content:
          'You are a test assistant. When asked to search, use the web_search tool. Return one short sentence.',
        role: 'system',
      },
      {
        content: 'Search the web for the current OpenAI homepage title and answer briefly.',
        role: 'user',
      },
    ],
    mode: 'direct',
    model,
    openAiStateMode,
    stateKey: `local:smoke:${name}`,
    stateScope: 'chat',
    stream: true,
    transportMode,
  });
  const events = parseSseEvents(await response.text());
  const done = events.find((event) => event['type'] === 'done') ?? null;
  const meta = done && typeof done['meta'] === 'object' && done['meta'] ? done['meta'] : null;
  const error =
    events.find((event) => event['type'] === 'error' || event['ok'] === false)?.['error'] ?? null;
  return {
    deltaChars: events
      .filter((event) => event['type'] === 'delta')
      .reduce((sum, event) => sum + String(event['delta'] ?? '').length, 0),
    error: typeof error === 'string' ? error : null,
    eventCount: events.length,
    name,
    ok: response.ok && !error && getStringArray(meta && (meta as Record<string, unknown>)['toolsUsed']).includes('web_search'),
    status: response.status,
    toolsUsed: getStringArray(meta && (meta as Record<string, unknown>)['toolsUsed']),
  };
}

async function runStructuredTtsSmoke({
  baseUrl,
  backup,
  headers,
  model,
}: {
  baseUrl: string;
  backup: LocalBackup;
  headers: Record<string, string>;
  model: string;
}): Promise<SmokeResult> {
  const voiceBinding = backup.state?.personaVoiceBindings?.['hikari-chan'] ?? {};
  const response = await postAiChat(baseUrl, headers, {
    activeChatters: 1,
    llmProvider: 'openai-responses',
    maxTokens: 120,
    messages: [
      {
        content:
          'Return strict JSON only. message is spoken dialogue only. emotion is metadata only.',
        role: 'system',
      },
      { content: 'Give one short playful sentence with a pause tag.', role: 'user' },
    ],
    mode: 'direct',
    model,
    openAiStateMode: 'stateless',
    responseFormat: {
      name: 'assistant_reply',
      schema: {
        additionalProperties: false,
        properties: {
          emotion: {
            enum: ['neutral', 'happy', 'excited', 'sad', 'angry', 'embarrassed', 'amused'],
            type: 'string',
          },
          message: { type: 'string' },
        },
        required: ['message', 'emotion'],
        type: 'object',
      },
      strict: true,
      type: 'json_schema',
    },
    stateKey: 'local:smoke:structured-tts',
    stateScope: 'chat',
    stream: true,
    transportMode: 'websocket',
    ttsBridge: {
      chunkLength: 160,
      chunkingStrategy: 'sentence',
      conditionOnPreviousChunks: true,
      latency: 'balanced',
      maxBufferChars: 180,
      minBufferChars: 30,
      modelId: voiceBinding.modelId || 's2',
      provider: 'fish-speech',
      softBufferChars: 80,
      streamingMode: 'live-bridge',
      text: '',
      voiceId: voiceBinding.voiceId,
    },
  });
  const events = parseSseEvents(await response.text());
  const done = events.find((event) => event['type'] === 'done') ?? null;
  const deltas = events
    .filter((event) => event['type'] === 'delta')
    .map((event) => String(event['delta'] ?? ''))
    .join('');
  const errors = events
    .filter(
      (event) =>
        event['type'] === 'error' || event['type'] === 'tts-error' || event['ok'] === false,
    )
    .map((event) => String(event['error'] ?? event['type']));
  const audioChunks = events.filter((event) => event['type'] === 'audio').length;
  const leakedJsonInDeltas = /[{}]|"emotion"|"message"/.test(deltas);
  return {
    audioChunks,
    deltaChars: deltas.length,
    doneTextLooksJson: /^\s*\{/.test(String(done?.['text'] ?? '')),
    error: errors[0] ?? null,
    eventCount: events.length,
    leakedJsonInDeltas,
    name: 'structured-tts',
    ok: response.ok && errors.length === 0 && audioChunks > 0 && !leakedJsonInDeltas,
    status: response.status,
    toolsUsed: [],
  };
}

function runAiLiveChat(
  baseUrl: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const requestId = `smoke-live-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const events: Array<Record<string, unknown>> = [];
    const socket = new WebSocket(getAiLiveUrl(baseUrl));
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('AI live websocket smoke timed out.'));
    }, 45000);

    const finish = (error?: Error) => {
      clearTimeout(timeout);
      socket.close();
      if (error) {
        reject(error);
      } else {
        resolve(events);
      }
    };

    socket.once('error', (error) => finish(error instanceof Error ? error : new Error(String(error))));
    socket.on('message', (raw) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch (error) {
        finish(error instanceof Error ? error : new Error('Malformed AI live websocket event.'));
        return;
      }
      if (event['requestId'] !== requestId) {
        return;
      }
      events.push(event);
      if (event['type'] === 'error' || event['ok'] === false) {
        finish(new Error(String(event['error'] ?? 'AI live websocket smoke failed.')));
      }
      if (event['type'] === 'done') {
        finish();
      }
    });
    socket.once('open', () => {
      socket.send(
        JSON.stringify({
          body,
          headers,
          requestId,
          type: 'chat.create',
        }),
      );
    });
  });
}

async function runLiveWsStructuredTtsSmoke({
  baseUrl,
  backup,
  headers,
  model,
}: {
  baseUrl: string;
  backup: LocalBackup;
  headers: Record<string, string>;
  model: string;
}): Promise<SmokeResult> {
  const voiceBinding = backup.state?.personaVoiceBindings?.['hikari-chan'] ?? {};
  const events = await runAiLiveChat(baseUrl, headers, {
    activeChatters: 1,
    llmProvider: 'openai-responses',
    maxTokens: 120,
    messages: [
      {
        content:
          'Return strict JSON only. message is spoken dialogue only. emotion is metadata only.',
        role: 'system',
      },
      { content: 'Give one short playful sentence with a pause tag.', role: 'user' },
    ],
    mode: 'direct',
    model,
    openAiStateMode: 'stateless',
    responseFormat: {
      name: 'assistant_reply',
      schema: {
        additionalProperties: false,
        properties: {
          emotion: {
            enum: ['neutral', 'happy', 'excited', 'sad', 'angry', 'embarrassed', 'amused'],
            type: 'string',
          },
          message: { type: 'string' },
        },
        required: ['message', 'emotion'],
        type: 'object',
      },
      strict: true,
      type: 'json_schema',
    },
    stateKey: 'local:smoke:ai-live-structured-tts',
    stateScope: 'chat',
    stream: true,
    transportMode: 'websocket',
    ttsBridge: {
      chunkLength: 160,
      chunkingStrategy: 'sentence',
      conditionOnPreviousChunks: true,
      latency: 'balanced',
      maxBufferChars: 180,
      minBufferChars: 30,
      modelId: voiceBinding.modelId || 's2',
      provider: 'fish-speech',
      softBufferChars: 80,
      streamingMode: 'live-bridge',
      text: '',
      voiceId: voiceBinding.voiceId,
    },
  });
  const done = events.find((event) => event['type'] === 'done') ?? null;
  const deltas = events
    .filter((event) => event['type'] === 'delta')
    .map((event) => String(event['delta'] ?? ''))
    .join('');
  const errors = events
    .filter(
      (event) =>
        event['type'] === 'error' || event['type'] === 'tts-error' || event['ok'] === false,
    )
    .map((event) => String(event['error'] ?? event['type']));
  const audioChunks = events.filter((event) => event['type'] === 'audio').length;
  const leakedJsonInDeltas = /[{}]|"emotion"|"message"/.test(deltas);
  return {
    audioChunks,
    deltaChars: deltas.length,
    doneTextLooksJson: /^\s*\{/.test(String(done?.['text'] ?? '')),
    error: errors[0] ?? null,
    eventCount: events.length,
    leakedJsonInDeltas,
    name: 'ai-live-structured-tts',
    ok: errors.length === 0 && audioChunks > 0 && !leakedJsonInDeltas,
    status: 101,
    toolsUsed: [],
  };
}

async function main() {
  const backupPath =
    getArg('--backup') || 'C:/Users/SUBSECT/Downloads/web-waifu-4-local-backup-2026-05-24T22-18-26.json';
  const baseUrl = getArg('--base-url', 'http://127.0.0.1:8797');
  const openAiModel = getArg('--openai-model', 'gpt-5-nano');
  const openRouterModel = getArg('--openrouter-model', 'openai/gpt-5-nano');
  const backup = readBackup(backupPath);
  const openAiKey = getSecret(backup, 'openai');
  const openRouterKey = getSecret(backup, 'openrouter');
  const fishKey = getSecret(backup, 'fish_speech');
  const tavilyKey = getSecret(backup, 'tavily');
  if (!tavilyKey) {
    throw new Error('Backup is missing Tavily key; tool smokes cannot prove web_search.');
  }

  const results: SmokeResult[] = [];
  if (openAiKey) {
    const openAiHeaders = {
      'content-type': 'application/json',
      'x-yourwifey-llm-provider': 'openai-responses',
      'x-yourwifey-llm-provider-key': openAiKey,
      'x-yourwifey-tavily-provider-key': tavilyKey,
    };
    results.push(
      await runToolSmoke({
        baseUrl,
        headers: openAiHeaders,
        llmProvider: 'openai-responses',
        model: openAiModel,
        name: 'openai-ws-tools',
        transportMode: 'websocket',
      }),
    );
    results.push(
      await runToolSmoke({
        baseUrl,
        headers: openAiHeaders,
        llmProvider: 'openai-responses',
        model: openAiModel,
        name: 'openai-http-tools',
        transportMode: 'http-stream',
      }),
    );
    if (fishKey && !hasFlag('--skip-tts')) {
      const ttsHeaders = {
        ...openAiHeaders,
        'x-yourwifey-tts-provider-key': fishKey,
      };
      results.push(
        await runStructuredTtsSmoke({
          backup,
          baseUrl,
          headers: ttsHeaders,
          model: openAiModel,
        }),
      );
      results.push(
        await runLiveWsStructuredTtsSmoke({
          backup,
          baseUrl,
          headers: ttsHeaders,
          model: openAiModel,
        }),
      );
    }
  }
  if (openRouterKey) {
    results.push(
      await runToolSmoke({
        baseUrl,
        headers: {
          'content-type': 'application/json',
          'x-yourwifey-llm-provider': 'openrouter-responses',
          'x-yourwifey-llm-provider-key': openRouterKey,
          'x-yourwifey-tavily-provider-key': tavilyKey,
        },
        llmProvider: 'openrouter-responses',
        model: openRouterModel,
        name: 'openrouter-tools',
        transportMode: 'http-stream',
      }),
    );
  }

  console.table(
    results.map((result) => ({
      audioChunks: result.audioChunks ?? '',
      deltaChars: result.deltaChars,
      error: result.error ?? '',
      events: result.eventCount,
      jsonLeak: result.leakedJsonInDeltas ?? '',
      name: result.name,
      ok: result.ok,
      status: result.status,
      tools: result.toolsUsed.join(','),
    })),
  );

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    throw new Error(`Packaged AI smoke failed: ${failures.map((result) => result.name).join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
