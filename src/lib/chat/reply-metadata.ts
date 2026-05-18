import type { AnimationEntry } from '../menu/types';

export const ASSISTANT_REPLY_META_OPEN = '<yw-meta>';
export const ASSISTANT_REPLY_META_CLOSE = '</yw-meta>';

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
    'At the very end of every assistant reply, append exactly one hidden emotion block using this shape:',
    `${ASSISTANT_REPLY_META_OPEN}{"emotion":"neutral"}${ASSISTANT_REPLY_META_CLOSE}`,
    'The block must be valid compact JSON and must not be explained.',
    `emotion must be one of: ${Array.from(EMOTIONS).join(', ')}.`,
    'Choose only the emotion you are feeling toward the current message. Do not choose animation names, motions, expressions, purposes, or implementation details.',
    'Use neutral when there is no meaningful emotional reaction. Neutral does not trigger a reaction animation.',
  ].join('\n');
}

export function buildAnimationCatalogInstruction(_playlist: AnimationEntry[]) {
  return '';
}

export function stripAssistantReplyMetadata(text: string): AssistantReplyParseResult {
  const openIndex = text.lastIndexOf(ASSISTANT_REPLY_META_OPEN);
  if (openIndex === -1) {
    return { metadata: null, text: cleanupReplyText(text) };
  }

  const closeIndex = text.indexOf(
    ASSISTANT_REPLY_META_CLOSE,
    openIndex + ASSISTANT_REPLY_META_OPEN.length,
  );
  if (closeIndex === -1) {
    return { metadata: null, text: cleanupReplyText(text.slice(0, openIndex)) };
  }

  const rawJson = text.slice(openIndex + ASSISTANT_REPLY_META_OPEN.length, closeIndex).trim();
  const before = text.slice(0, openIndex);
  const after = text.slice(closeIndex + ASSISTANT_REPLY_META_CLOSE.length);

  return {
    metadata: normalizeReplyMetadata(rawJson),
    text: cleanupReplyText(`${before}${after}`),
  };
}

export function createAssistantMetadataStreamFilter() {
  let buffer = '';
  let suppressing = false;
  let metadataBuffer = '';
  let hiddenTextLength = 0;

  return {
    push(delta: string) {
      buffer += delta;
      let visible = '';

      while (buffer) {
        if (suppressing) {
          const closeIndex = buffer.indexOf(ASSISTANT_REPLY_META_CLOSE);
          if (closeIndex === -1) {
            metadataBuffer += buffer;
            hiddenTextLength += buffer.length;
            buffer = '';
            break;
          }

          metadataBuffer += buffer.slice(0, closeIndex);
          hiddenTextLength += closeIndex;
          buffer = buffer.slice(closeIndex + ASSISTANT_REPLY_META_CLOSE.length);
          suppressing = false;
          continue;
        }

        const openIndex = buffer.indexOf(ASSISTANT_REPLY_META_OPEN);
        if (openIndex !== -1) {
          visible += buffer.slice(0, openIndex);
          buffer = buffer.slice(openIndex + ASSISTANT_REPLY_META_OPEN.length);
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
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const emotion = normalizeSetValue(parsed['emotion'], EMOTIONS, 'neutral');
    return { emotion };
  } catch {
    return null;
  }
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
  const maxTail = ASSISTANT_REPLY_META_OPEN.length - 1;
  const maxLength = value.length;
  for (let tailLength = Math.min(maxTail, maxLength); tailLength > 0; tailLength -= 1) {
    if (ASSISTANT_REPLY_META_OPEN.startsWith(value.slice(maxLength - tailLength))) {
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
