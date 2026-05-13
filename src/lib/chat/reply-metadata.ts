import type { AnimationEntry, AnimationPurpose } from '../menu/types';

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

export type AssistantMotion =
  | 'idle'
  | 'talk'
  | 'explain'
  | 'greeting'
  | 'wave'
  | 'point'
  | 'laugh'
  | 'react'
  | 'thinking'
  | 'listen'
  | 'shy'
  | 'surprise'
  | 'annoyed'
  | 'confused';

export type AssistantMotionIntensity = 'low' | 'medium' | 'high';

export type AssistantReplyMetadata = {
  animation?: string;
  emotion: AssistantEmotion;
  expression: AssistantFacialExpression;
  intensity: AssistantMotionIntensity;
  motion: AssistantMotion;
  purpose: AnimationPurpose;
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
  'annoyed',
  'embarrassed',
  'grateful',
  'optimistic',
  'proud',
  'nervous',
  'sad',
  'caring',
]);

const MOTIONS = new Set<AssistantMotion>([
  'idle',
  'talk',
  'explain',
  'greeting',
  'wave',
  'point',
  'laugh',
  'react',
  'thinking',
  'listen',
  'shy',
  'surprise',
  'annoyed',
  'confused',
]);

const INTENSITIES = new Set<AssistantMotionIntensity>(['low', 'medium', 'high']);
const PURPOSES = new Set<AnimationPurpose>(['ambient', 'gesture', 'emotion', 'movement', 'pose']);
const EXPRESSIONS = new Set<AssistantFacialExpression>([
  'neutral',
  'happy',
  'relaxed',
  'surprised',
  'angry',
  'sad',
  'embarrassed',
  'confused',
  'thinking',
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
  annoyed: 'angry',
  embarrassed: 'embarrassed',
  grateful: 'caring',
  optimistic: 'happy',
  proud: 'happy',
  nervous: 'embarrassed',
  sad: 'sad',
  caring: 'caring',
};

const MOTION_ANIMATION_KEYWORDS: Record<AssistantMotion, string[]> = {
  idle: ['idle', 'stand', 'waiting', 'hima'],
  talk: ['talk', 'zatu', 'ruru', 'casual', 'explain'],
  explain: ['point', 'talk', 'zatu', 'ruru'],
  greeting: ['greeting', 'small wave', 'right wave', 'wave'],
  wave: ['small wave', 'right wave', 'wave', 'unwave'],
  point: ['point', 'explain', 'talk'],
  laugh: ['happy', 'amusement', 'joy', 'laugh'],
  react: ['surprise', 'attention', 'reaction', 'happy'],
  thinking: ['thinking', 'hima', 'waiting', 'curiosity'],
  listen: ['idle', 'stand', 'waiting'],
  shy: ['embarrassment', 'nervous', 'shy'],
  surprise: ['surprise', 'attention', 'react'],
  annoyed: ['annoyance', 'anger', 'disapproval'],
  confused: ['confusion', 'curiosity', 'point'],
};

const EMOTION_ANIMATION_KEYWORDS: Record<AssistantEmotion, string[]> = {
  neutral: ['idle', 'stand'],
  amused: ['happy', 'amusement', 'joy'],
  happy: ['happy', 'joy', 'wave'],
  excited: ['excitement', 'happy', 'wave'],
  curious: ['curiosity', 'thinking', 'hima'],
  confused: ['confusion', 'curiosity'],
  thinking: ['thinking', 'hima', 'waiting'],
  surprised: ['surprise', 'attention'],
  annoyed: ['annoyance', 'disapproval'],
  embarrassed: ['embarrassment', 'nervous'],
  grateful: ['gratitude', 'approval', 'caring', 'wave'],
  optimistic: ['optimism', 'happy', 'approval'],
  proud: ['pride', 'approval', 'happy'],
  nervous: ['nervousness', 'embarrassment', 'shy'],
  sad: ['sadness', 'disappointment'],
  caring: ['caring', 'approval', 'gratitude'],
};

export function buildReplyMetadataInstruction() {
  return [
    'At the very end of every assistant reply, append exactly one hidden control block using this shape:',
    `${ASSISTANT_REPLY_META_OPEN}{"emotion":"neutral","expression":"neutral","motion":"talk","purpose":"ambient","intensity":"low","animation":""}${ASSISTANT_REPLY_META_CLOSE}`,
    'The block must be valid compact JSON and must not be explained.',
    `emotion must be one of: ${Array.from(EMOTIONS).join(', ')}.`,
    `expression must be one of: ${Array.from(EXPRESSIONS).join(', ')} and controls VRM facial expression only.`,
    `motion must be one of: ${Array.from(MOTIONS).join(', ')}.`,
    `purpose must be one of: ${Array.from(PURPOSES).join(', ')}.`,
    `intensity must be one of: ${Array.from(INTENSITIES).join(', ')}.`,
    'animation may be an exact available animation id/name from the catalog, or empty string when the motion/emotion should be mapped automatically.',
    'Choose motion/emotion/purpose for avatar performance. Keep spoken dialogue before the block natural.',
    'Use motion greeting for welcoming a first-time chatter or saying hello. Do not choose walking, sitting, kneeling, or rotating motions for normal replies.',
  ].join('\n');
}

export function buildAnimationCatalogInstruction(playlist: AnimationEntry[]) {
  const available = playlist.filter((entry) => entry.enabled);
  if (available.length === 0) {
    return '';
  }

  const purposes: AnimationPurpose[] = ['ambient', 'gesture', 'emotion', 'movement', 'pose'];
  const lines = purposes
    .map((purpose) => {
      const entries = available
        .filter((entry) => (entry.purpose ?? 'gesture') === purpose)
        .slice(0, purpose === 'ambient' ? 14 : 18)
        .map((entry) => {
          const tags = entry.tags?.length ? ` tags=${entry.tags.slice(0, 5).join('/')}` : '';
          const trigger = entry.loopEligible === false ? ' trigger-only' : '';
          return `${entry.name} [${entry.id}]${trigger}${tags}`;
        });
      return entries.length > 0 ? `${purpose}: ${entries.join('; ')}` : null;
    })
    .filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return '';
  }

  return [
    'Available avatar animation catalog for the hidden control block.',
    'Use animation id/name only when a listed animation clearly fits; otherwise leave animation empty and rely on motion/emotion mapping.',
    'Ambient is safe for idle/talk/listen. Gesture/emotion are for reactions. Movement and pose are trigger-only and should be used only if the user explicitly asks.',
    'For emotional reactions, prefer purpose=emotion and the closest emotion tag/name; expression handles the face separately.',
    ...lines,
  ].join('\n');
}

