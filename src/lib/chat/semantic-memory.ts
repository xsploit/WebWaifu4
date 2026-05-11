import type { PersonaProfile } from './types';

export type SemanticMemoryRecord = {
  id: string;
  createdAt: number;
  personaId: string;
  scopeKey: string;
  text: string;
  userText: string;
  assistantText: string;
  embedding: number[] | null;
};

export type SemanticMemoryMatch = SemanticMemoryRecord & {
  score: number;
};

const MEMORY_KEY_PREFIX = 'yourwifey:semantic-memory:v1:';
const MAX_RECORDS_PER_SCOPE = 80;

export function buildSemanticMemoryTurnText(
  userText: string,
  assistantText: string,
  persona: PersonaProfile | null,
) {
  const personaName = persona?.name?.trim() || 'assistant';
  return [`User: ${userText.trim()}`, `${personaName}: ${assistantText.trim()}`]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2400);
}

export function buildSemanticMemoryContext(matches: SemanticMemoryMatch[]) {
  const usable = matches.filter((match) => match.text.trim()).slice(0, 4);
  if (usable.length === 0) {
    return '';
  }

  return usable
    .map((match, index) => `${index + 1}. ${match.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n');
}

export function loadSemanticMemory(scopeKey: string): SemanticMemoryRecord[] {
  const storage = getLocalStorage();
  if (!storage) {
    return [];
  }

  try {
    const parsed = JSON.parse(storage.getItem(getStorageKey(scopeKey)) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeSemanticMemoryRecord)
      .filter((record): record is SemanticMemoryRecord => Boolean(record));
  } catch {
    return [];
  }
}

export function saveSemanticMemory(scopeKey: string, records: SemanticMemoryRecord[]) {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  const normalized = records
    .map(normalizeSemanticMemoryRecord)
    .filter((record): record is SemanticMemoryRecord => Boolean(record))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_RECORDS_PER_SCOPE);

  storage.setItem(getStorageKey(scopeKey), JSON.stringify(normalized));
}

export function addSemanticMemoryTurn({
  assistantText,
  embedding,
  persona,
  scopeKey,
  userText,
}: {
  assistantText: string;
  embedding: number[] | null;
  persona: PersonaProfile | null;
  scopeKey: string;
  userText: string;
}) {
  const text = buildSemanticMemoryTurnText(userText, assistantText, persona);
  if (text.length < 24) {
    return;
  }

  const records = loadSemanticMemory(scopeKey);
  const record: SemanticMemoryRecord = {
    id: `${Date.now()}-${hashText(text).toString(36)}`,
    createdAt: Date.now(),
    personaId: persona?.id ?? 'unknown',
    scopeKey,
    text,
    userText: userText.trim().slice(0, 1200),
    assistantText: assistantText.trim().slice(0, 1200),
    embedding: normalizeEmbedding(embedding),
  };

  saveSemanticMemory(scopeKey, [record, ...records]);
}

export function findSemanticMemoryMatches(
  scopeKey: string,
  query: string,
  queryEmbedding: number[] | null,
  limit = 4,
): SemanticMemoryMatch[] {
  const normalizedQueryEmbedding = normalizeEmbedding(queryEmbedding);
  const queryTerms = tokenize(query);
  return loadSemanticMemory(scopeKey)
    .map((record) => ({
      ...record,
      score: scoreSemanticMemory(record, queryTerms, normalizedQueryEmbedding),
    }))
    .filter((record) => record.score > 0.05)
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, limit);
}

function scoreSemanticMemory(
  record: SemanticMemoryRecord,
  queryTerms: Set<string>,
  queryEmbedding: number[] | null,
) {
  const vectorScore =
    queryEmbedding && record.embedding ? cosineSimilarity(queryEmbedding, record.embedding) : 0;
  const lexicalScore = jaccardSimilarity(queryTerms, tokenize(record.text));
  const recencyScore = Math.max(0, 1 - (Date.now() - record.createdAt) / (1000 * 60 * 60 * 24 * 30));
  return vectorScore * 0.78 + lexicalScore * 0.18 + recencyScore * 0.04;
}

function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }

  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    aMag += av * av;
    bMag += bv * bv;
  }

  if (aMag === 0 || bMag === 0) {
    return 0;
  }
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
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

function tokenize(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9_'-]+/g)
      .map((term) => term.trim())
      .filter((term) => term.length >= 3),
  );
}

function normalizeSemanticMemoryRecord(value: unknown): SemanticMemoryRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Partial<SemanticMemoryRecord>;
  const text = typeof source.text === 'string' ? source.text.trim().slice(0, 2400) : '';
  if (!source.id || !source.scopeKey || !text) {
    return null;
  }

  return {
    id: String(source.id),
    createdAt:
      typeof source.createdAt === 'number' && Number.isFinite(source.createdAt)
        ? source.createdAt
        : Date.now(),
    personaId: String(source.personaId ?? 'unknown'),
    scopeKey: String(source.scopeKey),
    text,
    userText: String(source.userText ?? '').slice(0, 1200),
    assistantText: String(source.assistantText ?? '').slice(0, 1200),
    embedding: normalizeEmbedding(source.embedding),
  };
}

function normalizeEmbedding(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const embedding = value
    .map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : null))
    .filter((item): item is number => item !== null);
  return embedding.length > 0 ? embedding : null;
}

function getStorageKey(scopeKey: string) {
  return `${MEMORY_KEY_PREFIX}${scopeKey.replace(/[^a-z0-9:_-]+/gi, '-').slice(0, 160)}`;
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

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
}
