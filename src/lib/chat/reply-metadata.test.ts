import { describe, expect, it, vi } from 'vitest';
import type { AnimationEntry } from '../menu/types';
import { DEFAULT_ANIMATIONS } from '../vrm/sequencer';
import {
  ASSISTANT_REPLY_META_CLOSE,
  ASSISTANT_REPLY_META_OPEN,
  buildAnimationCatalogInstruction,
  resolveAnimationIndexForReplyMetadata,
  resolveFacialExpressionForReplyMetadata,
  resolveFacialExpressionIntensityForReplyMetadata,
  stripAssistantReplyMetadata,
} from './reply-metadata';

describe('assistant reply metadata', () => {
  it('parses facial expression metadata without leaking it into spoken text', () => {
    const parsed = stripAssistantReplyMetadata(
      `Nice one.${ASSISTANT_REPLY_META_OPEN}{"emotion":"amused","expression":"happy","motion":"laugh","purpose":"emotion","intensity":"medium","animation":""}${ASSISTANT_REPLY_META_CLOSE}`,
    );

    expect(parsed.text).toBe('Nice one.');
    expect(parsed.metadata).toMatchObject({
      emotion: 'amused',
      expression: 'happy',
      intensity: 'medium',
      motion: 'laugh',
      purpose: 'emotion',
    });
    expect(resolveFacialExpressionForReplyMetadata(parsed.metadata)).toBe('happy');
    expect(resolveFacialExpressionIntensityForReplyMetadata(parsed.metadata)).toBeGreaterThan(0.5);
  });

  it('infers a face from legacy metadata that only had emotion', () => {
    const parsed = stripAssistantReplyMetadata(
      `${ASSISTANT_REPLY_META_OPEN}{"emotion":"annoyed","motion":"annoyed","purpose":"emotion","intensity":"low","animation":""}${ASSISTANT_REPLY_META_CLOSE}`,
    );

    expect(parsed.metadata?.expression).toBe('angry');
    expect(resolveFacialExpressionForReplyMetadata(parsed.metadata)).toBe('angry');
  });

  it('accepts first-class angry metadata and maps it to angry face', () => {
    const parsed = stripAssistantReplyMetadata(
      `${ASSISTANT_REPLY_META_OPEN}{"emotion":"angry","motion":"angry","purpose":"emotion","intensity":"high","animation":""}${ASSISTANT_REPLY_META_CLOSE}`,
    );

    expect(parsed.metadata).toMatchObject({
      emotion: 'angry',
      expression: 'angry',
      motion: 'angry',
      purpose: 'emotion',
    });
    expect(resolveFacialExpressionForReplyMetadata(parsed.metadata)).toBe('angry');
  });

  it('maps emotional metadata to enabled emotion animations', () => {
    const playlist: AnimationEntry[] = [
      {
        enabled: true,
        experimental: false,
        format: 'vrma',
        id: 'ambient-idle',
        name: 'Ambient idle',
        purpose: 'ambient',
        url: '/idle.vrma',
      },
      {
        enabled: true,
        experimental: false,
        format: 'vrma',
        id: 'sachi-gratitude',
        name: 'Sachi gratitude',
        purpose: 'emotion',
        tags: ['gratitude', 'caring'],
        url: '/gratitude.vrma',
      },
    ];

    expect(
      resolveAnimationIndexForReplyMetadata(
        {
          animation: '',
          emotion: 'grateful',
          expression: 'caring',
          intensity: 'medium',
          motion: 'react',
          purpose: 'emotion',
        },
        playlist,
      ),
    ).toBe(1);
  });

  it('maps every supported emotion to an equivalent enabled animation when the catalog has one', () => {
    const emotionCases = [
      ['amused', 'happy', ['amusement', 'happy', 'joy']],
      ['happy', 'happy', ['happy', 'joy']],
      ['excited', 'happy', ['excitement', 'happy']],
      ['curious', 'thinking', ['curiosity', 'thinking']],
      ['confused', 'confused', ['confusion', 'curiosity']],
      ['thinking', 'thinking', ['thinking', 'hima', 'waiting']],
      ['surprised', 'surprised', ['surprise', 'attention']],
      ['angry', 'angry', ['anger', 'annoyance', 'disapproval']],
      ['annoyed', 'angry', ['annoyance', 'anger', 'disapproval']],
      ['embarrassed', 'embarrassed', ['embarrassment', 'nervous']],
      ['grateful', 'caring', ['gratitude', 'approval', 'caring']],
      ['optimistic', 'happy', ['optimism', 'approval']],
      ['proud', 'happy', ['pride', 'approval']],
      ['nervous', 'embarrassed', ['nervous', 'nervousness', 'embarrassment']],
      ['sad', 'sad', ['sadness', 'disappointment']],
      ['caring', 'caring', ['caring', 'approval', 'gratitude']],
    ] as const;
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.42);

    try {
      for (const [emotion, expression, expectedKeywords] of emotionCases) {
        const index = resolveAnimationIndexForReplyMetadata(
          {
            animation: '',
            emotion,
            expression,
            intensity: 'medium',
            motion: emotion,
            purpose: 'emotion',
          },
          DEFAULT_ANIMATIONS,
        );
        const selected = DEFAULT_ANIMATIONS[index];
        const haystack =
          `${selected?.id ?? ''} ${selected?.name ?? ''} ${(selected?.tags ?? []).join(' ')}`.toLowerCase();

        expect(index, emotion).toBeGreaterThanOrEqual(0);
        expect(selected?.enabled, emotion).toBe(true);
        expect(selected?.purpose, emotion).not.toBe('movement');
        expect(selected?.purpose, emotion).not.toBe('pose');
        expect(
          expectedKeywords.some((keyword) => haystack.includes(keyword)),
          `${emotion} selected ${selected?.id}`,
        ).toBe(true);
      }
    } finally {
      random.mockRestore();
    }
  });

  it('does not advertise or select disabled animation entries', () => {
    const playlist: AnimationEntry[] = [
      {
        enabled: false,
        experimental: false,
        format: 'vrma',
        id: 'disabled-gratitude',
        name: 'Disabled gratitude',
        purpose: 'emotion',
        tags: ['gratitude'],
        url: '/disabled.vrma',
      },
      {
        enabled: true,
        experimental: false,
        format: 'vrma',
        id: 'enabled-caring',
        name: 'Enabled caring reaction',
        purpose: 'emotion',
        tags: ['caring', 'gratitude'],
        url: '/enabled.vrma',
      },
    ];

    expect(buildAnimationCatalogInstruction(playlist)).not.toContain('disabled-gratitude');
    expect(
      resolveAnimationIndexForReplyMetadata(
        {
          animation: 'disabled-gratitude',
          emotion: 'grateful',
          expression: 'caring',
          intensity: 'low',
          motion: 'react',
          purpose: 'emotion',
        },
        playlist,
      ),
    ).toBe(1);
  });
});
