import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGrilloContextPromptBlock } from '../src/lib/chat/grillo-context';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = path.join(repoRoot, 'server', 'dist', 'index.js');
const scopeKey = 'local:persona:smoke-hikari';
const participantKey = 'local:local:subsect';

type JsonObject = Record<string, unknown>;

async function main() {
  if (!existsSync(serverEntry)) {
    throw new Error(`Missing compiled backend at ${serverEntry}. Run npm run build first.`);
  }

  const port = await findAvailablePort(18970);
  const dbPath = path.join(tmpdir(), `webwaifu4-grillo-chat-smoke-${process.pid}.db`);
  const backend = spawn(process.execPath, [serverEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BOT_PORT: String(port),
      SERVER_PROVIDER_PROXY_ENABLED: 'false',
      TWITCH_MOCK: 'true',
      WEBWAIFU_MEMORY_DB_DIR: dbPath,
      WEBWAIFU_SMOKE_RUNTIME_MOCK_PROVIDER: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const logs: string[] = [];
  backend.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  backend.stderr.on('data', (chunk) => logs.push(chunk.toString()));

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForJson(`${baseUrl}/health`);

    const manual = await postJson(`${baseUrl}/memory/grillo/run/manual`, {
      beatType: 'relationship',
      candidate: {
        confidence: 0.93,
        content: 'Subsect wants runtime GRILLO context to reach the actual chat prompt.',
        summary: 'Runtime smoke must prove GRILLO reaches chat prompt.',
        type: 'goal',
      },
      diary: {
        personalThought:
          'I should keep runtime memory evidence visible before replying to Subsect.',
        summary: 'Runtime GRILLO prompt injection was verified.',
        tags: ['runtime', 'grillo', 'prompt'],
      },
      participantKey,
      responseText: 'Manual runtime smoke seeded GRILLO context.',
      scopeKey,
      slot: {
        items: ['Runtime GRILLO context must reach the chat prompt before /ai/chat.'],
        operation: 'merge',
        slotName: 'ongoing_threads',
      },
      trace: {
        model: 'runtime-smoke',
        provider: 'backend',
        taskType: 'relationship',
      },
    });
    assertOk(manual, 'manual GRILLO seed');

    const packetResponse = await getJson(
      `${baseUrl}/memory/grillo/context?scopeKey=${encodeURIComponent(scopeKey)}&participantKey=${encodeURIComponent(participantKey)}&query=${encodeURIComponent('runtime GRILLO chat prompt')}`,
    );
    assertOk(packetResponse, 'GRILLO context packet');
    const packet = asObject(packetResponse.packet);
    const grilloContext = buildGrilloContextPromptBlock({
      currentTurnText: 'Can you prove runtime GRILLO context reaches this chat reply?',
      memoryAdditions: { contextPacket: packet },
      persona: {
        description: 'Local runtime smoke persona.',
        id: 'smoke-hikari',
        name: 'Hikari Smoke',
        systemPrompt: 'Answer briefly.',
        userNickname: 'Subsect',
      },
      relationshipMemory: createEmptyRelationshipMemory(),
      turnContext: {
        channel: 'local',
        conversationScope: 'local-chat',
        displayName: 'Subsect',
        isLocal: true,
        isTrustedController: true,
        login: 'subsect',
        source: 'local',
        stateKey: scopeKey,
      },
    });

    const render = await postJson(`${baseUrl}/ai/poml/render`, {
      variables: {
        current_turn_context: 'Local viewer Subsect: prove runtime GRILLO chat context.',
        grillo_context: grilloContext,
        persona_context: 'You are Hikari Smoke. Reply naturally and briefly.',
        reply_metadata_instruction: '<yw-meta>{"emotion":"neutral"}</yw-meta>',
        turn_metadata_context: `Turn metadata: ${JSON.stringify({
          displayName: 'Subsect',
          local: true,
          stateKey: scopeKey,
          trustedController: true,
        })}`,
      },
    });
    assertOk(render, 'POML render');
    const messages = Array.isArray(render.messages) ? render.messages : [];
    const systemMessage = messages.find(
      (item): item is { content: string; role: string } =>
        Boolean(item) &&
        typeof item === 'object' &&
        (item as { role?: unknown }).role === 'system' &&
        typeof (item as { content?: unknown }).content === 'string',
    );
    if (!systemMessage) {
      throw new Error('POML render returned no system message.');
    }
    assertContains(
      systemMessage.content,
      [
        'Runtime smoke must prove GRILLO reaches chat prompt.',
        'Runtime GRILLO context must reach the chat prompt before /ai/chat.',
        'I should keep runtime memory evidence visible before replying to Subsect.',
        'local:local:subsect',
      ],
      'rendered system prompt',
    );

    const chat = await postJson(`${baseUrl}/ai/chat`, {
      activeChatters: 1,
      llmProvider: 'openrouter-responses',
      messages: messages.map((item) => ({
        content: String((item as { content?: unknown }).content ?? ''),
        role: (item as { role?: unknown }).role,
      })),
      mode: 'direct',
      openAiStateMode: 'stateless',
      stateKey: scopeKey,
      stateScope: 'chat',
      stream: false,
      transportMode: 'http-stream',
    });
    assertOk(chat, 'AI chat');
    if (typeof chat.text !== 'string' || !chat.text.trim()) {
      throw new Error('/ai/chat returned no reply text.');
    }

    console.log(
      JSON.stringify(
        {
          chatText: chat.text,
          grilloContextChars: grilloContext.length,
          ok: true,
          port,
          systemPromptChars: systemMessage.content.length,
          verdict: 'grillo-chat-context-runtime-smoke-pass',
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const tail = logs.join('').split(/\r?\n/).slice(-40).join('\n');
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n\nBackend log tail:\n${tail}`,
    );
  } finally {
    await stopBackend(backend);
    await rm(dbPath, { force: true, recursive: true }).catch(() => undefined);
    await rm(`${dbPath}.wal`, { force: true, recursive: true }).catch(() => undefined);
  }
}

function createEmptyRelationshipMemory() {
  return {
    attraction: 0,
    diaryEntry: '',
    diaryHistory: [],
    facts: [],
    guard: 0,
    irritation: 0,
    jealousy: 0,
    lastActionTag: 'none' as const,
    lastDiaryTurnCount: 0,
    lastSeenAt: null,
    mood: 'guarded' as const,
    relationshipStage: 'new' as const,
    respect: 0,
    summary: '',
    trust: 0,
    turnCount: 0,
    version: 2 as const,
  };
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected object payload.');
  }
  return value as JsonObject;
}

function assertOk(payload: JsonObject, label: string) {
  if (payload.ok !== true) {
    throw new Error(`${label} failed: ${JSON.stringify(payload).slice(0, 1000)}`);
  }
}

function assertContains(text: string, needles: string[], label: string) {
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length > 0) {
    throw new Error(`${label} missing: ${missing.join(', ')}`);
  }
}

async function getJson(url: string): Promise<JsonObject> {
  const response = await fetch(url);
  return readJsonResponse(response, url);
}

async function postJson(url: string, body: unknown): Promise<JsonObject> {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  return readJsonResponse(response, url);
}

async function readJsonResponse(response: Response, url: string): Promise<JsonObject> {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${url} returned non-JSON: ${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return asObject(payload);
}

async function waitForJson(url: string) {
  const deadline = Date.now() + 15000;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      return await getJson(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Timed out waiting for ${url}`);
}

async function findAvailablePort(start: number) {
  for (let port = start; port < start + 100; port += 1) {
    if (await canListen(port)) {
      return port;
    }
  }
  throw new Error(`No available port near ${start}.`);
}

function canListen(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen({ host: '127.0.0.1', port });
  });
}

function stopBackend(backend: ChildProcessWithoutNullStreams) {
  if (backend.exitCode !== null || backend.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      backend.kill('SIGKILL');
      resolve();
    }, 5000);
    backend.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    backend.kill('SIGTERM');
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