export function stripAssistantReplyMetadata(text: string): AssistantReplyParseResult {
  const openIndex = text.lastIndexOf(ASSISTANT_REPLY_META_OPEN);
  if (openIndex === -1) {
    return { metadata: null, text: cleanupReplyText(text) };
  }

  const closeIndex = text.indexOf(ASSISTANT_REPLY_META_CLOSE, openIndex + ASSISTANT_REPLY_META_OPEN.length);
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

  return {
    push(delta: string) {
      buffer += delta;
      let visible = '';

      while (buffer) {
        if (suppressing) {
          const closeIndex = buffer.indexOf(ASSISTANT_REPLY_META_CLOSE);
          if (closeIndex === -1) {
            metadataBuffer += buffer;
            buffer = '';
            break;
          }

          metadataBuffer += buffer.slice(0, closeIndex);
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
  };
}

export function resolveAnimationIndexForReplyMetadata(
  metadata: AssistantReplyMetadata | null,
  playlist: AnimationEntry[],
) {
  if (!metadata || playlist.length === 0) {
    return -1;
  }

  const explicitIndex = resolveExplicitAnimationIndex(metadata, playlist);
  if (explicitIndex !== -1) {
    return explicitIndex;
  }

  const motionKeywords = [
    metadata.motion,
    ...MOTION_ANIMATION_KEYWORDS[metadata.motion],
  ].map(normalizeAnimationSearchText);
  const emotionKeywords = [
    metadata.emotion,
    ...EMOTION_ANIMATION_KEYWORDS[metadata.emotion],
  ].map(normalizeAnimationSearchText);

  const candidates = playlist
    .map((entry, index) => ({
      entry,
      index,
      haystack: normalizeAnimationSearchText(
        `${entry.name} ${entry.id} ${entry.purpose ?? ''} ${(entry.tags ?? []).join(' ')}`,
      ),
    }))
    .filter((candidate) => candidate.entry.enabled)
    .map((candidate) => ({
      ...candidate,
      score:
        getPurposeScore(candidate.entry, metadata) +
        scoreAnimationKeywords(candidate.haystack, motionKeywords, 1) +
        scoreAnimationKeywords(candidate.haystack, emotionKeywords, 2) +
        (candidate.entry.purpose === 'emotion' &&
        emotionKeywords.some((keyword) => keyword && candidate.haystack.includes(keyword))
          ? 8
          : 0),
    }))
    .filter((candidate) => candidate.score > 0);

  if (candidates.length === 0) {
    return -1;
  }

  const weights = candidates.map((candidate) => {
    return {
      ...candidate,
      weight: resolveAnimationSelectionWeight(candidate.entry, metadata, candidate.score),
    };
  });

  const selected = pickWeightedCandidate(weights);
  if (selected) {
    return selected.index;
  }

  candidates.sort((a, b) => {
    const aEnabled = a.entry.enabled ? 1 : 0;
    const bEnabled = b.entry.enabled ? 1 : 0;
    if (aEnabled !== bEnabled) return bEnabled - aEnabled;

    const aStable = a.entry.experimental ? 0 : 1;
    const bStable = b.entry.experimental ? 0 : 1;
    if (aStable !== bStable) return bStable - aStable;

    if (a.score !== b.score) return b.score - a.score;

    return a.index - b.index;
  });

  return candidates[0]?.index ?? -1;
}

function normalizeReplyMetadata(rawJson: string): AssistantReplyMetadata | null {
  if (!rawJson.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const emotion = normalizeSetValue(parsed['emotion'], EMOTIONS, 'neutral');
    const expression = normalizeSetValue(
      parsed['expression'],
      EXPRESSIONS,
      inferExpressionForEmotion(emotion),
    );
    const motion = normalizeSetValue(parsed['motion'], MOTIONS, 'talk');
    const purpose = normalizeSetValue(parsed['purpose'], PURPOSES, inferPurposeForMotion(motion));
    const intensity = normalizeSetValue(parsed['intensity'], INTENSITIES, 'low');
    const animation = typeof parsed['animation'] === 'string' ? parsed['animation'].trim() : '';
    return { animation, emotion, expression, intensity, motion, purpose };
  } catch {
    return null;
  }
}

export function resolveFacialExpressionForReplyMetadata(metadata: AssistantReplyMetadata | null) {
  if (!metadata) {
    return 'neutral';
  }
  return metadata.expression || inferExpressionForEmotion(metadata.emotion);
}

export function resolveFacialExpressionIntensityForReplyMetadata(
  metadata: AssistantReplyMetadata | null,
) {
  if (!metadata || resolveFacialExpressionForReplyMetadata(metadata) === 'neutral') {
    return 0;
  }
  if (metadata.intensity === 'high') {
    return 0.78;
  }
  if (metadata.intensity === 'medium') {
    return 0.58;
  }
  return 0.38;
}

export function resolveFacialExpressionDurationMsForReplyMetadata(
  metadata: AssistantReplyMetadata | null,
) {
  if (!metadata) {
    return 800;
  }
  if (metadata.intensity === 'high') {
    return 4200;
  }
  if (metadata.intensity === 'medium') {
    return 3200;
  }
  return 2200;
}

function getPurposeScore(entry: AnimationEntry, metadata: AssistantReplyMetadata) {
  if (
    (entry.purpose === 'movement' || entry.purpose === 'pose') &&
    metadata.purpose !== entry.purpose
  ) {
    return -8;
  }
  if (entry.purpose === 'emotion' && metadata.purpose === 'emotion') {
    return 8;
  }
  if (entry.purpose === 'emotion' && metadata.emotion !== 'neutral') {
    return 5;
  }
  if (entry.purpose && entry.purpose === metadata.purpose) {
    return 4;
  }
  if (entry.purpose === 'emotion' && metadata.motion !== 'idle') {
    return 3;
  }
  if (entry.purpose === 'gesture' && ['greeting', 'wave', 'point', 'explain'].includes(metadata.motion)) {
    return 3;
  }
  if (entry.purpose === 'ambient' && ['idle', 'talk', 'listen'].includes(metadata.motion)) {
    return 3;
  }
  return 0;
}

function resolveExplicitAnimationIndex(metadata: AssistantReplyMetadata, playlist: AnimationEntry[]) {
  const requested = normalizeAnimationSearchText(metadata.animation ?? '');
  if (!requested) {
    return -1;
  }

  const candidates = playlist
    .map((entry, index) => ({
      entry,
      index,
      id: normalizeAnimationSearchText(entry.id),
      name: normalizeAnimationSearchText(entry.name),
      tags: normalizeAnimationSearchText((entry.tags ?? []).join(' ')),
    }))
    .filter((candidate) => candidate.entry.enabled)
    .map((candidate) => {
      let score = getPurposeScore(candidate.entry, metadata);
      if (candidate.id === requested || candidate.name === requested) {
        score += 100;
      } else if (
        candidate.id.includes(requested) ||
        candidate.name.includes(requested) ||
        candidate.tags.includes(requested)
      ) {
        score += 50;
      }
      if (candidate.entry.enabled) {
        score += 5;
      }
      return { ...candidate, score };
    })
    .filter((candidate) => candidate.score > 0);

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0]?.index ?? -1;
}

function scoreAnimationKeywords(haystack: string, keywords: string[], multiplier: number) {
  return keywords.reduce((score, keyword, keywordIndex) => {
    if (!keyword || !haystack.includes(keyword)) {
      return score;
    }
    return score + Math.max(1, keywords.length - keywordIndex) * multiplier;
  }, 0);
}

function inferPurposeForMotion(motion: AssistantMotion): AnimationPurpose {
  if (motion === 'idle' || motion === 'talk' || motion === 'listen') {
    return 'ambient';
  }
  if (motion === 'wave' || motion === 'greeting' || motion === 'point' || motion === 'explain') {
    return 'gesture';
  }
  return 'emotion';
}

function inferExpressionForEmotion(emotion: AssistantEmotion): AssistantFacialExpression {
  return EMOTION_EXPRESSION_MAP[emotion] ?? 'neutral';
}

function resolveAnimationSelectionWeight(
  entry: AnimationEntry,
  metadata: AssistantReplyMetadata,
  score: number,
) {
  const weight = typeof entry.weight === 'number' && Number.isFinite(entry.weight) ? entry.weight : 0.8;
  const purposePenalty =
    (entry.purpose === 'movement' || entry.purpose === 'pose') &&
    metadata.purpose !== entry.purpose
      ? 0.2
      : 1;
  return Math.max(0.001, weight * purposePenalty * Math.max(0.1, score));
}

function pickWeightedCandidate<T extends { index: number; weight: number }>(candidates: T[]) {
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (totalWeight <= 0) {
    return undefined;
  }

  let cursor = Math.random() * totalWeight;
  for (const candidate of candidates) {
    cursor -= candidate.weight;
    if (cursor <= 0) {
      return candidate;
    }
  }

  return candidates[0];
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
