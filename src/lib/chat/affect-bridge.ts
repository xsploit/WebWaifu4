import type { AffectState } from './types';
import type { AssistantEmotion, AssistantReplyMetadata } from './reply-metadata';

const EMOTION_VAD: Record<AssistantEmotion, Pick<AffectState, 'arousal' | 'dominance' | 'valence'>> = {
  angry: { arousal: 0.82, dominance: 0.55, valence: -0.72 },
  annoyed: { arousal: 0.58, dominance: 0.34, valence: -0.42 },
  amused: { arousal: 0.56, dominance: 0.25, valence: 0.58 },
  caring: { arousal: 0.32, dominance: 0.08, valence: 0.68 },
  confused: { arousal: 0.42, dominance: -0.36, valence: -0.18 },
  curious: { arousal: 0.48, dominance: 0.05, valence: 0.22 },
  embarrassed: { arousal: 0.62, dominance: -0.48, valence: -0.12 },
  excited: { arousal: 0.86, dominance: 0.42, valence: 0.78 },
  grateful: { arousal: 0.36, dominance: 0.02, valence: 0.74 },
  happy: { arousal: 0.6, dominance: 0.24, valence: 0.72 },
  nervous: { arousal: 0.68, dominance: -0.58, valence: -0.28 },
  neutral: { arousal: 0.18, dominance: 0, valence: 0 },
  optimistic: { arousal: 0.52, dominance: 0.38, valence: 0.7 },
  proud: { arousal: 0.56, dominance: 0.72, valence: 0.62 },
  sad: { arousal: 0.24, dominance: -0.42, valence: -0.68 },
  surprised: { arousal: 0.78, dominance: -0.08, valence: 0.12 },
  thinking: { arousal: 0.28, dominance: 0.06, valence: 0.04 },
};

export function createDefaultAffectState(): AffectState {
  return {
    arousal: 0.18,
    dominance: 0,
    label: 'neutral',
    lastEmotion: 'neutral',
    updatedAt: null,
    valence: 0,
  };
}

export function normalizeAffectState(value: unknown): AffectState {
  if (!value || typeof value !== 'object') {
    return createDefaultAffectState();
  }
  const source = value as Partial<AffectState>;
  return {
    arousal: clamp01(Number(source.arousal ?? 0.18)),
    dominance: clampSigned(Number(source.dominance ?? 0)),
    label: String(source.label ?? 'neutral').trim().slice(0, 32) || 'neutral',
    lastEmotion: String(source.lastEmotion ?? 'neutral').trim().slice(0, 32) || 'neutral',
    updatedAt:
      typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
        ? Math.max(0, source.updatedAt)
        : null,
    valence: clampSigned(Number(source.valence ?? 0)),
  };
}

export function getMetadataVad(metadata: AssistantReplyMetadata | null) {
  if (!metadata) {
    return EMOTION_VAD.neutral;
  }
  return {
    arousal: clamp01(metadata.arousal ?? EMOTION_VAD[metadata.emotion].arousal),
    dominance: clampSigned(metadata.dominance ?? EMOTION_VAD[metadata.emotion].dominance),
    valence: clampSigned(metadata.valence ?? EMOTION_VAD[metadata.emotion].valence),
  };
}

export function updateAffectState(
  current: AffectState | undefined,
  metadata: AssistantReplyMetadata,
  now = Date.now(),
): AffectState {
  const base = normalizeAffectState(current);
  const incoming = getMetadataVad(metadata);
  const elapsedMs = base.updatedAt ? Math.max(0, now - base.updatedAt) : 0;
  const decay = Math.exp(-elapsedMs / (1000 * 60 * 45));
  const oldWeight = base.updatedAt ? 0.72 * decay : 0;
  const newWeight = 1 - oldWeight;
  const next = {
    arousal: clamp01(base.arousal * oldWeight + incoming.arousal * newWeight),
    dominance: clampSigned(base.dominance * oldWeight + incoming.dominance * newWeight),
    valence: clampSigned(base.valence * oldWeight + incoming.valence * newWeight),
  };
  return {
    ...next,
    label: labelAffect(next),
    lastEmotion: metadata.emotion,
    updatedAt: now,
  };
}

export function buildAffectBridgePromptBlock(state: AffectState | undefined) {
  const affect = normalizeAffectState(state);
  return [
    'Affect bridge state is private continuity for tone and body language, not dialogue to mention.',
    `Current mood vector: label=${affect.label}, valence=${affect.valence.toFixed(2)}, arousal=${affect.arousal.toFixed(2)}, dominance=${affect.dominance.toFixed(2)}, lastEmotion=${affect.lastEmotion}.`,
    'Let this gently bias the reply emotion and delivery. Do not announce the vector or say you have an affect bridge.',
  ].join('\n');
}

export function getAffectExpressionBoost(state: AffectState | undefined) {
  const affect = normalizeAffectState(state);
  return Math.max(0, Math.min(0.24, affect.arousal * 0.18 + Math.abs(affect.valence) * 0.06));
}

function labelAffect(state: Pick<AffectState, 'arousal' | 'dominance' | 'valence'>) {
  if (state.valence <= -0.45 && state.arousal >= 0.58) return 'heated';
  if (state.valence <= -0.35 && state.arousal < 0.45) return 'low';
  if (state.valence >= 0.5 && state.arousal >= 0.62) return 'bright';
  if (state.valence >= 0.42) return 'warm';
  if (state.arousal >= 0.68) return 'keyed-up';
  if (state.dominance >= 0.5) return 'confident';
  if (state.dominance <= -0.45) return 'uncertain';
  return 'steady';
}

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function clampSigned(value: number) {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}
