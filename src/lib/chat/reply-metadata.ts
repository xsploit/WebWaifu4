import type { AnimationEntry } from '../menu/types';

export const ASSISTANT_REPLY_META_OPEN = '<yw-meta>';
export const ASSISTANT_REPLY_META_CLOSE = '</yw-meta>';

const ASSISTANT_REPLY_META_DELIMITERS = [
  { open: ASSISTANT_REPLY_META_OPEN, close: ASSISTANT_REPLY_META_CLOSE },
  { open: '<hidden block>', close: '</hidden block>' },
  { open: '<hidden-block>', close: '</hidden-block>' },
] as const;

export type AssistantEmotion =
  | 'neutral'
  | 'amused'
  | 'happy'
  | 'excited'
  | 'curious'
  | 'confused'
  | 'thinking'
  | 'surprised'
  | 'angry'
  | 'annoyed'
  | 'embarrassed'
  | 'grateful'
  | 'optimistic'
  | 'proud'
  | 'nervous'
  | 'sad'
  | 'caring';

export type AssistantFacialExpression =
  | 'neutral'
  | 'happy'
  | 'relaxed'
  | 'surprised'
  | 'angry'
  | 'sad'
  | 'embarrassed'
  | 'confused'
  | 'thinking'
  | 'caring';

export type AssistantReplyMetadata = {
  emotion: AssistantEmotion;
};

export type AssistantReplyParseResult = {
  metadata: AssistantReplyMetadata | null;
  text: string;
};

const EMOTIONS = new Set<AssistantEmotion>([
  'neutral',
  'amused',
  'happy',
  'excited',
  'curious',
  'confused',
  'thinking',
  'surprised',
  'angry',
  'annoyed',
  'embarrassed',
  'grateful',
  'optimistic',
  'proud',
  'nervous',
  'sad',
  'caring',
]);

const EMOTION_EXPRESSION_MAP: Record<AssistantEmotion, AssistantFacialExpression> = {
  neutral: 'neutral',
  amused: 'happy',
  happy: 'happy',
  excited: 'happy',
  curious: 'thinking',
  confused: 'confused',
  thinking: 'thinking',
  surprised: 'surprised',
  angry: 'angry',
  annoyed: 'angry',
  embarrassed: 'embarrassed',
  grateful: 'caring',
  optimistic: 'happy',
  proud: 'happy',
  nervous: 'embarrassed',
  sad: 'sad',
  caring: 'caring',
};

const EMOTION_ANIMATION_KEYWORDS: Record<AssistantEmotion, string[]> = {
  neutral: [],
  amused: ['amused', 'amusement', 'happy', 'joy', 'laugh'],
  happy: ['happy', 'joy', 'amusement'],
  excited: ['excited', 'excitement', 'happy', 'joy'],
  curious: ['curious', 'curiosity', 'thinking', 'hima'],
  confused: ['confused', 'confusion', 'curiosity'],
  thinking: ['thinking', 'hima', 'waiting'],
  surprised: ['surprised', 'surprise', 'attention'],
  angry: ['angry', 'anger', 'annoyance', 'disapproval'],
  annoyed: ['annoyed', 'annoyance', 'anger', 'disapproval'],
  embarrassed: ['embarrassed', 'embarrassment', 'nervous', 'shy'],
  grateful: ['grateful', 'gratitude', 'approval', 'caring'],
  optimistic: ['optimistic', 'optimism', 'happy', 'approval'],
  proud: ['proud', 'pride', 'approval', 'happy'],
  nervous: ['nervous', 'nervousness', 'embarrassment', 'shy'],
  sad: ['sad', 'sadness', 'disappointment'],
  caring: ['caring', 'approval', 'gratitude'],
};

export function buildReplyMetadataInstruction() {
  return [
    'At the very end of every assistant reply, append exactly one metadata block using this exact tag shape:',
    `${ASSISTANT_REPLY_META_OPEN}{"emotion":"neutral"}${ASSISTANT_REPLY_META_CLOSE}`,
    'The block must be valid compact JSON and must not be explained. Do not use any other wrapper name such as hidden block.',
    `emotion must be one of: ${Array.from(EMOTIONS).join(', ')}.`,
    'Choose only the emotion you are feeling toward the current message. Do not choose animation names, motions, expressions, purposes, or implementation details.',
    'Use neutral when there is no meaningful emotional reaction. Neutral does not trigger a reaction animation.',
  ].join('\n');
}

