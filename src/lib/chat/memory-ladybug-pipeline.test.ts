import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderYourWifeyPomlMessages } from '../../../server/src/ai/PomlRenderer';
import { LadybugMemoryService } from '../../../server/src/memory/LadybugMemoryService';
import { createLocalChatTurn, createTwitchChatTurn } from './chat-turn';
import { createDefaultRelationshipMemory, DEFAULT_PERSONA } from './defaults';
import { buildGrilloMemoryPromptAdditionsAsync, recordGrilloMemoryTurnAsync } from './grillo-memory';
import { loadLadybugRelationshipMemories } from './ladybug-memory-client';
import { runGrilloMemoryWorkerLoop } from './grillo-memory-loop';
import { addMemoryAgentPendingChatTurns, getMemoryAgentCadenceDecision } from './memory-agent';
import {
  addSemanticMemoryTurn,
  buildSemanticMemoryContext,
  findSemanticMemoryMatches,
} from './semantic-memory';
import { buildChatCompletionMessages } from './prompt';

function createStorage() {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('Ladybug memory pipeline', () => {
  let dbPath = '';
  let service: LadybugMemoryService | null = null;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `webwaifu4-memory-pipeline-${process.pid}-${Date.now()}.db`);
    service = new LadybugMemoryService(dbPath);
    vi.stubGlobal('window', {
      location: {
        href: 'http://127.0.0.1:5173/?desktop=1&botPort=8797',
        search: '?desktop=1&botPort=8797',
      },
      localStorage: createStorage(),
      webWaifuDesktop: {
        backendPort: '8797',
        isDesktop: true,
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
        if (!service) {
          return Response.json({ ok: false, error: 'service unavailable' }, { status: 500 });
        }
        const url = new URL(String(request));
        if (url.pathname === '/memory/grillo' && (init?.method ?? 'GET') === 'GET') {
          return Response.json({
            ok: true,
            backend: 'ladybug',
            scopeKey: url.searchParams.get('scopeKey'),
            state: await service.loadGrilloState(url.searchParams.get('scopeKey') ?? ''),
          });
        }
        if (url.pathname === '/memory/grillo' && init?.method === 'PUT') {
          const body = JSON.parse(String(init.body ?? '{}')) as {
            scopeKey?: unknown;
            state?: unknown;
          };
          await service.saveGrilloState(String(body.scopeKey ?? ''), body.state);
          return Response.json({
            ok: true,
            backend: 'ladybug',
            scopeKey: String(body.scopeKey ?? ''),
          });
        }
        if (url.pathname === '/memory/semantic' && (init?.method ?? 'GET') === 'GET') {
          return Response.json({
            ok: true,
            backend: 'ladybug',
            records: await service.loadSemanticRecords(url.searchParams.get('scopeKey') ?? ''),
            scopeKey: url.searchParams.get('scopeKey'),
          });
        }
        if (url.pathname === '/memory/semantic' && init?.method === 'PUT') {
          const body = JSON.parse(String(init.body ?? '{}')) as {
            records?: unknown;
            scopeKey?: unknown;
          };
          await service.saveSemanticRecords(
            String(body.scopeKey ?? ''),
            Array.isArray(body.records) ? body.records : [],
          );
          return Response.json({
            ok: true,
            backend: 'ladybug',
            scopeKey: String(body.scopeKey ?? ''),
          });
        }
        if (url.pathname === '/memory/relationships' && (init?.method ?? 'GET') === 'GET') {
          return Response.json({
            ok: true,
            backend: 'ladybug',
            profiles: await service.loadRelationshipProfiles(),
          });
        }
        if (url.pathname === '/memory/relationships' && init?.method === 'PUT') {
          const body = JSON.parse(String(init.body ?? '{}')) as {
            profiles?: unknown;
          };
          await service.saveRelationshipProfiles(
            body.profiles && typeof body.profiles === 'object' && !Array.isArray(body.profiles)
              ? (body.profiles as Record<string, unknown>)
              : {},
          );
          return Response.json({
            ok: true,
            backend: 'ladybug',
          });
        }
        if (url.pathname === '/memory/status' && (init?.method ?? 'GET') === 'GET') {
          return Response.json({
            ok: true,
            ...(await service.getStatus()),
          });
        }
        if (url.pathname === '/memory/graph' && (init?.method ?? 'GET') === 'GET') {
          return Response.json({
            ok: true,
            backend: 'ladybug',
            graph: await service.getGraphSummary(),
          });
        }
        if (url.pathname === '/memory/semantic/search' && init?.method === 'POST') {
          const body = JSON.parse(String(init.body ?? '{}')) as {
            embedding?: unknown;
            limit?: unknown;
            scopeKey?: unknown;
          };
          return Response.json({
            ok: true,
            backend: 'ladybug',
            matches: await service.querySemanticVectors(
              String(body.scopeKey ?? ''),
              Array.isArray(body.embedding)
                ? body.embedding.filter(
                    (value): value is number => typeof value === 'number' && Number.isFinite(value),
                  )
                : [],
              Math.max(1, Math.min(20, Math.trunc(Number(body.limit) || 4))),
            ),
            scopeKey: String(body.scopeKey ?? ''),
          });
        }
        if (url.pathname === '/ai/poml/render' && init?.method === 'POST') {
          const body = JSON.parse(String(init.body ?? '{}')) as { variables?: unknown };
          return Response.json({
            messages: await renderYourWifeyPomlMessages(
              body.variables && typeof body.variables === 'object'
                ? (body.variables as Record<string, string>)
                : {},
            ),
            ok: true,
          });
        }
        return Response.json({ ok: false, error: `Unhandled test route ${url.pathname}` }, { status: 404 });
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await service?.close();
    service = null;
    await rm(dbPath, { force: true }).catch(() => undefined);
    await rm(`${dbPath}.wal`, { force: true }).catch(() => undefined);
  });

  it('loads Ladybug Grillo, relationship, and vector memory into the final POML prompt', async () => {
    const scopeKey = 'local:persona:hikari-pipeline';
    await service?.saveGrilloState(scopeKey, {
      blocks: [
        {
          blockId: 'pipeline-block',
          blockName: 'preferences',
          createdAt: 2,
          items: ['Subby prefers persistent Ladybug memory over browser-only memory.'],
          participantKey: 'local:local:subby',
          scopeKey,
          sourceCandidateIds: ['pipeline-candidate'],
          updatedAt: 3,
        },
      ],
      candidates: [
        {
          candidateId: 'pipeline-candidate',
          confidence: 0.96,
          content: 'Subby wants Ladybug memory to back the worker and prompt.',
          createdAt: 1,
          participantKey: 'local:local:subby',
          scopeKey,
          source: 'local',
          sourceTurnIds: ['turn-pipeline'],
          summary: 'Subby wants Ladybug-backed memory.',
          type: 'goal',
        },
      ],
      diaryEntries: [
        {
          beatType: 'relationship',
          createdAt: 4,
          diaryId: 'pipeline-diary',
          emotions: [{ intensity: 6, name: 'focused' }],
          participantKey: 'local:local:subby',
          personalThought: 'I felt focused because Subby wanted proof that memory reaches the prompt.',
          scopeKey,
          sourceTurnIds: ['turn-pipeline'],
          summary: 'Subby asked for real memory pipeline proof.',
          tags: ['ladybug', 'memory'],
        },
      ],
      emotionState: {
        intensities: { focused: 6 },
        lastSignalAt: 5,
        lastSignalSource: 'diary:pipeline-diary',
        updatedAt: 5,
      },
      promotedCandidateIds: ['pipeline-candidate'],
      scopeKey,
      updatedAt: 5,
      version: 1,
    });
    await service?.saveRelationshipProfiles({
      [scopeKey]: {
        ...createDefaultRelationshipMemory(),
        facts: ['Subby wants Ladybug-backed memory.'],
        mood: 'focused',
        relationshipStage: 'familiar',
        summary: 'Subby is verifying the full memory pipeline.',
        trust: 7,
      },
    });
    await service?.saveSemanticRecords(scopeKey, [
      {
        assistantText: 'I will keep vector recall in the prompt.',
        createdAt: 6,
        embedding: [1, 0, 0],
        id: 'pipeline-semantic',
        personaId: 'hikari-pipeline',
        scopeKey,
        text: 'User: remember Ladybug vector recall reaches the prompt\nHikari: I will keep vector recall in the prompt.',
        userText: 'remember Ladybug vector recall reaches the prompt',
      },
    ]);

    const relationshipMemories = await loadLadybugRelationshipMemories();
    const grilloMemory = await buildGrilloMemoryPromptAdditionsAsync({
      participantKeys: ['local:local:subby'],
      query: 'does Ladybug vector recall reach the prompt?',
      scopeKey,
    });
    const semanticMemoryContext = buildSemanticMemoryContext(
      await findSemanticMemoryMatches(scopeKey, 'Ladybug vector recall prompt', [1, 0, 0]),
    );
    const messages = await buildChatCompletionMessages({
      grilloMemory,
      history: [],
      persona: { ...DEFAULT_PERSONA, id: 'hikari-pipeline', name: 'Hikari' },
      relationshipMemory: relationshipMemories?.[scopeKey] ?? createDefaultRelationshipMemory(),
      semanticMemoryContext,
      turnContext: {
        conversationScope: 'local-chat',
        currentTurnText: 'Prove the full memory pipeline.',
        displayName: 'Subby',
        source: 'local',
        stateKey: scopeKey,
      },
    });

    const systemPrompt = messages[0]?.content ?? '';
    expect(systemPrompt).toContain('relationship_stage: familiar');
    expect(systemPrompt).toContain('relationship_mood: focused');
    expect(systemPrompt).toContain('Subby is verifying the full memory pipeline.');
    expect(systemPrompt).toContain('Subby wants Ladybug-backed memory.');
    expect(systemPrompt).toContain('Subby asked for real memory pipeline proof.');
    expect(systemPrompt).toContain('Ladybug vector recall reaches the prompt');
    expect(systemPrompt).toContain('"stateKey":"local:persona:hikari-pipeline"');
    expect(systemPrompt).toContain('semanticMemory":"present');
  });

  it('injects scoped Ladybug memory for local and Twitch prompts without cross-scope bleed', async () => {
    const localScope = 'local:persona:hikari-scope-test';
    const twitchScope = 'twitch:subsect:persona:hikari-scope-test';

    await service?.saveGrilloState(localScope, {
      blocks: [
        {
          blockId: 'local-block',
          blockName: 'preferences',
          createdAt: 2,
          items: ['Local Subby only wants desktop memory context.'],
          participantKey: 'local:local:subby',
          scopeKey: localScope,
          sourceCandidateIds: [],
          updatedAt: 3,
        },
      ],
      candidates: [],
      diaryEntries: [
        {
          beatType: 'relationship',
          createdAt: 4,
          diaryId: 'local-diary',
          emotions: [{ intensity: 4, name: 'focused' }],
          participantKey: 'local:local:subby',
          personalThought: 'I remembered the local-only memory preference.',
          scopeKey: localScope,
          sourceTurnIds: [],
          summary: 'Local Subby asked for desktop memory proof.',
          tags: ['local'],
        },
      ],
      emotionState: {
        intensities: { focused: 4 },
        lastSignalAt: 4,
        lastSignalSource: 'local-diary',
        updatedAt: 4,
      },
      promotedCandidateIds: [],
      scopeKey: localScope,
      updatedAt: 4,
      version: 1,
    });
    await service?.saveGrilloState(twitchScope, {
      blocks: [
        {
          blockId: 'twitch-block',
          blockName: 'viewer_context',
          createdAt: 2,
          items: ['Twitch viewer Rayen only wants stream-aware memory context.'],
          participantKey: 'twitch:subsect:rayen',
          scopeKey: twitchScope,
          sourceCandidateIds: [],
          updatedAt: 3,
        },
      ],
      candidates: [],
      diaryEntries: [
        {
          beatType: 'relationship',
          createdAt: 4,
          diaryId: 'twitch-diary',
          emotions: [{ intensity: 5, name: 'curious' }],
          participantKey: 'twitch:subsect:rayen',
          personalThought: 'I remembered the Twitch stream context preference.',
          scopeKey: twitchScope,
          sourceTurnIds: [],
          summary: 'Rayen asked for Twitch memory proof.',
          tags: ['twitch'],
        },
      ],
      emotionState: {
        intensities: { curious: 5 },
        lastSignalAt: 4,
        lastSignalSource: 'twitch-diary',
        updatedAt: 4,
      },
      promotedCandidateIds: [],
      scopeKey: twitchScope,
      updatedAt: 4,
      version: 1,
    });
    await service?.saveRelationshipProfiles({
      [localScope]: {
        ...createDefaultRelationshipMemory(),
        facts: ['Local Subby prefers desktop memory.'],
        mood: 'focused',
        relationshipStage: 'familiar',
        summary: 'Local scope memory belongs to desktop chat.',
        trust: 8,
      },
      [twitchScope]: {
        ...createDefaultRelationshipMemory(),
        facts: ['Rayen prefers Twitch stream memory.'],
        mood: 'curious',
        relationshipStage: 'familiar',
        summary: 'Twitch scope memory belongs to stream chat.',
        trust: 6,
      },
    });
    await service?.saveSemanticRecords(localScope, [
      {
        assistantText: 'Local vector acknowledged.',
        createdAt: 6,
        embedding: [1, 0, 0],
        id: 'local-semantic',
        personaId: 'hikari-scope-test',
        scopeKey: localScope,
        text: 'User: local desktop semantic recall\nHikari: Local vector acknowledged.',
        userText: 'local desktop semantic recall',
      },
    ]);
    await service?.saveSemanticRecords(twitchScope, [
      {
        assistantText: 'Twitch vector acknowledged.',
        createdAt: 6,
        embedding: [0, 1, 0],
        id: 'twitch-semantic',
        personaId: 'hikari-scope-test',
        scopeKey: twitchScope,
        text: 'User: Twitch stream semantic recall\nHikari: Twitch vector acknowledged.',
        userText: 'Twitch stream semantic recall',
      },
    ]);

    const relationshipMemories = await loadLadybugRelationshipMemories();
    const localGrilloMemory = await buildGrilloMemoryPromptAdditionsAsync({
      participantKeys: ['local:local:subby'],
      query: 'local desktop memory',
      scopeKey: localScope,
    });
    const twitchGrilloMemory = await buildGrilloMemoryPromptAdditionsAsync({
      participantKeys: ['twitch:subsect:rayen'],
      query: 'Twitch stream memory',
      scopeKey: twitchScope,
    });
    const localSemanticMemoryContext = buildSemanticMemoryContext(
      await findSemanticMemoryMatches(localScope, 'local desktop semantic recall', [1, 0, 0]),
    );
    const twitchSemanticMemoryContext = buildSemanticMemoryContext(
      await findSemanticMemoryMatches(twitchScope, 'Twitch stream semantic recall', [0, 1, 0]),
    );

    const localPrompt = (
      await buildChatCompletionMessages({
        grilloMemory: localGrilloMemory,
        history: [],
        persona: { ...DEFAULT_PERSONA, id: 'hikari-scope-test', name: 'Hikari' },
        relationshipMemory: relationshipMemories?.[localScope] ?? createDefaultRelationshipMemory(),
        semanticMemoryContext: localSemanticMemoryContext,
        turnContext: {
          conversationScope: 'local-chat',
          currentTurnText: 'Use my local memory.',
          displayName: 'Subby',
          source: 'local',
          stateKey: localScope,
        },
      })
    )[0]?.content ?? '';
    const twitchPrompt = (
      await buildChatCompletionMessages({
        grilloMemory: twitchGrilloMemory,
        history: [],
        persona: { ...DEFAULT_PERSONA, id: 'hikari-scope-test', name: 'Hikari' },
        relationshipMemory: relationshipMemories?.[twitchScope] ?? createDefaultRelationshipMemory(),
        semanticMemoryContext: twitchSemanticMemoryContext,
        turnContext: {
          channel: 'subsect',
          conversationScope: 'twitch-chat',
          currentTurnText: 'Use Rayen Twitch memory.',
          displayName: 'Rayen',
          login: 'rayen',
          source: 'twitch',
          stateKey: twitchScope,
        },
      })
    )[0]?.content ?? '';

    expect(localPrompt).toContain('Local scope memory belongs to desktop chat.');
    expect(localPrompt).toContain('Local Subby prefers desktop memory.');
    expect(localPrompt).toContain('Local Subby only wants desktop memory context.');
    expect(localPrompt).toContain('Local Subby asked for desktop memory proof.');
    expect(localPrompt).toContain('local desktop semantic recall');
    expect(localPrompt).toContain('"source":"local"');
    expect(localPrompt).not.toContain('Twitch scope memory belongs to stream chat.');
    expect(localPrompt).not.toContain('Rayen prefers Twitch stream memory.');
    expect(localPrompt).not.toContain('Twitch viewer Rayen only wants stream-aware memory context.');
    expect(localPrompt).not.toContain('Twitch stream semantic recall');

    expect(twitchPrompt).toContain('Twitch scope memory belongs to stream chat.');
    expect(twitchPrompt).toContain('Rayen prefers Twitch stream memory.');
    expect(twitchPrompt).toContain('Twitch viewer Rayen only wants stream-aware memory context.');
    expect(twitchPrompt).toContain('Rayen asked for Twitch memory proof.');
    expect(twitchPrompt).toContain('Twitch stream semantic recall');
    expect(twitchPrompt).toContain('"source":"twitch"');
    expect(twitchPrompt).toContain('"channel":"subsect"');
    expect(twitchPrompt).not.toContain('Local scope memory belongs to desktop chat.');
    expect(twitchPrompt).not.toContain('Local Subby prefers desktop memory.');
    expect(twitchPrompt).not.toContain('Local Subby only wants desktop memory context.');
    expect(twitchPrompt).not.toContain('local desktop semantic recall');
  });

  it('persists memory worker tool writes into Ladybug before the worker pass completes', async () => {
    const scopeKey = 'local:persona:hikari-worker';
    const result = await runGrilloMemoryWorkerLoop({
      complete: async () =>
        JSON.stringify({
          candidate: null,
          diary: null,
          done: false,
          memory: null,
          notes: 'write through Ladybug',
          relationship: null,
          toolCalls: [
            {
              args: {
                confidence: 0.93,
                content: 'Subby wants worker writes to persist through Ladybug first.',
                summary: 'Subby wants Ladybug-first worker writes',
                type: 'goal',
              },
              name: 'core.worker_candidate_write',
            },
            {
              args: {
                personal_thought:
                  'I felt focused because the memory worker had to prove real persistence.',
                summary: 'Subby asked for memory worker persistence proof.',
                tags: ['ladybug', 'worker'],
              },
              name: 'core.worker_diary_write',
            },
            {
              args: {
                text: 'Subby wants archival worker memories stored as Ladybug vectors.',
              },
              name: 'core.worker_memory_insert_archival',
            },
            {
              args: {
                block_name: 'ongoing_topics',
                items: ['Prove worker memory writes persist in Ladybug.'],
                operation: 'merge',
              },
              name: 'core.worker_memory_write',
            },
          ],
        }),
      history: [],
      maxRounds: 1,
      model: 'gpt-test',
      persona: { ...DEFAULT_PERSONA, id: 'hikari-worker', name: 'Hikari' },
      relationshipMemory: createDefaultRelationshipMemory(),
      scopeKey,
      semanticMemory: {
        insert: async (text) => {
          const currentRecords = (await service?.loadSemanticRecords(scopeKey)) ?? [];
          const id = `worker-archival-${currentRecords.length + 1}`;
          await service?.saveSemanticRecords(scopeKey, [
            ...currentRecords,
            {
              assistantText: '',
              createdAt: Date.parse('2026-05-25T10:00:01.000Z'),
              embedding: [1, 0, 0],
              id,
              personaId: 'hikari-worker',
              scopeKey,
              text,
              userText: text,
            },
          ]);
          return { id, ok: true, totalIndexed: currentRecords.length + 1, vectorDims: 3 };
        },
      },
      turns: [
        {
          badges: ['local-controller'],
          channel: 'local',
          displayName: 'Subby',
          id: 'turn-worker',
          isBroadcaster: true,
          isLocal: true,
          isMod: true,
          isTrustedController: true,
          login: 'subby',
          source: 'local',
          text: 'make the memory worker write to Ladybug',
          timestamp: Date.parse('2026-05-25T10:00:00.000Z'),
        },
      ],
    });

    const persisted = (await service?.loadGrilloState(scopeKey)) as {
      blocks?: Array<{ items?: string[] }>;
      candidates?: Array<{ summary?: string }>;
      diaryEntries?: Array<{ summary?: string }>;
    };
    expect(result.sideEffects.candidateIds).toHaveLength(1);
    expect(result.sideEffects.diaryIds).toHaveLength(1);
    expect(result.sideEffects.archivalWrites).toBe(1);
    expect(result.sideEffects.slotWrites).toBe(1);
    expect(result.toolCalls.find((call) => call.name === 'core.worker_memory_insert_archival')?.result)
      .toMatchObject({
        ok: true,
        semantic: { id: 'worker-archival-1', ok: true, totalIndexed: 1, vectorDims: 3 },
      });
    expect(persisted.candidates?.[0]?.summary).toBe('Subby wants Ladybug-first worker writes');
    expect(persisted.diaryEntries?.[0]?.summary).toBe(
      'Subby asked for memory worker persistence proof.',
    );
    expect(persisted.blocks?.some((block) =>
      block.items?.includes('Prove worker memory writes persist in Ladybug.'),
    )).toBe(true);
    await expect(service?.loadSemanticRecords(scopeKey)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'worker-archival-1',
          text: 'Subby wants archival worker memories stored as Ladybug vectors.',
        }),
      ]),
    );
    await expect(service?.querySemanticVectors(scopeKey, [1, 0, 0], 4)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'worker-archival-1',
          text: 'Subby wants archival worker memories stored as Ladybug vectors.',
        }),
      ]),
    );
  });

  it('proves the local and Twitch chat memory path reaches Ladybug graph, vectors, cadence, and prompt injection', async () => {
    const localScope = 'local:persona:hikari-full-audit';
    const twitchScope = 'twitch:subsect:persona:hikari-full-audit';
    const persona = { ...DEFAULT_PERSONA, id: 'hikari-full-audit', name: 'Hikari' };
    const localTurn = createLocalChatTurn({
      displayName: 'Subby',
      id: 'local-audit-turn',
      persona,
      text: 'remember I prefer Ladybug memory first and I need to prove the local memory path.',
      timestamp: Date.parse('2026-05-25T12:00:00.000Z'),
      trustedController: true,
    });
    const twitchTurn = createTwitchChatTurn(
      {
        badges: ['subscriber'],
        displayName: 'Rayen',
        id: 'twitch-audit-turn',
        isBroadcaster: false,
        isMod: false,
        text: 'remember Twitch chat likes semantic vector recall for stream context.',
        timestamp: Date.parse('2026-05-25T12:00:01.000Z'),
        user: 'rayen',
      },
      'subsect',
      true,
    );
    const pendingCounts: Record<string, number> = {};

    addMemoryAgentPendingChatTurns(pendingCounts, localScope, 1);
    addMemoryAgentPendingChatTurns(pendingCounts, twitchScope, 1);
    await recordGrilloMemoryTurnAsync({
      assistantText: '',
      persona,
      scopeKey: localScope,
      turns: [localTurn],
    });
    await recordGrilloMemoryTurnAsync({
      assistantText: '',
      persona,
      scopeKey: twitchScope,
      turns: [twitchTurn],
    });
    await addSemanticMemoryTurn({
      assistantText: 'Local Ladybug vector memory acknowledged.',
      embedding: [1, 0, 0],
      persona,
      scopeKey: localScope,
      userText: localTurn.text,
    });
    await addSemanticMemoryTurn({
      assistantText: 'Twitch Ladybug vector memory acknowledged.',
      embedding: [0, 1, 0],
      persona,
      scopeKey: twitchScope,
      userText: twitchTurn.text,
    });
    await service?.saveRelationshipProfiles({
      [localScope]: {
        ...createDefaultRelationshipMemory(),
        facts: ['Subby prefers Ladybug memory first.'],
        lastDiaryTurnCount: 0,
        mood: 'focused',
        relationshipStage: 'familiar',
        summary: 'Local chat is auditing Ladybug-first memory.',
        trust: 8,
        turnCount: 1,
      },
      [twitchScope]: {
        ...createDefaultRelationshipMemory(),
        facts: ['Rayen likes semantic vector recall for stream context.'],
        lastDiaryTurnCount: 0,
        mood: 'curious',
        relationshipStage: 'familiar',
        summary: 'Twitch chat is auditing Ladybug stream memory.',
        trust: 6,
        turnCount: 1,
      },
    });

    const localCadence = getMemoryAgentCadenceDecision(pendingCounts, localScope, 1);
    const twitchCadence = getMemoryAgentCadenceDecision(pendingCounts, twitchScope, 1);
    const status = await service?.getStatus();
    const graph = await service?.getGraphSummary();
    const relationshipMemories = await loadLadybugRelationshipMemories();
    const localGrilloMemory = await buildGrilloMemoryPromptAdditionsAsync({
      participantKeys: ['local:local:subby'],
      query: 'Ladybug memory local path',
      scopeKey: localScope,
    });
    const twitchGrilloMemory = await buildGrilloMemoryPromptAdditionsAsync({
      participantKeys: ['twitch:subsect:rayen'],
      query: 'Twitch semantic vector recall stream context',
      scopeKey: twitchScope,
    });
    const localSemanticMemoryContext = buildSemanticMemoryContext(
      await findSemanticMemoryMatches(localScope, 'Ladybug memory local path', [1, 0, 0]),
    );
    const twitchSemanticMemoryContext = buildSemanticMemoryContext(
      await findSemanticMemoryMatches(twitchScope, 'Twitch semantic vector stream context', [0, 1, 0]),
    );

    const localPrompt = (
      await buildChatCompletionMessages({
        grilloMemory: localGrilloMemory,
        history: [],
        persona,
        relationshipMemory: relationshipMemories?.[localScope] ?? createDefaultRelationshipMemory(),
        semanticMemoryContext: localSemanticMemoryContext,
        turnContext: {
          conversationScope: 'local-chat',
          currentTurnText: 'Use the local Ladybug audit memory.',
          displayName: 'Subby',
          source: 'local',
          stateKey: localScope,
        },
      })
    )[0]?.content ?? '';
    const twitchPrompt = (
      await buildChatCompletionMessages({
        grilloMemory: twitchGrilloMemory,
        history: [],
        persona,
        relationshipMemory: relationshipMemories?.[twitchScope] ?? createDefaultRelationshipMemory(),
        semanticMemoryContext: twitchSemanticMemoryContext,
        turnContext: {
          channel: 'subsect',
          conversationScope: 'twitch-chat',
          currentTurnText: 'Use the Twitch Ladybug audit memory.',
          displayName: 'Rayen',
          firstTimeChatter: true,
          login: 'rayen',
          source: 'twitch',
          stateKey: twitchScope,
        },
      })
    )[0]?.content ?? '';
    const graphText = JSON.stringify(graph);

    expect(localCadence).toMatchObject({ pendingCount: 1, shouldQueue: true });
    expect(twitchCadence).toMatchObject({ pendingCount: 1, shouldQueue: true });
    expect(status).toMatchObject({
      backend: 'ladybug',
      participants: 2,
      relationshipProfiles: 2,
      semanticRecords: 2,
      semanticVectors: 2,
    });
    expect(status?.candidates).toBeGreaterThanOrEqual(2);
    expect(graphText).toContain(localScope);
    expect(graphText).toContain(twitchScope);
    expect(graphText).toContain('Subby asked me to remember');
    expect(graphText).toContain('Rayen asked me to remember');
    expect(graphText).toContain('Subby prefers Ladybug memory first.');
    expect(graphText).toContain('Rayen likes semantic vector recall for stream context.');
    expect(localPrompt).toContain('Local chat is auditing Ladybug-first memory.');
    expect(localPrompt).toContain('Subby prefers Ladybug memory first.');
    expect(localPrompt).toContain('Ladybug vector memory acknowledged.');
    expect(localPrompt).toContain('"source":"local"');
    expect(localPrompt).not.toContain('Twitch chat is auditing Ladybug stream memory.');
    expect(localPrompt).not.toContain('Rayen likes semantic vector recall for stream context.');
    expect(twitchPrompt).toContain('Twitch chat is auditing Ladybug stream memory.');
    expect(twitchPrompt).toContain('Rayen likes semantic vector recall for stream context.');
    expect(twitchPrompt).toContain('Twitch Ladybug vector memory acknowledged.');
    expect(twitchPrompt).toContain('"source":"twitch"');
    expect(twitchPrompt).toContain('"firstTimeChatter":true');
    expect(twitchPrompt).not.toContain('Local chat is auditing Ladybug-first memory.');
    expect(twitchPrompt).not.toContain('Subby prefers Ladybug memory first.');
  });
});
