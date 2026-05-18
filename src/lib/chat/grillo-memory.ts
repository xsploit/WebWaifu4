import type { ChatTurn } from './chat-turn';
import type { PersonaProfile } from './types';
import type { GrilloScoredItem } from './grillo-context';

export type GrilloCandidateType =
  | 'preference'
  | 'fact'
  | 'goal'
  | 'boundary'
  | 'bond_signal'
  | 'thread';

export type GrilloBlockName =
  | 'preferences'
  | 'boundaries'
  | 'relationship_state'
  | 'ongoing_topics'
  | 'verified_facts'
  | 'open_threads';

export type GrilloMemoryCandidate = {
  candidateId: string;
  confidence: number;
  content: string;
  createdAt: number;
  participantKey: string;
  scopeKey: string;
  source: ChatTurn['source'];
  sourceTurnIds: string[];
  summary: string;
  type: GrilloCandidateType;
};

export type GrilloMemoryBlock = {
  blockId: string;
  blockName: GrilloBlockName;
  createdAt: number;
  items: string[];
  participantKey: string;
  scopeKey: string;
  sourceCandidateIds: string[];
  updatedAt: number;
};

export type GrilloDiaryEntry = {
  beatType: string;
  content?: string;
  contextTags?: string[];
  createdAt: number;
  diaryId: string;
  emotions?: Array<{ intensity: number; name: string }>;
  interactionSummary?: string;
  involvedUsers?: string[];
  participantKey: string;
  personalThought: string;
  scopeKey: string;
  sourceTurnIds: string[];
  summary: string;
  tags: string[];
  userMessage?: string;
};

export type GrilloMemoryState = {
  blocks: GrilloMemoryBlock[];
  candidates: GrilloMemoryCandidate[];
  diaryEntries: GrilloDiaryEntry[];
  promotedCandidateIds: string[];
  scopeKey: string;
  updatedAt: number;
  version: 1;
};

export type GrilloMemoryPromptAdditions = {
  diaryThoughts: string[];
  recalledMemories: GrilloScoredItem[];
  relationshipMemory: string[];
};

type RecordGrilloMemoryTurnOptions = {
  assistantText: string;
  now?: number;
  persona: PersonaProfile | null;
  scopeKey: string;
  turns: ChatTurn[];
};

type BuildGrilloMemoryPromptOptions = {
  limit?: number;
  participantKeys?: string[];
  query: string;
  scopeKey: string;
};

type PromotionPolicy = {
  confidenceThreshold: number;
  maxBlockItems: number;
  minCandidatesForPromotion: number;
};

const STORAGE_KEY_PREFIX = 'yourwifey:grillo-memory:v1:';
const MAX_CANDIDATES = 120;
const MAX_BLOCKS = 80;
const MAX_DIARY = 40;
const DEFAULT_PROMOTION_POLICY: PromotionPolicy = {
  confidenceThreshold: 0.75,
  maxBlockItems: 20,
  minCandidatesForPromotion: 2,
};

export function getGrilloParticipantKey(turn: ChatTurn) {
  return `${turn.source}:${turn.channel || 'local'}:${turn.login || 'unknown'}`
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .slice(0, 160);
}

export function createDefaultGrilloMemoryState(scopeKey: string): GrilloMemoryState {
  return {
    blocks: [],
    candidates: [],
    diaryEntries: [],
    promotedCandidateIds: [],
    scopeKey,
    updatedAt: Date.now(),
    version: 1,
  };
}

export function loadGrilloMemoryState(scopeKey: string): GrilloMemoryState {
  const storage = getLocalStorage();
  if (!storage) {
    return createDefaultGrilloMemoryState(scopeKey);
  }

  try {
    return normalizeGrilloMemoryState(
      scopeKey,
      JSON.parse(storage.getItem(storageKey(scopeKey)) ?? 'null'),
    );
  } catch {
    return createDefaultGrilloMemoryState(scopeKey);
  }
}