export function buildAnimationCatalogInstruction(_playlist: AnimationEntry[]) {
  return '';
}

export function stripAssistantReplyMetadata(text: string): AssistantReplyParseResult {
  const block = findLastMetadataBlock(text);
  if (!block) {
    return parseStructuredReplyEnvelope(text) ?? { metadata: null, text: cleanupReplyText(text) };
  }

  if (block.closeIndex === -1) {
    return { metadata: null, text: cleanupReplyText(text.slice(0, block.openIndex)) };
  }

  const rawJson = text.slice(block.openIndex + block.open.length, block.closeIndex).trim();
  const before = text.slice(0, block.openIndex);
  const after = text.slice(block.closeIndex + block.close.length);

  return {
    metadata: normalizeReplyMetadata(rawJson),
    text: cleanupReplyText(`${before}${after}`),
  };
}

export function createAssistantMetadataStreamFilter() {
  let buffer = '';
  let suppressing = false;
  let activeCloseTag = ASSISTANT_REPLY_META_CLOSE;
  let metadataBuffer = '';
  let hiddenTextLength = 0;

  return {
    push(delta: string) {
      buffer += delta;
      let visible = '';

      while (buffer) {
        if (suppressing) {
          const closeIndex = buffer.indexOf(activeCloseTag);
          if (closeIndex === -1) {
            metadataBuffer += buffer;
            hiddenTextLength += buffer.length;
            buffer = '';
            break;
          }

          metadataBuffer += buffer.slice(0, closeIndex);
          hiddenTextLength += closeIndex;
          buffer = buffer.slice(closeIndex + activeCloseTag.length);
          suppressing = false;
          activeCloseTag = ASSISTANT_REPLY_META_CLOSE;
          continue;
        }

        const openMatch = findNextMetadataOpen(buffer);
        if (openMatch) {
          visible += buffer.slice(0, openMatch.index);
          buffer = buffer.slice(openMatch.index + openMatch.open.length);
          activeCloseTag = openMatch.close;
          suppressing = true;
          continue;
        }

        const safeLength = getSafeVisibleLength(buffer);
        if (safeLength <= 0) {
          break;
        }

        visible += buffer.slice(0, safeLength);
        buffer = buffer.slice(safeLength);
      }

      return visible;
    },
    finish(finalText?: string): AssistantReplyParseResult {
      const parsed = stripAssistantReplyMetadata(finalText ?? '');
      return {
        metadata: parsed.metadata ?? normalizeReplyMetadata(metadataBuffer),
        text: parsed.text,
      };
    },
    debug() {
      return {
        bufferLength: buffer.length,
        hiddenTextLength,
        metadataBufferLength: metadataBuffer.length,
        suppressing,
      };
    },
  };
}

export function resolveAnimationIndexForReplyMetadata(
  metadata: AssistantReplyMetadata | null,
  playlist: AnimationEntry[],
) {
  if (!metadata || metadata.emotion === 'neutral' || playlist.length === 0) {
    return -1;
  }

  const emotionKeywords = EMOTION_ANIMATION_KEYWORDS[metadata.emotion].map(
    normalizeAnimationSearchText,
  );
  const candidates = playlist
    .map((entry, index) => ({
      entry,
      index,
      haystack: normalizeAnimationSearchText(
        `${entry.name} ${entry.id} ${entry.purpose ?? ''} ${(entry.tags ?? []).join(' ')}`,
      ),
    }))
    .filter((candidate) => candidate.entry.enabled)
    .map((candidate) => {
      const semanticScore =
        scoreAnimationKeywords(candidate.haystack, emotionKeywords, 2) +
        (candidate.entry.purpose === 'emotion' &&
        emotionKeywords.some((keyword) => keyword && candidate.haystack.includes(keyword))
          ? 8
          : 0);
      return {
        ...candidate,
        semanticScore,
        score: getPurposeScore(candidate.entry) + semanticScore,
      };
    })
    .filter((candidate) => candidate.score > 0 && candidate.semanticScore > 0);

  candidates.sort((a, b) => {
    const aStable = a.entry.experimental ? 0 : 1;
    const bStable = b.entry.experimental ? 0 : 1;
    if (a.score !== b.score) return b.score - a.score;
    if (a.semanticScore !== b.semanticScore) return b.semanticScore - a.semanticScore;
    if (aStable !== bStable) return bStable - aStable;
    return a.index - b.index;
  });

  return candidates[0]?.index ?? -1;
}

