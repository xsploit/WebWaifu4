import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderYourWifeyPomlMessages } from '../../../server/src/ai/PomlRenderer';
import { LadybugMemoryService } from '../../../server/src/memory/LadybugMemoryService';
import { createDefaultRelationshipMemory, DEFAULT_PERSONA } from './defaults';
import { buildGrilloMemoryPromptAdditionsAsync } from './grillo-memory';
import { loadLadybugRelationshipMemories } from './ladybug-memory-client';
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
});