export function saveGrilloMemoryState(state: GrilloMemoryState) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  let current = createDefaultGrilloMemoryState(state.scopeKey);
  try {
    current = normalizeGrilloMemoryState(
      state.scopeKey,
      JSON.parse(storage.getItem(storageKey(state.scopeKey)) ?? 'null'),
    );
  } catch {
    current = createDefaultGrilloMemoryState(state.scopeKey);
  }
  const nextState =
    current.blocks.length > 0 ||
    current.candidates.length > 0 ||
    current.diaryEntries.length > 0 ||
    current.promotedCandidateIds.length > 0
      ? mergeGrilloMemoryStates(current, state)
      : compactState(state);

  storage.setItem(storageKey(state.scopeKey), JSON.stringify(nextState));
}

export function clearGrilloMemoryState(scopeKey: string) {
  const storage = getLocalStorage();
  if (!storage) {
    return createDefaultGrilloMemoryState(scopeKey);
  }

  storage.removeItem(storageKey(scopeKey));
  return createDefaultGrilloMemoryState(scopeKey);
}

export function recordGrilloMemoryTurn({
  now = Date.now(),
  scopeKey,
  turns,
}: RecordGrilloMemoryTurnOptions): GrilloMemoryState {
  const state = loadGrilloMemoryState(scopeKey);
  const candidates = turns.flatMap((turn) => extractCandidatesFromTurn(turn, scopeKey, now));
  const nextState = compactState({
    ...state,
    candidates: [...state.candidates, ...candidates],
    updatedAt: now,
  });
  const promoted = promoteGrilloCandidates(nextState);
  saveGrilloMemoryState(promoted);
  return promoted;
}

export function buildGrilloMemoryPromptAdditions({
  limit = 6,
  participantKeys = [],
  query,
  scopeKey,
}: BuildGrilloMemoryPromptOptions): GrilloMemoryPromptAdditions {
  const state = loadGrilloMemoryState(scopeKey);
  const participantSet = new Set(participantKeys.map((key) => key.toLowerCase()));
  const includeParticipant = (participantKey: string) =>
    participantSet.size === 0 || participantSet.has(participantKey.toLowerCase());

  const relationshipMemory = state.blocks
    .filter((block) => includeParticipant(block.participantKey))
    .slice(-12)
    .flatMap((block) =>
      block.items.map((item) => `[${block.participantKey} ${block.blockName}] ${item}`),
    )
    .slice(-limit);

  const recalledMemories = scoreRecallItems(
    [
      ...state.candidates
        .filter((candidate) => includeParticipant(candidate.participantKey))
        .map((candidate) => ({
          createdAt: candidate.createdAt,
          id: candidate.candidateId,
          text: `[candidate:${candidate.type} ${candidate.participantKey}] ${candidate.summary}`,
        })),
      ...state.blocks
        .filter((block) => includeParticipant(block.participantKey))
        .flatMap((block) =>
          block.items.map((item) => ({
            createdAt: block.updatedAt,
            id: block.blockId,
            text: `[block:${block.blockName} ${block.participantKey}] ${item}`,
          })),
        ),
      ...state.diaryEntries
        .filter((entry) => includeParticipant(entry.participantKey))
        .map((entry) => ({
          createdAt: entry.createdAt,
          id: entry.diaryId,
          text: formatDiaryRecall(entry),
        })),
    ],
    query,
  ).slice(0, limit);

  const diaryThoughts = state.diaryEntries
    .filter((entry) => includeParticipant(entry.participantKey))
    .slice(-4)
    .map((entry) => formatDiaryThought(entry));

  return {
    diaryThoughts,
    recalledMemories,
    relationshipMemory,
  };
}

