import fs from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

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

async function runSmokeStep(name: string, task: () => Promise<SmokeResult>) {
  try {
    return await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Packaged AI smoke step "${name}" threw: ${message}`);
  }
}

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

function requireArg(name: string, fallback = '') {
  const value = getArg(name) || fallback;
  if (!value) {
    throw new Error(`Missing ${name}. Pass ${name} <path> or set WEBWAIFU_RELEASE_BACKUP.`);
  }
  return value;
}

function readBackup(path: string): LocalBackup {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as LocalBackup;
}

function getSecret(backup: LocalBackup, provider: string) {
  return (
    backup.providerSecrets?.find((entry) => entry.provider === provider)?.secret?.trim() ?? ''
  );
}

function requireSecret(backup: LocalBackup, provider: string, flagName: string) {
  const secret = getSecret(backup, provider);
  if (!secret) {
    throw new Error(`Backup is missing ${provider} key; pass ${flagName} to skip that smoke.`);
  }
  return secret;
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

export function hasStructuredJsonEnvelopeLeak(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (/"(?:message|emotion)"\s*:/.test(trimmed)) {
    return true;
  }
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return (
      Boolean(parsed) &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      ('message' in parsed || 'emotion' in parsed)
    );
  } catch {
    return false;
  }
}

async function assertBackendHealthy(baseUrl: string) {
  const healthUrl = `${baseUrl.replace(/\/$/, '')}/health`;
  try {
    const response = await fetch(healthUrl);
    if (response.ok) {
      return;
    }
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Packaged backend is not reachable at ${healthUrl}: ${message}. Start release/win-unpacked/WebWaifu 4.exe first, or run npm run verify:release -- --backup <backup.json> to have the verifier launch it.`,
    );
  }
}

function isPremiumCostModelId(model: string) {
  const normalized = model.trim().toLowerCase();
  const parts = normalized.split('/');
  const provider = parts.length > 1 ? parts[0] : '';
  const leaf = (parts.at(-1) ?? normalized).replace(/_/g, '.');
  const isOpenAiModel = !provider || provider === 'openai';
  const isO1Model =
    leaf === 'o1' ||
    leaf.startsWith('o1-') ||
    leaf.startsWith('o1.') ||
    leaf.startsWith('o1pro');
  const isProModel = /(^|[.-])pro([.-]|$)/.test(leaf);
  return isOpenAiModel && (isO1Model || isProModel);
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

async function runPomlMemorySmoke(baseUrl: string): Promise<SmokeResult> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/ai/poml/render`, {
    body: JSON.stringify({
      variables: {
        diary_context: '- Subby asked me to prove memory reaches the shipped prompt.',
        persona_context: 'You are Hikari. Stay direct and in character.',
        relationship_memory_context:
          '## relationship_memory\nsummary=Subby is verifying release memory wiring.\nknown_facts=["Subby cares about low-latency TTS"]',
        reply_metadata_instruction: '<yw-meta>{"emotion":"neutral"}</yw-meta>',
        semantic_memory_context:
          '## recalled_memories\n- score=0.98 User: remember WebSocket first audio timing matters',
        turn_metadata_context:
          'Turn metadata: {"source":"local","stateKey":"local:persona:hikari-chan"}',
      },
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  const payload = (await response.json().catch(() => null)) as
    | { messages?: unknown; ok?: boolean; error?: string }
    | null;
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const systemMessage = messages.find(
    (item): item is { content: string; role: string } =>
      Boolean(item) &&
      typeof item === 'object' &&
      (item as { role?: unknown }).role === 'system' &&
      typeof (item as { content?: unknown }).content === 'string',
  );
  const content = systemMessage?.content ?? '';
  const required = [
    '# Relationship Memory',
    '## relationship_memory',
    'Subby is verifying release memory wiring.',
    'Subby cares about low-latency TTS',
    '# Private Diary Context',
    'Subby asked me to prove memory reaches the shipped prompt.',
    '# Relevant Semantic Memory',
    '## recalled_memories',
    'WebSocket first audio timing matters',
    '"stateKey":"local:persona:hikari-chan"',
    '<yw-meta>',
  ];
  const forbidden = [
    'POML renders the prompt',
    'OpenAI Responses API',
    'host_context',
    'external runtime services',
    '{{',
  ];
  const missing = required.filter((needle) => !content.includes(needle));
  const leaked = forbidden.filter((needle) => content.includes(needle));
  return {
    deltaChars: content.length,
    error:
      payload?.error ??
      (missing.length ? `missing ${missing.join(', ')}` : leaked.length ? `leaked ${leaked.join(', ')}` : null),
    eventCount: messages.length,
    name: 'poml-memory-render',
    ok: response.ok && payload?.ok === true && missing.length === 0 && leaked.length === 0,
    status: response.status,
    toolsUsed: [],
  };
}

async function runPremiumModelGuardSmoke(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<SmokeResult> {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/health`);
  url.searchParams.set('model', 'o1-pro-2025-03-19');
  url.searchParams.set('openAiStateMode', 'stateless');
  url.searchParams.set('stateKey', 'local:smoke:premium-model-guard');
  url.searchParams.set('transportMode', 'http-stream');
  const response = await fetch(url, { headers });
  const payload = (await response.json().catch(() => null)) as
    | { error?: unknown; model?: unknown; ok?: boolean }
    | null;
  const resolvedModel = typeof payload?.model === 'string' ? payload.model : '';
  const blocked = Boolean(resolvedModel) && !isPremiumCostModelId(resolvedModel);
  return {
    deltaChars: resolvedModel.length,
    error:
      typeof payload?.error === 'string'
        ? payload.error
        : blocked
          ? null
          : `premium model leaked through as ${resolvedModel || '(missing)'}`,
    eventCount: 1,
    name: 'premium-model-guard',
    ok: response.ok && payload?.ok === true && blocked,
    status: response.status,
    toolsUsed: [],
  };
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
    transportMode: 'http-stream',
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
  const leakedJsonInDeltas = hasStructuredJsonEnvelopeLeak(deltas);
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

