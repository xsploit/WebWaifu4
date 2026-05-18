import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatTurn } from './chat-turn';
import { DEFAULT_PERSONA, createDefaultRelationshipMemory } from './defaults';
import { loadGrilloMemoryState } from './grillo-memory';
import {
  GRILLO_WORKER_LOOP_RESPONSE_FORMAT,
  extractGrilloWorkerRelationshipJson,
  runGrilloMemoryWorkerLoop,
  type GrilloWorkerLoopCompletionRequest,
} from './grillo-memory-loop';

function createStorage() {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function createTurn(overrides: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id: overrides.id ?? 'turn-1',
    source: overrides.source ?? 'twitch',
    channel: overrides.channel ?? 'subsect',
    login: overrides.login ?? 'subsect',
    displayName: overrides.displayName ?? 'Subsect',
    text: overrides.text ?? 'remember I like tool loops',
    timestamp: overrides.timestamp ?? Date.parse('2026-05-13T09:00:00.000Z'),
    badges: overrides.badges ?? [],
    isMod: overrides.isMod ?? false,
    isBroadcaster: overrides.isBroadcaster ?? false,
    isLocal: overrides.isLocal ?? false,
    isTrustedController: overrides.isTrustedController ?? false,
    firstTimeChatter: overrides.firstTimeChatter,
  };
}

