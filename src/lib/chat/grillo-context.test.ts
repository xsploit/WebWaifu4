import { describe, expect, it } from 'vitest';
import { createDefaultRelationshipMemory, DEFAULT_PERSONA } from './defaults';
import {
  buildGrilloContextPromptBlock,
  buildGrilloContextSections,
  reduceGrilloContextBudget,
} from './grillo-context';
import type { ChatTurn } from './chat-turn';

function createTurn(overrides: Partial<ChatTurn> = {}): ChatTurn {
  return {
    id: overrides.id ?? 'turn-1',
    source: overrides.source ?? 'twitch',
    channel: overrides.channel ?? 'subsect',
    login: overrides.login ?? 'viewer',
    displayName: overrides.displayName ?? 'Viewer',
    text: overrides.text ?? '@Hikari remember this chat lane',
    timestamp: overrides.timestamp ?? Date.parse('2026-05-13T09:00:00.000Z'),
    badges: overrides.badges ?? [],
    isMod: overrides.isMod ?? false,
    isBroadcaster: overrides.isBroadcaster ?? false,
    isLocal: overrides.isLocal ?? false,
    isTrustedController: overrides.isTrustedController ?? false,
    firstTimeChatter: overrides.firstTimeChatter,
  };
}

describe('Grillo context packet', () => {
  it('separates Twitch transcript, relationship memory, recalled memory, and diary lanes', () => {
    const sections = buildGrilloContextSections({
      channelHistory: [
        createTurn({ displayName: 'Subsect', login: 'subsect', isBroadcaster: true }),
        createTurn({ displayName: 'OtherViewer', login: 'other', text: 'that was funny' }),
      ],
      currentTurnText: 'Twitch viewer Subsect: @Hikari remember this chat lane',
      diaryContext: 'Latest private note: she felt proud after fixing Twitch chat.',
      memoryAdditions: {
        diaryThoughts: ['2026-05-13 I noticed the stream owner cares about scoped memory.'],
        recalledMemories: [
          { text: '[candidate:fact twitch/subsect] Subsect likes POML', score: 0.9 },
        ],
        relationshipMemory: ['[twitch:subsect:subsect preferences] Subsect likes scoped memory'],
      },
      persona: { ...DEFAULT_PERSONA, name: 'Hikari', userNickname: 'Subby' },
      relationshipMemory: {
        ...createDefaultRelationshipMemory(),
        facts: ['likes scoped memory'],
        mood: 'teasing',
        summary: 'Subsect wants Twitch-first context.',
        turnCount: 12,
      },
      semanticMemoryContext: '1. Prior note: use separate state per Twitch channel.',
      turnContext: {
        channel: 'subsect',
        conversationScope: 'twitch-chat',
        displayName: 'Subsect',
        source: 'twitch',
      },
    });

    expect(sections.background_information).toContain('interface_path: twitch/subsect');
    expect(sections.background_information.join('\n')).not.toContain('host_context');
    expect(sections.instructions.join('\n')).toContain('Use channel_history as transcript');
    expect(sections.channel_history.join('\n')).toContain('OtherViewer: that was funny');
    expect(sections.relationship_memory.join('\n')).not.toContain('turns=12');
    expect(sections.relationship_memory.join('\n')).toContain(
      'known_facts=["likes scoped memory"]',
    );
    expect(sections.relationship_memory.join('\n')).toContain(
      '[twitch:subsect:subsect preferences] Subsect likes scoped memory',
    );
    expect(sections.recalled_memories[0]?.text).toContain('separate state per Twitch channel');
    expect(sections.recalled_memories.map((item) => item.text).join('\n')).toContain(
      'Subsect likes POML',
    );
    expect(sections.thoughts.join('\n')).toContain('Latest private note');
    expect(sections.thoughts.join('\n')).toContain('stream owner cares about scoped memory');
  });

  it('renders local chat as a participant path with trusted metadata', () => {
    const promptBlock = buildGrilloContextPromptBlock({
      channelHistory: [
        createTurn({
          badges: ['local-controller'],
          channel: 'local',
          displayName: 'Subby',
          isBroadcaster: true,
          isLocal: true,
          isMod: true,
          isTrustedController: true,
          login: 'subby',
          source: 'local',
          text: '@Hikari this is from the local box',
        }),
      ],
      persona: { ...DEFAULT_PERSONA, name: 'Hikari', userNickname: 'Subby' },
      relationshipMemory: createDefaultRelationshipMemory(),
      turnContext: {
        conversationScope: 'local-chat',
        displayName: 'Subby',
        source: 'local',
      },
    });

    expect(promptBlock).toContain('interface_path: local/subby');
    expect(promptBlock).toContain('local=true');
    expect(promptBlock).toContain('trustedController=true');
    expect(promptBlock).toContain('Local chat is a participant transcript turn');
  });

  it('includes native Ladybug GRILLO context packet lanes in the rendered prompt block', () => {
    const promptBlock = buildGrilloContextPromptBlock({
      memoryAdditions: {
        contextPacket: {
          background_information: ['scope_key: local:persona:hikari'],
          channel_history: ['Subsect: remember native turns'],
          output_description: ['Use native Ladybug GRILLO context.'],
          recalled_memories: [{ score: 0.88, text: '[candidate:goal] native GRILLO packet' }],
          relationship_memory: ['[slot:ongoing_threads] native packets feed POML'],
          thoughts: ['[diary:reflection] native packet reached the prompt'],
        },
      },
      persona: { ...DEFAULT_PERSONA, name: 'Hikari', userNickname: 'Subby' },
      relationshipMemory: createDefaultRelationshipMemory(),
      turnContext: {
        conversationScope: 'local-chat',
        displayName: 'Subby',
        source: 'local',
      },
    });

    expect(promptBlock).toContain('scope_key: local:persona:hikari');
    expect(promptBlock).toContain('Subsect: remember native turns');
    expect(promptBlock).toContain('[slot:ongoing_threads] native packets feed POML');
    expect(promptBlock).toContain('[candidate:goal] native GRILLO packet');
    expect(promptBlock).toContain('[diary:reflection] native packet reached the prompt');
    expect(promptBlock).toContain('Use native Ladybug GRILLO context.');
  });

  it('drops low-scored recalled memories before trimming recent channel history', () => {
    const sections = buildGrilloContextSections({
      channelHistory: Array.from({ length: 8 }, (_, index) =>
        createTurn({
          id: `turn-${index}`,
          text: `message ${index} ${'x'.repeat(120)}`,
          timestamp: Date.parse('2026-05-13T09:00:00.000Z') + index,
        }),
      ),
      persona: DEFAULT_PERSONA,
      relationshipMemory: createDefaultRelationshipMemory(),
      semanticMemoryContext: ['important high score memory', 'low score memory '.repeat(80)].join(
        '\n',
      ),
    });

    const result = reduceGrilloContextBudget(
      sections,
      {
        background_information: 300,
        instructions: 220,
        channel_history: 500,
        relationship_memory: 350,
        recalled_memories: 1000,
        thoughts: 180,
        output_description: 80,
      },
      650,
    );

    expect(result.reductions.some((item) => item.step === 'drop_low_score_memories')).toBe(true);
    expect(result.sections.recalled_memories.map((item) => item.text)).toContain(
      'important high score memory',
    );
  });
});