export function promoteGrilloCandidates(
  state: GrilloMemoryState,
  policy: PromotionPolicy = DEFAULT_PROMOTION_POLICY,
): GrilloMemoryState {
  const promotedIds = new Set(state.promotedCandidateIds);
  const eligible = state.candidates.filter(
    (candidate) =>
      !promotedIds.has(candidate.candidateId) && candidate.confidence >= policy.confidenceThreshold,
  );
  const grouped = new Map<string, GrilloMemoryCandidate[]>();

  eligible.forEach((candidate) => {
    const blockName = blockNameForCandidateType(candidate.type);
    const key = `${candidate.participantKey}::${blockName}`;
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  });

  const blocks = [...state.blocks];
  const consumed = new Set<string>();
  const now = Date.now();

  for (const group of grouped.values()) {
    if (group.length < policy.minCandidatesForPromotion) {
      continue;
    }

    const first = group[0];
    if (!first) {
      continue;
    }

    const blockName = blockNameForCandidateType(first.type);
    const existing = blocks.find(
      (block) => block.participantKey === first.participantKey && block.blockName === blockName,
    );
    const sourceCandidateIds = dedupe([...group.map((candidate) => candidate.candidateId)]);
    const newItems = dedupe(group.map((candidate) => candidate.summary || candidate.content));
    const existingItems = existing?.items ?? [];
    const mergedItems = dedupe([...existingItems, ...newItems]).slice(-policy.maxBlockItems);

    sourceCandidateIds.forEach((id) => consumed.add(id));

    if (existing) {
      existing.items = mergedItems;
      existing.sourceCandidateIds = dedupe([...existing.sourceCandidateIds, ...sourceCandidateIds]);
      existing.updatedAt = now;
    } else {
      blocks.push({
        blockId: `${first.participantKey}:${blockName}:v1`,
        blockName,
        createdAt: now,
        items: mergedItems,
        participantKey: first.participantKey,
        scopeKey: first.scopeKey,
        sourceCandidateIds,
        updatedAt: now,
      });
    }
  }

  return compactState({
    ...state,
    blocks,
    promotedCandidateIds: dedupe([...state.promotedCandidateIds, ...consumed]),
    updatedAt: now,
  });
}

function extractCandidatesFromTurn(turn: ChatTurn, scopeKey: string, now: number) {
  const text = turn.text.replace(/\s+/g, ' ').trim();
  const participantKey = getGrilloParticipantKey(turn);
  const base = {
    createdAt: now,
    participantKey,
    scopeKey,
    source: turn.source,
    sourceTurnIds: [turn.id],
  };
  const candidates: GrilloMemoryCandidate[] = [];

  const pushCandidate = (
    type: GrilloCandidateType,
    summary: string,
    confidence: number,
    content = text,
  ) => {
    const normalizedSummary = summary.replace(/\s+/g, ' ').trim().slice(0, 260);
    if (normalizedSummary.length < 4) {
      return;
    }
    candidates.push({
      ...base,
      candidateId: `${turn.id}:${type}:${hashText(normalizedSummary).toString(36)}`,
      confidence,
      content: content.slice(0, 600),
      summary: normalizedSummary,
      type,
    });
  };

  const rememberMatch = /\bremember\b[:\s-]*(.+)$/i.exec(text);
  if (rememberMatch?.[1]) {
    pushCandidate('fact', `${turn.displayName} asked me to remember: ${rememberMatch[1]}`, 0.95);
  }

  const preferenceMatch = /\bi (?:really )?(?:like|love|prefer|enjoy)\s+([^.!?]{2,140})/i.exec(
    text,
  );
  if (preferenceMatch?.[1]) {
    pushCandidate('preference', `${turn.displayName} likes ${preferenceMatch[1].trim()}`, 0.86);
  }

  const boundaryMatch =
    /\bi (?:hate|dislike|do not like|don't like|cant stand|can't stand)\s+([^.!?]{2,140})/i.exec(
      text,
    );
  if (boundaryMatch?.[1]) {
    pushCandidate('boundary', `${turn.displayName} dislikes ${boundaryMatch[1].trim()}`, 0.84);
  }

  const goalMatch =
    /\bi (?:want to|need to|am trying to|i'm trying to|plan to|gonna|going to)\s+([^.!?]{2,160})/i.exec(
      text,
    );
  if (goalMatch?.[1]) {
    pushCandidate('goal', `${turn.displayName} is trying to ${goalMatch[1].trim()}`, 0.8);
  }

  if (/\b(thanks|thank you|good job|you got it|that worked|love you)\b/i.test(text)) {
    pushCandidate('bond_signal', `${turn.displayName} gave positive relationship feedback`, 0.78);
  }

  if (
    text.length >= 36 &&
    /\b(project|stream|model|memory|animation|voice|twitch|chat)\b/i.test(text)
  ) {
    pushCandidate('thread', `${turn.displayName} discussed: ${text.slice(0, 180)}`, 0.74);
  }

  return candidates;
}

