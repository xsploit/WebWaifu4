import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_REPLY_META_CLOSE,
  ASSISTANT_REPLY_META_OPEN,
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
});
