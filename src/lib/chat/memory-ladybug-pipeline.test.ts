import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderYourWifeyPomlMessages } from '../../../server/src/ai/PomlRenderer';
import { LadybugMemoryService } from '../../../server/src/memory/LadybugMemoryService';
import { createDefaultRelationshipMemory, DEFAULT_PERSONA } from './defaults';
import { buildGrilloMemoryPromptAdditionsAsync } from './grillo-memory';
import { loadLadybugRelationshipMemories } from './ladybug-memory-client';
import { runGrilloMemoryWorkerLoop } from './grillo-memory-loop';
import { buildSemanticMemoryContext, findSemanticMemoryMatches } from './semantic-memory';
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
        if (url.pathname === '/memory/relationships' && (init?.method ?? 'GET') === 'GET') {
          return Response.json({
            ok: true,
            backend: 'ladybug',
            profiles: await service.loadRelationshipProfiles(),
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
    expect(result.sideEffects.slotWrites).toBe(1);
    expect(persisted.candidates?.[0]?.summary).toBe('Subby wants Ladybug-first worker writes');
    expect(persisted.diaryEntries?.[0]?.summary).toBe(
      'Subby asked for memory worker persistence proof.',
    );
    expect(persisted.blocks?.some((block) =>
      block.items?.includes('Prove worker memory writes persist in Ladybug.'),
    )).toBe(true);
  });
});