export function resolveFacialExpressionForReplyMetadata(metadata: AssistantReplyMetadata | null) {
  if (!metadata) {
    return 'neutral';
  }
  return EMOTION_EXPRESSION_MAP[metadata.emotion] ?? 'neutral';
}

export function resolveFacialExpressionIntensityForReplyMetadata(
  metadata: AssistantReplyMetadata | null,
) {
  if (!metadata || metadata.emotion === 'neutral') {
    return 0;
  }
  return 0.58;
}

export function resolveFacialExpressionDurationMsForReplyMetadata(
  metadata: AssistantReplyMetadata | null,
) {
  if (!metadata || metadata.emotion === 'neutral') {
    return 800;
  }
  return 3200;
}

function normalizeReplyMetadata(rawJson: string): AssistantReplyMetadata | null {
  if (!rawJson.trim()) {
    return null;
  }

  try {
    return normalizeReplyMetadataRecord(JSON.parse(rawJson) as Record<string, unknown>);
  } catch {
    return null;
  }
}

function findLastMetadataBlock(text: string) {
  let match:
    | {
        close: string;
        closeIndex: number;
        open: string;
        openIndex: number;
      }
    | null = null;
  for (const delimiter of ASSISTANT_REPLY_META_DELIMITERS) {
    const openIndex = text.lastIndexOf(delimiter.open);
    if (openIndex === -1 || (match && openIndex < match.openIndex)) {
      continue;
    }
    match = {
      close: delimiter.close,
      closeIndex: text.indexOf(delimiter.close, openIndex + delimiter.open.length),
      open: delimiter.open,
      openIndex,
    };
  }
  return match;
}

function findNextMetadataOpen(text: string) {
  let match:
    | {
        close: string;
        index: number;
        open: string;
      }
    | null = null;
  for (const delimiter of ASSISTANT_REPLY_META_DELIMITERS) {
    const index = text.indexOf(delimiter.open);
    if (index === -1 || (match && index >= match.index)) {
      continue;
    }
    match = {
      close: delimiter.close,
      index,
      open: delimiter.open,
    };
  }
  return match;
}

function normalizeReplyMetadataRecord(parsed: Record<string, unknown>): AssistantReplyMetadata {
  const emotion = normalizeSetValue(parsed['emotion'], EMOTIONS, 'neutral');
  return { emotion };
}

function parseStructuredReplyEnvelope(text: string): AssistantReplyParseResult | null {
  const candidate = unwrapJsonText(text);
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const visibleText = readStructuredReplyText(record);
    if (!visibleText) {
      return null;
    }

    return {
      metadata: normalizeReplyMetadataRecord(record),
      text: cleanupReplyText(visibleText),
    };
  } catch {
    return null;
  }
}

function unwrapJsonText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return '';
  }
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  return candidate.startsWith('{') && candidate.endsWith('}') ? candidate : '';
}

function readStructuredReplyText(record: Record<string, unknown>) {
  for (const key of [
    'reply',
    'text',
    'message',
    'content',
    'spoken',
    'spokenText',
    'visibleText',
    'dialogue',
    'response',
  ]) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return '';
}

function getPurposeScore(entry: AnimationEntry) {
  if (entry.purpose === 'movement' || entry.purpose === 'pose') {
    return -8;
  }
  if (entry.purpose === 'emotion') {
    return 8;
  }
  if (entry.purpose === 'gesture') {
    return 3;
  }
  return 0;
}

function scoreAnimationKeywords(haystack: string, keywords: string[], multiplier: number) {
  return keywords.reduce((score, keyword, keywordIndex) => {
    if (!keyword || !haystack.includes(keyword)) {
      return score;
    }
    return score + Math.max(1, keywords.length - keywordIndex) * multiplier;
  }, 0);
}

function normalizeSetValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowed.has(normalized as T) ? (normalized as T) : fallback;
}

function cleanupReplyText(text: string) {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function getSafeVisibleLength(value: string) {
  const maxTail = Math.max(
    ...ASSISTANT_REPLY_META_DELIMITERS.map((delimiter) => delimiter.open.length - 1),
  );
  const maxLength = value.length;
  for (let tailLength = Math.min(maxTail, maxLength); tailLength > 0; tailLength -= 1) {
    const tail = value.slice(maxLength - tailLength);
    if (ASSISTANT_REPLY_META_DELIMITERS.some((delimiter) => delimiter.open.startsWith(tail))) {
      return maxLength - tailLength;
    }
  }
  return maxLength;
}

function normalizeAnimationSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/^cc0animation/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
