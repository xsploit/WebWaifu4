import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canUseLadybugMemoryBackend,
  loadLadybugGrilloContextPacket,
  loadLadybugGrilloRuntimeStatus,
  loadLadybugMemoryStatus,
  runLadybugGrilloTick,
  saveLadybugGrilloTurnPair,
} from './ladybug-memory-client';

const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

function installWindow(search = '', href = `http://localhost:5173/${search}`) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        href,
        search,
      },
    },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('Ladybug memory client routing', () => {
  it('uses the local Vite /api memory proxy in plain browser mode', async () => {
    installWindow('', 'http://localhost:5173/editor');
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input) => {
      fetchCalls.push(String(input));
      return Response.json({ ok: true, backend: 'ladybug', snapshots: 1 });
    }) as typeof fetch;

    await expect(loadLadybugMemoryStatus()).resolves.toMatchObject({
      backend: 'ladybug',
      ok: true,
      snapshots: 1,
    });

    expect(canUseLadybugMemoryBackend()).toBe(true);
    expect(fetchCalls[0]).toBe('http://localhost:5173/api/memory/status');
  });

  it('keeps Electron desktop memory calls on the direct backend port', async () => {
    installWindow('?desktop=1&botPort=8797', 'http://localhost:5173/?desktop=1&botPort=8797');
    Object.assign(globalThis.window, {
      webWaifuDesktop: {
        backendPort: '8797',
        isDesktop: true,
      },
    });
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input) => {
      fetchCalls.push(String(input));
      return Response.json({ ok: true, backend: 'ladybug', snapshots: 2 });
    }) as typeof fetch;

    await expect(loadLadybugMemoryStatus()).resolves.toMatchObject({
      backend: 'ladybug',
      ok: true,
      snapshots: 2,
    });

    expect(fetchCalls[0]).toBe('http://127.0.0.1:8797/memory/status');
  });

  it('posts native GRILLO turn ingestion through the browser memory proxy', async () => {
    installWindow('', 'http://localhost:5173/editor');
    const fetchCalls: Array<{ body: string | null; input: string; method?: string }> = [];
    globalThis.fetch = (async (input, init) => {
      fetchCalls.push({
        body: typeof init?.body === 'string' ? init.body : null,
        input: String(input),
        method: init?.method,
      });
      return Response.json({
        ok: true,
        scopeKey: 'local:persona:hikari-chan',
        turnIds: ['1', '2'],
        writes: 2,
      });
    }) as typeof fetch;

    await expect(
      saveLadybugGrilloTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'Saved.',
        authorName: 'Subsect',
        channelId: 'local',
        participantKey: 'local:local:subsect',
        scopeKey: 'local:persona:hikari-chan',
        source: 'local',
        userText: 'remember this',
      }),
    ).resolves.toBe(true);

    expect(fetchCalls[0]).toMatchObject({
      input: 'http://localhost:5173/api/memory/grillo/turn',
      method: 'POST',
    });
    expect(JSON.parse(fetchCalls[0]?.body ?? '{}')).toMatchObject({
      assistantText: 'Saved.',
      scopeKey: 'local:persona:hikari-chan',
      userText: 'remember this',
    });
  });

  it('posts native GRILLO turn ingestion directly to the Electron backend', async () => {
    installWindow('?desktop=1&botPort=8797', 'http://localhost:5173/?desktop=1&botPort=8797');
    Object.assign(globalThis.window, {
      webWaifuDesktop: {
        backendPort: '8797',
        isDesktop: true,
      },
    });
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input) => {
      fetchCalls.push(String(input));
      return Response.json({
        ok: true,
        scopeKey: 'local:persona:hikari-chan',
        turnIds: ['1'],
        writes: 1,
      });
    }) as typeof fetch;

    await expect(
      saveLadybugGrilloTurnPair({
        scopeKey: 'local:persona:hikari-chan',
        userText: 'hi',
      }),
    ).resolves.toBe(true);

    expect(fetchCalls[0]).toBe('http://127.0.0.1:8797/memory/grillo/turn');
  });

  it('loads native GRILLO context packets with scoped participant filters', async () => {
    installWindow('', 'http://localhost:5173/editor');
    const fetchCalls: string[] = [];
    globalThis.fetch = (async (input) => {
      fetchCalls.push(String(input));
      return Response.json({
        ok: true,
        packet: {
          background_information: ['scope_key: local:persona:hikari-chan'],
          channel_history: ['Subsect: hi'],
          generatedAt: 1770000000000,
          output_description: ['Use scoped memory.'],
          recalled_memories: [{ score: 0.8, text: 'Subsect likes Ladybug memory.' }],
          relationship_memory: ['known_facts=["Subsect likes Ladybug memory."]'],
          scopeKey: 'local:persona:hikari-chan',
          thoughts: ['I should remember the Ladybug context.'],
        },
      });
    }) as typeof fetch;

    await expect(
      loadLadybugGrilloContextPacket('local:persona:hikari-chan', {
        participantKeys: ['local:local:subsect'],
        query: 'memory',
      }),
    ).resolves.toMatchObject({
      scopeKey: 'local:persona:hikari-chan',
      relationship_memory: ['known_facts=["Subsect likes Ladybug memory."]'],
    });

    expect(fetchCalls[0]).toBe(
      'http://localhost:5173/api/memory/grillo/context?scopeKey=local%3Apersona%3Ahikari-chan&query=memory&participantKey=local%3Alocal%3Asubsect',
    );
  });

  it('loads runtime status and posts manual backend GRILLO ticks', async () => {
    installWindow('', 'http://localhost:5173/editor');
    const fetchCalls: Array<{ body: string | null; input: string; method?: string }> = [];
    globalThis.fetch = (async (input, init) => {
      fetchCalls.push({
        body: typeof init?.body === 'string' ? init.body : null,
        input: String(input),
        method: init?.method,
      });
      if (String(input).endsWith('/memory/grillo/runtime')) {
        return Response.json({
          ok: true,
          runtime: {
            enabled: false,
            intervalMs: 60000,
            lastNoOpReason: 'disabled',
            lastTickAt: 0,
            lastTickDurationMs: 0,
            lastTickId: '',
            lastTickReason: '',
            running: false,
            started: true,
            startedAt: 1770000000000,
          },
        });
      }
      return Response.json({
        ok: true,
        result: {
          durationMs: 0,
          noOpReason: 'worker_tasks_not_wired',
          ok: true,
          reason: 'manual_ui',
          running: false,
          scopeKey: 'local:persona:hikari-chan',
          tickId: 'tick-1',
          writes: 0,
        },
      });
    }) as typeof fetch;

    await expect(loadLadybugGrilloRuntimeStatus()).resolves.toMatchObject({
      lastNoOpReason: 'disabled',
      started: true,
    });
    await expect(
      runLadybugGrilloTick({
        reason: 'manual_ui',
        scopeKey: 'local:persona:hikari-chan',
      }),
    ).resolves.toMatchObject({
      noOpReason: 'worker_tasks_not_wired',
      tickId: 'tick-1',
    });

    expect(fetchCalls[0]).toMatchObject({
      input: 'http://localhost:5173/api/memory/grillo/runtime',
      method: undefined,
    });
    expect(fetchCalls[1]).toMatchObject({
      input: 'http://localhost:5173/api/memory/grillo/run/tick',
      method: 'POST',
    });
    expect(JSON.parse(fetchCalls[1]?.body ?? '{}')).toMatchObject({
      reason: 'manual_ui',
      scopeKey: 'local:persona:hikari-chan',
    });
  });
});