async function main() {
  const backupPath = requireArg('--backup', process.env['WEBWAIFU_RELEASE_BACKUP'] ?? '');
  const baseUrl = getArg('--base-url', 'http://127.0.0.1:8797');
  const openAiModel = getArg('--openai-model', 'gpt-5-nano');
  const openRouterModel = getArg('--openrouter-model', 'openai/gpt-5-nano');
  const backup = readBackup(backupPath);
  const skipOpenAi = hasFlag('--skip-openai');
  const skipOpenRouter = hasFlag('--skip-openrouter');
  const skipTts = hasFlag('--skip-tts');
  if (skipOpenAi && skipOpenRouter) {
    throw new Error(
      'Packaged AI smoke must exercise at least one LLM provider. Use verify:release --skip-packaged-ai for structural checks.',
    );
  }
  const openAiKey = skipOpenAi ? '' : requireSecret(backup, 'openai', '--skip-openai');
  const openRouterKey = skipOpenRouter
    ? ''
    : requireSecret(backup, 'openrouter', '--skip-openrouter');
  const fishKey =
    skipTts || skipOpenAi ? '' : requireSecret(backup, 'fish_speech', '--skip-tts');
  const tavilyKey = getSecret(backup, 'tavily');
  if (!tavilyKey) {
    throw new Error('Backup is missing Tavily key; tool smokes cannot prove web_search.');
  }

  await assertBackendHealthy(baseUrl);

  const results: SmokeResult[] = [];
  results.push(await runSmokeStep('poml-memory-render', () => runPomlMemorySmoke(baseUrl)));
  if (openAiKey) {
    const openAiHeaders = {
      'content-type': 'application/json',
      'x-yourwifey-llm-provider': 'openai-responses',
      'x-yourwifey-llm-provider-key': openAiKey,
      'x-yourwifey-tavily-provider-key': tavilyKey,
    };
    results.push(
      await runSmokeStep('premium-model-guard', () =>
        runPremiumModelGuardSmoke(baseUrl, openAiHeaders),
      ),
    );
    results.push(
      await runSmokeStep('openai-http-tools', () =>
        runToolSmoke({
          baseUrl,
          headers: openAiHeaders,
          llmProvider: 'openai-responses',
          model: openAiModel,
          name: 'openai-http-tools',
          transportMode: 'http-stream',
        }),
      ),
    );
    if (fishKey) {
      const ttsHeaders = {
        ...openAiHeaders,
        'x-yourwifey-tts-provider-key': fishKey,
      };
      results.push(
        await runSmokeStep('structured-tts', () =>
          runStructuredTtsSmoke({
            backup,
            baseUrl,
            headers: ttsHeaders,
            model: openAiModel,
          }),
        ),
      );
    }
  }
  if (openRouterKey) {
    results.push(
      await runSmokeStep('openrouter-tools', () =>
        runToolSmoke({
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
      ),
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

function isMainModule() {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href);
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
