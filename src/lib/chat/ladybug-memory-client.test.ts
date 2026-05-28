import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canUseLadybugMemoryBackend,
  loadLadybugMemoryStatus,
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
});
