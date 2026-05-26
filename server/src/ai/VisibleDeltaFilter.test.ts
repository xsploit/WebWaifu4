import { describe, expect, it } from 'vitest';
import { createAiVisibleDeltaFilter, getSafeFinalVisibleText } from './VisibleDeltaFilter.js';

const structuredReplyFormat = {
  name: 'yourwifey_assistant_reply',
  schema: {
    type: 'object',
    properties: {
      message: { type: 'string' },
      emotion: { type: 'string' },
    },
    required: ['message', 'emotion'],
    additionalProperties: false,
  },
  strict: true,
  type: 'json_schema',
} as const;

describe('server visible delta filter', () => {
  it('streams only the message field from structured JSON before the JSON object completes', () => {
    const filter = createAiVisibleDeltaFilter(structuredReplyFormat);

    expect(filter.push('{"message":"I')).toBe('I');
    expect(filter.push("'m live [pause]")).toBe("'m live [pause]");
    expect(filter.push(' now","emotion":"excited"}')).toBe(' now');
    expect(filter.flush()).toBe('');
  });

  it('decodes structured JSON unicode escapes while streaming visible text', () => {
    const filter = createAiVisibleDeltaFilter(structuredReplyFormat);
    const visible = [
      filter.push('{"message":"Hi \\u'),
      filter.push('0041 \\ud83d'),
      filter.push('\\ude00","emotion":"happy"}'),
    ].join('');

    expect(visible).toBe('Hi A 😀');
    expect(filter.flush()).toBe('');
  });

  it('auto-detects structured JSON even if responseFormat was lost before live TTS bridge', () => {
    const filter = createAiVisibleDeltaFilter(undefined);
    const chunks = ['{"mes', 'sage":"Do not say metadata.",', '"emotion":"annoyed"}'];
    const visible = chunks.map((chunk) => filter.push(chunk)).join('') + filter.flush();

    expect(visible).toBe('Do not say metadata.');
    expect(visible).not.toContain('message');
    expect(visible).not.toContain('emotion');
    expect(visible).not.toContain('{');
  });

  it('strips legacy hidden metadata wrappers from plain text streams', () => {
    const filter = createAiVisibleDeltaFilter(undefined);
    const visible =
      filter.push('Visible <hidden block>{"emotion":"happy"}') +
      filter.push('</hidden block> text') +
      filter.flush();

    expect(visible).toBe('Visible  text');
  });

  it('extracts final JSON message for non-stream fallback paths', () => {
    expect(
      getSafeFinalVisibleText(
        '{"message":"Final fallback only.","emotion":"happy"}',
        undefined,
      ),
    ).toBe('Final fallback only.');
  });

  it('strips final metadata blocks for non-stream fallback paths', () => {
    expect(
      getSafeFinalVisibleText('Visible line. <yw-meta>{"emotion":"happy"}</yw-meta>', undefined),
    ).toBe('Visible line.');
    expect(
      getSafeFinalVisibleText(
        'Visible line. <hidden block>{"emotion":"annoyed"}</hidden block>',
        undefined,
      ),
    ).toBe('Visible line.');
  });
});
