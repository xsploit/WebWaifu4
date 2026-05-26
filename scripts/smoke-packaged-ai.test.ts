import { describe, expect, it } from 'vitest';
import { hasStructuredJsonEnvelopeLeak } from './smoke-packaged-ai';

describe('packaged AI smoke structured leak detector', () => {
  it('allows normal dialogue with braces or the word message', () => {
    expect(hasStructuredJsonEnvelopeLeak('Say the word message out loud.')).toBe(false);
    expect(hasStructuredJsonEnvelopeLeak('Use braces like {this} in normal speech.')).toBe(false);
  });

  it('flags structured reply envelopes in visible deltas', () => {
    expect(
      hasStructuredJsonEnvelopeLeak('{"message":"this should not be spoken","emotion":"happy"}'),
    ).toBe(true);
    expect(hasStructuredJsonEnvelopeLeak('"emotion":"happy"')).toBe(true);
    expect(hasStructuredJsonEnvelopeLeak('"message": "this should not be spoken"')).toBe(true);
  });
});