function scoreRecallItems(
  items: Array<{ createdAt: number; id: string; text: string }>,
  query: string,
): GrilloScoredItem[] {
  const queryTerms = tokenize(query);
  return items
    .map((item) => {
      const lexical = jaccardSimilarity(queryTerms, tokenize(item.text));
      const recency = Math.max(0, 1 - (Date.now() - item.createdAt) / (1000 * 60 * 60 * 24 * 30));
      return {
        text: item.text,
        score: lexical * 0.78 + recency * 0.18 + 0.04,
      };
    })
    .filter((item) => item.score > 0.05)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function blockNameForCandidateType(type: GrilloCandidateType): GrilloBlockName {
  if (type === 'preference') {
    return 'preferences';
  }
  if (type === 'boundary') {
    return 'boundaries';
  }
  if (type === 'bond_signal') {
    return 'relationship_state';
  }
  if (type === 'thread') {
    return 'ongoing_topics';
  }
  if (type === 'fact') {
    return 'verified_facts';
  }
  return 'open_threads';
}

function compactState(state: GrilloMemoryState): GrilloMemoryState {
  return {
    ...state,
    blocks: state.blocks.slice(-MAX_BLOCKS),
    candidates: state.candidates.slice(-MAX_CANDIDATES),
    diaryEntries: state.diaryEntries.filter(isReflectiveDiaryEntry).slice(-MAX_DIARY),
    promotedCandidateIds: state.promotedCandidateIds.slice(-MAX_CANDIDATES),
  };
}

function formatDiaryRecall(entry: GrilloDiaryEntry) {
  const emotionText = formatEmotions(entry.emotions);
  const tags = dedupe([...(entry.tags ?? []), ...(entry.contextTags ?? [])]);
  return [
    `[diary ${entry.participantKey}] ${entry.summary}`,
    entry.interactionSummary ? `interaction: ${entry.interactionSummary}` : '',
    entry.userMessage ? `speaker said: ${entry.userMessage}` : '',
    entry.personalThought ? `thought: ${entry.personalThought}` : '',
    emotionText ? `emotions: ${emotionText}` : '',
    tags.length ? `tags: ${tags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function formatDiaryThought(entry: GrilloDiaryEntry) {
  const emotionText = formatEmotions(entry.emotions);
  return [
    new Date(entry.createdAt).toISOString(),
    entry.personalThought,
    emotionText ? `(felt ${emotionText})` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function formatEmotions(emotions: GrilloDiaryEntry['emotions']) {
  if (!Array.isArray(emotions) || emotions.length === 0) {
    return '';
  }
  return emotions
    .map((emotion) => `${emotion.name}:${Math.round(emotion.intensity)}/10`)
    .join(', ');
}

function mergeGrilloMemoryStates(
  current: GrilloMemoryState,
  incoming: GrilloMemoryState,
): GrilloMemoryState {
  const blocksById = new Map<string, GrilloMemoryBlock>();
  [...current.blocks, ...incoming.blocks].forEach((block) => {
    const existing = blocksById.get(block.blockId);
    if (!existing) {
      blocksById.set(block.blockId, {
        ...block,
        items: [...block.items],
        sourceCandidateIds: [...block.sourceCandidateIds],
      });
      return;
    }
    blocksById.set(block.blockId, {
      ...existing,
      ...block,
      createdAt: Math.min(existing.createdAt, block.createdAt),
      items: dedupe([...existing.items, ...block.items]),
      sourceCandidateIds: dedupe([...existing.sourceCandidateIds, ...block.sourceCandidateIds]),
      updatedAt: Math.max(existing.updatedAt, block.updatedAt),
    });
  });

  return compactState({
    blocks: [...blocksById.values()].sort((left, right) => left.updatedAt - right.updatedAt),
    candidates: dedupeById(
      [...current.candidates, ...incoming.candidates],
      (candidate) => candidate.candidateId,
    ),
    diaryEntries: dedupeById(
      [...current.diaryEntries, ...incoming.diaryEntries],
      (entry) => entry.diaryId,
    ),
    promotedCandidateIds: dedupe([
      ...current.promotedCandidateIds,
      ...incoming.promotedCandidateIds,
    ]),
    scopeKey: incoming.scopeKey,
    updatedAt: Math.max(current.updatedAt, incoming.updatedAt),
    version: 1,
  });
}

function dedupeById<T>(items: T[], getId: (item: T) => string) {
  const byId = new Map<string, T>();
  items.forEach((item) => {
    const id = getId(item);
    if (id) {
      byId.set(id, item);
    }
  });
  return [...byId.values()];
}

function normalizeGrilloMemoryState(scopeKey: string, value: unknown): GrilloMemoryState {
  if (!value || typeof value !== 'object') {
    return createDefaultGrilloMemoryState(scopeKey);
  }

  const source = value as Partial<GrilloMemoryState>;
  return compactState({
    blocks: Array.isArray(source.blocks)
      ? source.blocks.map(normalizeBlock).filter(isGrilloMemoryBlock)
      : [],
    candidates: Array.isArray(source.candidates)
      ? source.candidates.map(normalizeCandidate).filter(isGrilloMemoryCandidate)
      : [],
    diaryEntries: Array.isArray(source.diaryEntries)
      ? source.diaryEntries.map(normalizeDiaryEntry).filter(isGrilloDiaryEntry)
      : [],
    promotedCandidateIds: Array.isArray(source.promotedCandidateIds)
      ? source.promotedCandidateIds.map(String).filter(Boolean)
      : [],
    scopeKey,
    updatedAt:
      typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt)
        ? source.updatedAt
        : Date.now(),
    version: 1,
  });
}

function isGrilloMemoryCandidate(
  value: GrilloMemoryCandidate | null,
): value is GrilloMemoryCandidate {
  return Boolean(value);
}

function isGrilloMemoryBlock(value: GrilloMemoryBlock | null): value is GrilloMemoryBlock {
  return Boolean(value);
}

function isGrilloDiaryEntry(value: GrilloDiaryEntry | null): value is GrilloDiaryEntry {
  return Boolean(value);
}

function normalizeCandidate(value: unknown): GrilloMemoryCandidate | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<GrilloMemoryCandidate>;
  if (!source.candidateId || !source.scopeKey || !source.participantKey || !source.summary) {
    return null;
  }

  return {
    candidateId: String(source.candidateId),
    confidence: clamp01(Number(source.confidence ?? 0)),
    content: String(source.content ?? '').slice(0, 600),
    createdAt: normalizeTimestamp(source.createdAt),
    participantKey: String(source.participantKey),
    scopeKey: String(source.scopeKey),
    source: source.source === 'local' ? 'local' : 'twitch',
    sourceTurnIds: Array.isArray(source.sourceTurnIds)
      ? source.sourceTurnIds.map(String).filter(Boolean)
      : [],
    summary: String(source.summary).slice(0, 260),
    type: normalizeCandidateType(source.type),
  };
}

function normalizeBlock(value: unknown): GrilloMemoryBlock | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<GrilloMemoryBlock>;
  if (!source.blockId || !source.scopeKey || !source.participantKey || !source.blockName) {
    return null;
  }

  return {
    blockId: String(source.blockId),
    blockName: normalizeBlockName(source.blockName),
    createdAt: normalizeTimestamp(source.createdAt),
    items: Array.isArray(source.items) ? dedupe(source.items.map(String)).slice(0, 20) : [],
    participantKey: String(source.participantKey),
    scopeKey: String(source.scopeKey),
    sourceCandidateIds: Array.isArray(source.sourceCandidateIds)
      ? source.sourceCandidateIds.map(String).filter(Boolean)
      : [],
    updatedAt: normalizeTimestamp(source.updatedAt),
  };
}

function normalizeDiaryEntry(value: unknown): GrilloDiaryEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<GrilloDiaryEntry> & Record<string, unknown>;
  const diaryId = source.diaryId ?? source['diary_id'];
  const participantKey = source.participantKey ?? source['participant_key'];
  const scopeKey = source.scopeKey ?? source['scope_key'];
  if (!diaryId || !scopeKey || !participantKey || !source.summary) {
    return null;
  }
  const beatType = String(source.beatType ?? source['beat_type'] ?? 'extraction')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 80);

  const entry: GrilloDiaryEntry = {
    beatType: beatType || 'extraction',
    content: normalizeOptionalString(source.content, 600),
    contextTags: normalizeStringArray(source.contextTags ?? source['context_tags'], 12),
    createdAt: normalizeTimestamp(source.createdAt),
    diaryId: String(diaryId),
    emotions: normalizeDiaryEmotions(source.emotions),
    interactionSummary: normalizeOptionalString(
      source.interactionSummary ?? source['interaction_summary'],
      320,
    ),
    involvedUsers: normalizeStringArray(source.involvedUsers ?? source['involved_users'], 12),
    participantKey: String(participantKey),
    personalThought: String(source.personalThought ?? source['personal_thought'] ?? '').slice(
      0,
      320,
    ),
    scopeKey: String(scopeKey),
    sourceTurnIds: normalizeStringArray(source.sourceTurnIds ?? source['source_turn_ids'], 50),
    summary: String(source.summary).slice(0, 320),
    tags: normalizeStringArray(source.tags, 12),
    userMessage: normalizeOptionalString(source.userMessage ?? source['user_message'], 600),
  };

  return isReflectiveDiaryEntry(entry) ? entry : null;
}

function normalizeOptionalString(value: unknown, maxLength: number) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
  return normalized || undefined;
}

function normalizeStringArray(value: unknown, maxItems: number) {
  return Array.isArray(value) ? dedupe(value.map(String)).slice(0, maxItems) : [];
}

function normalizeDiaryEmotions(value: unknown): GrilloDiaryEntry['emotions'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      const name = String(source['name'] ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 64);
      const intensity = clampNumber(Number(source['intensity'] ?? 0), 0, 10);
      return name ? { intensity, name } : null;
    })
    .filter((item): item is { intensity: number; name: string } => Boolean(item))
    .slice(0, 8);
}

function isReflectiveDiaryEntry(entry: GrilloDiaryEntry) {
  const summary = entry.summary.replace(/\s+/g, ' ').trim().toLowerCase();
  const personalThought = entry.personalThought.replace(/\s+/g, ' ').trim().toLowerCase();
  return !(summary.startsWith('processed ') && personalThought.startsWith('i noticed '));
}

function normalizeCandidateType(value: unknown): GrilloCandidateType {
  const normalized = String(value ?? '').trim();
  if (
    normalized === 'preference' ||
    normalized === 'fact' ||
    normalized === 'goal' ||
    normalized === 'boundary' ||
    normalized === 'bond_signal' ||
    normalized === 'thread'
  ) {
    return normalized;
  }
  return 'thread';
}

function normalizeBlockName(value: unknown): GrilloBlockName {
  const normalized = String(value ?? '').trim();
  if (
    normalized === 'preferences' ||
    normalized === 'boundaries' ||
    normalized === 'relationship_state' ||
    normalized === 'ongoing_topics' ||
    normalized === 'verified_facts' ||
    normalized === 'open_threads'
  ) {
    return normalized;
  }
  return 'ongoing_topics';
}

function normalizeTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Date.now();
}

function storageKey(scopeKey: string) {
  return `${STORAGE_KEY_PREFIX}${scopeKey.replace(/[^a-z0-9:_-]+/gi, '-').slice(0, 180)}`;
}

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function dedupe(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push(normalized);
  });
  return output;
}

function tokenize(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_'-]+/g)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const term of a) {
    if (b.has(term)) {
      overlap += 1;
    }
  }

  return overlap / (a.size + b.size - overlap);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
}
