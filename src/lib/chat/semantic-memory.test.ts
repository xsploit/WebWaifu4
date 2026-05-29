import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PERSONA } from './defaults';
import {
  addSemanticMemoryTurn,
  buildSemanticMemoryContext,
  clearSemanticMemory,
  findSemanticMemoryMatchesInRecords,
  loadSemanticMemory,
  normalizeSemanticAssistantText,
  scoreSemanticMemoryRecord,
  type SemanticMemoryRecord,
} from './semantic-memory';

function createStorage() {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function createRecord(overrides: Partial<SemanticMemoryRecord> = {}): SemanticMemoryRecord {
  return {
    assistantText: overrides.assistantText ?? 'Got it.',
    createdAt: overrides.createdAt ?? Date.parse('2026-05-14T08:00:00.000Z'),
    embedding: overrides.embedding ?? null,
    id: overrides.id ?? 'record-1',
    personaId: overrides.personaId ?? DEFAULT_PERSONA.id,
    scopeKey: overrides.scopeKey ?? 'local:persona:neuro-sama',
    text: overrides.text ?? 'User: remember I like vector memory\nNeuro-sama: Got it.',
    userText: overrides.userText ?? 'remember I like vector memory',
  };
}

let scopeCounter = 0;

function createTestScope(label: string) {
  scopeCounter += 1;
  return `test:${label}:${Date.now()}:${scopeCounter}`;
}

describe('semantic memory', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      localStorage: createStorage(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores embedded memories through the fallback browser store', async () => {
    const scopeKey = createTestScope('embedded');

    const write = await addSemanticMemoryTurn({
      assistantText: 'Fine, I will remember your excellent taste.',
      embedding: [1, 0, 0],
      persona: DEFAULT_PERSONA,
      scopeKey,
      userText: 'remember I like vector memory',
    });

    const records = await loadSemanticMemory(scopeKey);

    expect(write).toMatchObject({
      totalIndexed: 1,
      vectorDims: 3,
    });
    expect(write?.record.embedding).toEqual([1, 0, 0]);
    expect(records).toHaveLength(1);
    expect(records[0]?.scopeKey).toBe(scopeKey);
    expect(records[0]?.embedding).toEqual([1, 0, 0]);
    expect(records[0]?.text).toContain('vector memory');
  });

  it('normalizes structured assistant JSON before saving semantic memory', async () => {
    const scopeKey = createTestScope('structured-json');

    const write = await addSemanticMemoryTurn({
      assistantText:
        '{"message":"Yep, I can search when you ask. [smirk]","emotion":"curious"}',
      embedding: [1, 0, 0],
      persona: DEFAULT_PERSONA,
      scopeKey,
      userText: 'you got search tools right?',
    });

    expect(write?.record.assistantText).toBe('Yep, I can search when you ask. [smirk]');
    expect(write?.record.text).toContain('Neuro-sama: Yep, I can search when you ask. [smirk]');
    expect(write?.record.text).not.toContain('"emotion"');
  });

  it('normalizes legacy semantic records with structured assistant JSON on load', async () => {
    const normalized = normalizeSemanticAssistantText(
      '{"message":"Clean visible reply.","emotion":"happy"}',
    );

    expect(normalized).toBe('Clean visible reply.');
  });

  it('strips assistant metadata tags from semantic assistant text', () => {
    expect(
      normalizeSemanticAssistantText(
        'Visible reply. <yw-meta>{"emotion":"amused"}</yw-meta>',
      ),
    ).toBe('Visible reply.');
  });

  it('clears semantic memories for a scope when saved empty', async () => {
    const scopeKey = createTestScope('clear');

    await addSemanticMemoryTurn({
      assistantText: 'Saved.',
      embedding: [1, 0, 0],
      persona: DEFAULT_PERSONA,
      scopeKey,
      userText: 'remember my favorite stage is chroma',
    });
    await clearSemanticMemory(scopeKey);

    expect(await loadSemanticMemory(scopeKey)).toEqual([]);
  });

  it('ranks local vector matches above unrelated lexical records', () => {
    const records = [
      createRecord({
        embedding: [1, 0],
        id: 'vector-hit',
        text: 'User: remember my favorite TTS voice is Hikari raspy\nNeuro-sama: filed.',
      }),
      createRecord({
        embedding: [0, 1],
        id: 'lexical-noise',
        text: 'User: memory memory memory unrelated queue topic\nNeuro-sama: okay.',
      }),
    ];

    const matches = findSemanticMemoryMatchesInRecords(records, 'which voice do I like?', [1, 0]);

    expect(matches[0]?.id).toBe('vector-hit');
    expect(matches[0]?.score).toBeGreaterThan(matches[1]?.score ?? 0);
  });

  it('falls back to lexical/recency scoring when embeddings are unavailable', () => {
    const record = createRecord({
      embedding: null,
      text: 'User: remember I prefer local chat controls\nNeuro-sama: saved.',
    });

    const score = scoreSemanticMemoryRecord(record, 'local chat controls', null);

    expect(score).toBeGreaterThan(0.05);
    expect(buildSemanticMemoryContext([{ ...record, score }])).toContain('local chat controls');
  });

  it('keeps emotionally useful memories competitive after recency decay', () => {
    const records = [
      createRecord({
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
        embedding: null,
        id: 'salient-old',
        text: 'User: remember my favorite stage is chroma and I love using it for streams\nNeuro-sama: saved.',
      }),
      createRecord({
        createdAt: Date.now() - 1000 * 60,
        embedding: null,
        id: 'recent-low-signal',
        text: 'User: stage topic mentioned briefly\nNeuro-sama: okay.',
      }),
    ];

    const matches = findSemanticMemoryMatchesInRecords(records, 'what is my favorite stage?', null);

    expect(matches[0]?.id).toBe('salient-old');
  });
});
