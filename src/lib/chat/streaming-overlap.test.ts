import { describe, expect, it } from 'vitest';
import { findOverlappingSuffix } from './streaming-overlap';

describe('streaming final overlap', () => {
  it('returns only the missing suffix when final text extends streamed text', () => {
    expect(findOverlappingSuffix('Hey subby, I heard', 'Hey subby, I heard you.')).toBe(' you.');
  });

  it('uses high-confidence tail/head overlap when final normalization differs from the visible stream prefix', () => {
    expect(
      findOverlappingSuffix(
        'I already spoke this very specific long overlap segment',
        'this very specific long overlap segment and only this is new.',
      ),
    ).toBe(' and only this is new.');
  });

  it('does not replay the final message when there is no safe overlap', () => {
    expect(findOverlappingSuffix('Already queued speech.', 'A rewritten final answer.')).toBe('');
  });

  it('does not trust short overlaps because they can replay common phrase tails', () => {
    expect(findOverlappingSuffix('I already spoke this part', 'this part and only this is new.')).toBe(
      '',
    );
  });

  it('does not replay a punctuation tail as a fresh suffix', () => {
    expect(
      findOverlappingSuffix(
        'The answer lands here, with this final sentence.',
        'with this final sentence.',
      ),
    ).toBe('');
  });
});