describe('Grillo memory worker loop', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: createStorage(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('executes tool calls, feeds results back, and finishes with relationship JSON', async () => {
    const requests: GrilloWorkerLoopCompletionRequest[] = [];
    const result = await runGrilloMemoryWorkerLoop({
      complete: async (request) => {
        requests.push(request);
        if (requests.length === 1) {
          return JSON.stringify({
            toolCalls: [{ name: 'core.worker_memory_read', args: {} }],
          });
        }
        return JSON.stringify({
          done: true,
          notes: 'read memory',
          relationship: {
            actionTag: 'compliment',
            attractionDelta: 0,
            facts: ['likes tool loops'],
            guardDelta: 0,
            irritationDelta: 0,
            jealousyDelta: 0,
            mood: 'teasing',
            respectDelta: 1,
            rikoDiaryEntry: 'I noticed they care about real memory tools.',
            summary: 'They want the Grillo worker loop.',
            trustDelta: 1,
          },
        });
      },
      history: [],
      model: 'gpt-test',
      persona: DEFAULT_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      scopeKey: 'twitch:subsect:persona:hikari',
      turns: [createTurn()],
    });

    expect(result.rounds).toBe(2);
    expect(requests[0]?.responseFormat).toEqual(GRILLO_WORKER_LOOP_RESPONSE_FORMAT);
    expect(result.toolCalls[0]?.name).toBe('core.worker_memory_read');
    const secondRequestMessages = requests[1]?.messages ?? [];
    expect(secondRequestMessages[secondRequestMessages.length - 2]?.content).toContain(
      'core.worker_memory_read',
    );
    expect(extractGrilloWorkerRelationshipJson(result.finalJsonText)).toContain('likes tool loops');
  });

  it('recovers candidate and diary objects into write tools', async () => {
    const scopeKey = 'twitch:subsect:persona:hikari';
    const result = await runGrilloMemoryWorkerLoop({
      complete: async () =>
        JSON.stringify({
          candidate: {
            confidence: 0.92,
            content: 'Subsect likes full Grillo memory.',
            summary: 'Subsect likes full Grillo memory',
            type: 'preference',
          },
          diary: {
            personal_thought: 'I noticed they want the memory loop to actually act.',
            summary: 'Subsect corrected the implementation target.',
            tags: ['grillo', 'memory'],
          },
          done: true,
          relationship: {
            actionTag: 'challenge',
            facts: ['likes full Grillo memory'],
            mood: 'curious',
            rikoDiaryEntry: 'I noticed they corrected the target.',
            summary: 'They want a true Grillo worker loop.',
          },
        }),
      history: [],
      model: 'gpt-test',
      persona: DEFAULT_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      scopeKey,
      turns: [createTurn()],
    });

    const state = loadGrilloMemoryState(scopeKey);
    expect(result.sideEffects.candidateIds).toHaveLength(1);
    expect(result.sideEffects.diaryIds).toHaveLength(1);
    expect(state.candidates[0]?.summary).toContain('full Grillo memory');
    expect(state.diaryEntries[0]?.personalThought).toContain('actually act');
  });

  it('persists enriched diary fields from the original Grillo worker contract', async () => {
    const scopeKey = 'local:persona:hikari';
    await runGrilloMemoryWorkerLoop({
      complete: async () =>
        JSON.stringify({
          candidate: null,
          diary: {
            content: 'sup',
            context_tags: ['greeting', 'vibe'],
            emotions: [{ intensity: 7, name: 'happy' }],
            interaction_summary: 'Casual greeting exchange.',
            involved_users: ['Subby'],
            personal_thought: 'I felt relaxed because Subby opened with an easy greeting.',
            summary: 'Subby greeted casually.',
            tags: ['chat_interaction', 'casual'],
            user_message: 'yo',
            beat_type: 'chat_interaction',
          },
          done: true,
          relationship: null,
        }),
      history: [],
      model: 'gpt-test',
      persona: DEFAULT_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      scopeKey,
      turns: [
        createTurn({
          channel: 'local',
          displayName: 'Subby',
          isLocal: true,
          login: 'subby',
          source: 'local',
          text: 'yo',
        }),
      ],
    });

    const state = loadGrilloMemoryState(scopeKey);
    expect(state.diaryEntries).toHaveLength(1);
    expect(state.diaryEntries[0]).toMatchObject({
      beatType: 'chat_interaction',
      content: 'sup',
      contextTags: ['greeting', 'vibe'],
      interactionSummary: 'Casual greeting exchange.',
      involvedUsers: ['Subby'],
      personalThought: 'I felt relaxed because Subby opened with an easy greeting.',
      summary: 'Subby greeted casually.',
      userMessage: 'yo',
    });
    expect(state.diaryEntries[0]?.emotions?.[0]).toEqual({ intensity: 7, name: 'happy' });
    expect(state.emotionState.intensities.happy).toBeGreaterThan(0);
  });

  it('writes consolidated memory blocks through worker_memory_write', async () => {
    const scopeKey = 'local:persona:hikari';
    const result = await runGrilloMemoryWorkerLoop({
      complete: async () =>
        JSON.stringify({
          toolCalls: [
            {
              args: {
                block_name: 'ongoing_topics',
                items: ['Implement Grillo background worker loop'],
                operation: 'merge',
              },
              name: 'core.worker_memory_write',
            },
          ],
        }),
      history: [],
      maxRounds: 1,
      model: 'gpt-test',
      persona: DEFAULT_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      scopeKey,
      turns: [
        createTurn({
          channel: 'local',
          displayName: 'Subby',
          isLocal: true,
          login: 'subby',
          source: 'local',
        }),
      ],
    });

    const state = loadGrilloMemoryState(scopeKey);
    expect(result.sideEffects.slotWrites).toBe(1);
    expect(state.blocks[0]?.blockName).toBe('ongoing_topics');
    expect(state.blocks[0]?.items).toContain('Implement Grillo background worker loop');
  });

  it('accepts OpenAI-style function tool calls with JSON string arguments', async () => {
    const scopeKey = 'twitch:subsect:persona:hikari';
    const result = await runGrilloMemoryWorkerLoop({
      complete: async () =>
        JSON.stringify({
          candidate: null,
          diary: null,
          done: false,
          memory: null,
          notes: 'writing candidate through function style tool_calls',
          relationship: null,
          toolCalls: [],
          tool_calls: [
            {
              function: {
                arguments: JSON.stringify({
                  confidence: 0.91,
                  content: 'Subsect wants an agentic JSON tool loop for memory.',
                  summary: 'Subsect wants agentic memory tools',
                  tags: ['grillo', 'tool-loop'],
                  type: 'goal',
                }),
                name: 'core.worker_candidate_write',
              },
              type: 'function',
            },
          ],
        }),
      history: [],
      maxRounds: 1,
      model: 'gpt-test',
      persona: DEFAULT_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      scopeKey,
      turns: [createTurn()],
    });

    const state = loadGrilloMemoryState(scopeKey);
    expect(result.sideEffects.candidateIds).toHaveLength(1);
    expect(result.toolCalls[0]?.name).toBe('core.worker_candidate_write');
    expect(state.candidates[0]?.summary).toBe('Subsect wants agentic memory tools');
  });
});
