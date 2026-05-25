import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderYourWifeyPomlMessages } from '../../../server/src/ai/PomlRenderer';
import { createDefaultRelationshipMemory, DEFAULT_PERSONA } from './defaults';

const mockedLadybug = vi.hoisted(() => ({
  grilloState: null as unknown,
  semanticRecords: [] as unknown[],
}));

vi.mock('./ladybug-memory-client', () => ({
  canUseLadybugMemoryBackend: () => true,
  deleteLadybugGrilloState: vi.fn(async () => true),
  loadLadybugGrilloState: vi.fn(async () => mockedLadybug.grilloState),
  loadLadybugMemoryGraph: vi.fn(async () => null),
  loadLadybugMemoryStatus: vi.fn(async () => null),
  loadLadybugSemanticMemory: vi.fn(async () => mockedLadybug.semanticRecords),
  saveLadybugGrilloState: vi.fn(async () => true),
  saveLadybugSemanticMemory: vi.fn(async () => true),
  searchLadybugSemanticMemory: vi.fn(async () => undefined),
}));

import { buildGrilloMemoryPromptAdditionsAsync } from './grillo-memory';
import {
  buildSemanticMemoryContext,
  findSemanticMemoryMatches,
} from './semantic-memory';
import { buildChatCompletionMessages } from './prompt';

describe('memory backend prompt parity', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as { variables?: unknown };
        return Response.json({
          messages: await renderYourWifeyPomlMessages(
            body.variables && typeof body.variables === 'object'
              ? (body.variables as Record<string, string>)
              : {},
          ),
          ok: true,
        });
      }),
    );

    mockedLadybug.grilloState = {
      blocks: [
        {
          blockId: 'block-fast-tts',
          blockName: 'preferences',
          createdAt: 2,
          items: ['Subby prefers fast TTS and low first-audio latency.'],
          participantKey: 'local:local:subby',
          scopeKey: 'local:persona:hikari-chan',
          sourceCandidateIds: ['candidate-fast-tts'],
          updatedAt: 3,
        },
      ],
      candidates: [
        {
          candidateId: 'candidate-fast-tts',
          confidence: 0.95,
          content: 'Subby prefers fast TTS and low first-audio latency.',
          createdAt: 1,
          participantKey: 'local:local:subby',
          scopeKey: 'local:persona:hikari-chan',
          source: 'local',
          sourceTurnIds: ['turn-1'],
          summary: 'Subby prefers fast TTS.',
          type: 'preference',
        },
      ],
      diaryEntries: [
        {
          beatType: 'relationship',
          createdAt: 4,
          diaryId: 'diary-fast-tts',
          emotions: [{ intensity: 5, name: 'focused' }],
          participantKey: 'local:local:subby',
          personalThought: 'Latency matters to Subby, so I should keep replies streamable.',
          scopeKey: 'local:persona:hikari-chan',
          sourceTurnIds: ['turn-1'],
          summary: 'Subby pushed for a faster voice pipeline.',
          tags: ['tts', 'latency'],
        },
      ],
      emotionState: { intensities: {}, updatedAt: 0 },
      promotedCandidateIds: ['candidate-fast-tts'],
      scopeKey: 'local:persona:hikari-chan',
      updatedAt: 5,
      version: 1,
    };
    mockedLadybug.semanticRecords = [
      {
        assistantText: 'I will keep the first chunk fast.',
        createdAt: 6,
        embedding: [1, 0],
        id: 'semantic-fast-tts',
        personaId: 'hikari-chan',
        scopeKey: 'local:persona:hikari-chan',
        text: 'User: remember fast TTS latency\nHikari-chan: I will keep the first chunk fast.',
        userText: 'remember fast TTS latency',
      },
    ];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('injects Ladybug-backed Grillo and semantic records into the same prompt lanes', async () => {
    const scopeKey = 'local:persona:hikari-chan';
    const grilloMemory = await buildGrilloMemoryPromptAdditionsAsync({
      participantKeys: ['local:local:subby'],
      query: 'what should you remember about TTS latency?',
      scopeKey,
    });
    const semanticMemoryContext = buildSemanticMemoryContext(
      await findSemanticMemoryMatches(scopeKey, 'TTS latency', [1, 0]),
    );

    const messages = await buildChatCompletionMessages({
      grilloMemory,
      history: [],
      persona: { ...DEFAULT_PERSONA, id: 'hikari-chan', name: 'Hikari-chan' },
      relationshipMemory: createDefaultRelationshipMemory(),
      semanticMemoryContext,
      turnContext: {
        conversationScope: 'local-chat',
        currentTurnText: 'Do you remember what I care about for voice?',
        displayName: 'Subby',
        source: 'local',
        stateKey: scopeKey,
      },
      ttsProvider: 'fish-speech',
    });

    const systemPrompt = messages[0]?.content ?? '';
    expect(systemPrompt).toContain('## relationship_memory');
    expect(systemPrompt).toContain('Subby prefers fast TTS and low first-audio latency.');
    expect(systemPrompt).toContain('## recalled_memories');
    expect(systemPrompt).toContain('Subby pushed for a faster voice pipeline.');
    expect(systemPrompt).toContain('User: remember fast TTS latency');
    expect(systemPrompt).toContain('"stateKey":"local:persona:hikari-chan"');
  });
});
