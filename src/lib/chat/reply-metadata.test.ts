import { describe, expect, it } from 'vitest';
import type { AnimationEntry } from '../menu/types';
import { DEFAULT_ANIMATIONS } from '../vrm/sequencer';
import {
  ASSISTANT_REPLY_META_CLOSE,
  ASSISTANT_REPLY_META_OPEN,
  ASSISTANT_REPLY_JSON_FORMAT,
  buildAnimationCatalogInstruction,
  buildReplyMetadataInstruction,
  createAssistantMetadataStreamFilter,
  createAssistantReplyStreamFilter,
  resolveAnimationIndexForReplyMetadata,
  resolveFacialExpressionForReplyMetadata,
  resolveFacialExpressionIntensityForReplyMetadata,
  stripAssistantReplyMetadata,
} from './reply-metadata';

describe('assistant reply metadata', () => {
  it('parses emotion-only metadata without leaking it into spoken text', () => {
    const parsed = stripAssistantReplyMetadata(
      `Nice one.${ASSISTANT_REPLY_META_OPEN}{"emotion":"amused"}${ASSISTANT_REPLY_META_CLOSE}`,
    );

    expect(parsed.text).toBe('Nice one.');
    expect(parsed.metadata).toEqual({ emotion: 'amused' });
    expect(resolveFacialExpressionForReplyMetadata(parsed.metadata)).toBe('happy');
    expect(resolveFacialExpressionIntensityForReplyMetadata(parsed.metadata)).toBeGreaterThan(0.5);
  });

  it('strips accidental hidden block metadata without removing TTS tags', () => {
    const parsed = stripAssistantReplyMetadata(
      'Spend the chaos budget. [pause] Keep it moving. <hidden block>{"emotion":"excited"}</hidden block>',
    );

    expect(parsed.text).toBe('Spend the chaos budget. [pause] Keep it moving.');
    expect(parsed.metadata).toEqual({ emotion: 'excited' });
  });

  it('filters streamed accidental hidden block metadata', () => {
    const filter = createAssistantMetadataStreamFilter();
    const visible = [
      filter.push('Spend the chaos budget. [pause] <hid'),
      filter.push('den block>{"emotion":"happy"}</hidden'),
      filter.push(' block>'),
    ].join('');
    const parsed = filter.finish('Spend the chaos budget. [pause] <hidden block>{"emotion":"happy"}</hidden block>');

    expect(visible).toBe('Spend the chaos budget. [pause] ');
    expect(parsed.text).toBe('Spend the chaos budget. [pause]');
    expect(parsed.metadata).toEqual({ emotion: 'happy' });
  });

  it('ignores old over-specified fields and keeps only emotion', () => {
    const parsed = stripAssistantReplyMetadata(
      `${ASSISTANT_REPLY_META_OPEN}{"emotion":"annoyed","motion":"wave","purpose":"gesture","expression":"happy","animation":"sachi-wave01"}${ASSISTANT_REPLY_META_CLOSE}`,
    );

    expect(parsed.metadata).toEqual({ emotion: 'annoyed' });
    expect(resolveFacialExpressionForReplyMetadata(parsed.metadata)).toBe('angry');
  });

  it('unwraps accidental structured reply envelopes without showing raw JSON', () => {
    const parsed = stripAssistantReplyMetadata(
      '{"reply":"Quit staring at the wiring, subby. I am awake.","emotion":"annoyed"}',
    );

    expect(parsed.text).toBe('Quit staring at the wiring, subby. I am awake.');
    expect(parsed.metadata).toEqual({ emotion: 'annoyed' });
  });

  it('unwraps fenced structured reply envelopes from fallback providers', () => {
    const parsed = stripAssistantReplyMetadata(
      '```json\n{"message":"Yeah, I heard you that time.","emotion":"happy"}\n```',
    );

    expect(parsed.text).toBe('Yeah, I heard you that time.');
    expect(parsed.metadata).toEqual({ emotion: 'happy' });
  });

  it('defines the strict structured reply schema used by chat providers', () => {
    expect(ASSISTANT_REPLY_JSON_FORMAT).toMatchObject({
      name: 'yourwifey_assistant_reply',
      strict: true,
      type: 'json_schema',
    });
    expect(ASSISTANT_REPLY_JSON_FORMAT.schema).toMatchObject({
      additionalProperties: false,
      required: ['message', 'emotion'],
      type: 'object',
    });
  });

  it('streams only the message field from structured JSON reply chunks', () => {
    const filter = createAssistantReplyStreamFilter();
    const visible = [
      filter.push('{"mess'),
      filter.push('age":"Hey subby, [pause] I\\nheard you.'),
      filter.push('","emotion":"happy"}'),
    ].join('');
    const parsed = filter.finish('{"message":"Hey subby, [pause] I\\nheard you.","emotion":"happy"}');

    expect(visible).toBe('Hey subby, [pause] I\nheard you.');
    expect(parsed.text).toBe('Hey subby, [pause] I\nheard you.');
    expect(parsed.metadata).toEqual({ emotion: 'happy' });
  });

  it('starts streaming structured message text before the message string closes', () => {
    const filter = createAssistantReplyStreamFilter();

    expect(filter.push('{"message":"I')).toBe('I');
    expect(filter.push("'m already live")).toBe("'m already live");
    expect(filter.push('","emotion":"amused"}')).toBe('');

    const parsed = filter.finish(`{"message":"I'm already live","emotion":"amused"}`);
    expect(parsed.text).toBe("I'm already live");
    expect(parsed.metadata).toEqual({ emotion: 'amused' });
  });

  it('does not leak structured JSON when the message field is empty', () => {
    const parsed = stripAssistantReplyMetadata('{"message":"","emotion":"neutral"}');

    expect(parsed.text).toBe('');
    expect(parsed.metadata).toEqual({ emotion: 'neutral' });
  });

  it('keeps legacy streamed metadata fallback working through the combined filter', () => {
    const filter = createAssistantReplyStreamFilter();
    const visible = [
      filter.push('Legacy text. <yw'),
      filter.push('-meta>{"emotion":"sad"}</yw-meta>'),
    ].join('');
    const parsed = filter.finish('Legacy text. <yw-meta>{"emotion":"sad"}</yw-meta>');

    expect(visible).toBe('Legacy text. ');
    expect(parsed.text).toBe('Legacy text.');
    expect(parsed.metadata).toEqual({ emotion: 'sad' });
  });

  it('does not trigger reactions for neutral metadata', () => {
    const playlist: AnimationEntry[] = [
      {
        enabled: true,
        experimental: false,
        format: 'vrma',
        id: 'neutral-idle',
        name: 'Neutral idle',
        purpose: 'ambient',
        tags: ['neutral', 'idle'],
        url: '/idle.vrma',
      },
    ];

    const parsed = stripAssistantReplyMetadata(
      `${ASSISTANT_REPLY_META_OPEN}{"emotion":"neutral"}${ASSISTANT_REPLY_META_CLOSE}`,
    );

    expect(resolveFacialExpressionForReplyMetadata(parsed.metadata)).toBe('neutral');
    expect(resolveFacialExpressionIntensityForReplyMetadata(parsed.metadata)).toBe(0);
    expect(resolveAnimationIndexForReplyMetadata(parsed.metadata, playlist)).toBe(-1);
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

    expect(resolveAnimationIndexForReplyMetadata({ emotion: 'grateful' }, playlist)).toBe(1);
  });

  it('maps every supported emotion to an equivalent enabled animation when the catalog has one', () => {
    const emotionCases = [
      ['amused', ['amusement', 'happy', 'joy']],
      ['happy', ['happy', 'joy']],
      ['excited', ['excitement', 'happy']],
      ['curious', ['curiosity', 'thinking']],
      ['confused', ['confusion', 'curiosity']],
      ['thinking', ['thinking', 'hima', 'waiting']],
      ['surprised', ['surprise', 'attention']],
      ['angry', ['anger', 'annoyance', 'disapproval']],
      ['annoyed', ['annoyance', 'anger', 'disapproval']],
      ['embarrassed', ['embarrassment', 'nervous']],
      ['grateful', ['gratitude', 'approval', 'caring']],
      ['optimistic', ['optimism', 'approval', 'happy']],
      ['proud', ['pride', 'approval', 'happy']],
      ['nervous', ['nervous', 'nervousness', 'embarrassment']],
      ['sad', ['sadness', 'disappointment']],
      ['caring', ['caring', 'approval', 'gratitude']],
    ] as const;

    for (const [emotion, expectedKeywords] of emotionCases) {
      const index = resolveAnimationIndexForReplyMetadata({ emotion }, DEFAULT_ANIMATIONS);
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
  });

  it('does not ask the model to pick animations, motions, expressions, or purposes', () => {
    const instruction = buildReplyMetadataInstruction();

    expect(instruction).toContain('{"emotion":"neutral"}');
    expect(instruction).toContain('Do not choose animation names, motions, gestures');
    expect(instruction).toContain('Use neutral only when there is no clear emotional color');
    expect(buildAnimationCatalogInstruction(DEFAULT_ANIMATIONS)).toBe('');
  });

  it('does not select disabled animation entries', () => {
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

    expect(resolveAnimationIndexForReplyMetadata({ emotion: 'grateful' }, playlist)).toBe(1);
  });
});
