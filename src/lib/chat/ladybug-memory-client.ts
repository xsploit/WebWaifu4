import { getDesktopBackendUrl, isDesktopRuntime } from '../desktop/runtime';
import type { GrilloMemoryState } from './grillo-memory';
import type { SemanticMemoryRecord } from './semantic-memory';
import type { RelationshipMemory } from './types';

export type LadybugMemoryStatus = {
  backend: string;
  candidates?: number;
  dbDir?: string;
  diaryEntries?: number;
  emotionIntensities?: number;
  emotionStates?: number;
  grilloScopes?: number;
  memoryBlocks?: number;
  participants?: number;
  personas?: number;
  relationshipFacts?: number;
  relationshipProfiles?: number;
  relationshipEdges?: number;
  scopes?: number;
  ok?: boolean;
  semanticRecords?: number;
  semanticScopes?: number;
  semanticVectors?: number;
  snapshots?: number;
};

export type LadybugMemoryGraphSummary = {
  edges: Array<{ count: number; relation: string }>;
  participants: Array<{ channel: string; displayName: string; id: string; source: string }>;
  personas: Array<{ id: string; name: string }>;
  recent: {
    blocks: Array<{
      blockName: string;
      id: string;
      itemCount: number;
      items: string[];
      participantKey: string;
      scopeKey: string;
    }>;
    candidates: Array<{ id: string; participantKey: string; summary: string; type: string }>;
    diary: Array<{ beatType: string; id: string; participantKey: string; summary: string }>;
    emotions: Array<{
      id: string;
      lastSignalSource: string;
      scopeKey: string;
      updatedAt: number;
    }>;
    relationships: Array<{
      id: string;
      mood: string;
      relationshipStage: string;
      scopeKey: string;
      summary: string;
    }>;
    relationshipFacts: Array<{ id: string; scopeKey: string; text: string }>;
    semantic: Array<{ id: string; personaId: string; text: string }>;
    vectors: Array<{ id: string; personaId: string; text: string }>;
  };
  scopes: Array<{ channel: string; id: string; personaId: string; source: string }>;
};

type LadybugResponse<T> = T & {
  backend?: string;
  error?: string;
  ok?: boolean;
};

export function canUseLadybugMemoryBackend() {
  return isDesktopRuntime();
}

export async function loadLadybugGrilloState(scopeKey: string) {
  const response = await requestLadybugMemory<{
    scopeKey: string;
    state: unknown;
  }>(`/memory/grillo?scopeKey=${encodeURIComponent(scopeKey)}`);
  if (!response || response.ok !== true) {
    return undefined;
  }
  return response.state as GrilloMemoryState | null;
}

export async function saveLadybugGrilloState(scopeKey: string, state: GrilloMemoryState) {
  const response = await requestLadybugMemory('/memory/grillo', {
    body: JSON.stringify({ scopeKey, state }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return response?.ok === true;
}

export async function deleteLadybugGrilloState(scopeKey: string) {
  const response = await requestLadybugMemory(
    `/memory/grillo?scopeKey=${encodeURIComponent(scopeKey)}`,
    { method: 'DELETE' },
  );
  return response?.ok === true;
}

export async function loadLadybugSemanticMemory(scopeKey: string) {
  const response = await requestLadybugMemory<{
    records: unknown;
    scopeKey: string;
  }>(`/memory/semantic?scopeKey=${encodeURIComponent(scopeKey)}`);
  if (!response || response.ok !== true || !Array.isArray(response.records)) {
    return undefined;
  }
  return response.records as SemanticMemoryRecord[];
}

export async function saveLadybugSemanticMemory(
  scopeKey: string,
  records: SemanticMemoryRecord[],
) {
  const response = await requestLadybugMemory('/memory/semantic', {
    body: JSON.stringify({ scopeKey, records }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return response?.ok === true;
}

export async function deleteLadybugSemanticMemory(scopeKey: string) {
  const response = await requestLadybugMemory(
    `/memory/semantic?scopeKey=${encodeURIComponent(scopeKey)}`,
    { method: 'DELETE' },
  );
  return response?.ok === true;
}

export async function searchLadybugSemanticMemory(
  scopeKey: string,
  embedding: number[] | null,
  limit: number,
) {
  if (!embedding?.length) {
    return undefined;
  }
  const response = await requestLadybugMemory<{
    matches: unknown;
    scopeKey: string;
  }>('/memory/semantic/search', {
    body: JSON.stringify({ scopeKey, embedding, limit }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (!response || response.ok !== true || !Array.isArray(response.matches)) {
    return undefined;
  }
  return response.matches as Array<SemanticMemoryRecord & { distance: number; score: number }>;
}

export async function loadLadybugRelationshipMemories() {
  const response = await requestLadybugMemory<{
    profiles: unknown;
  }>('/memory/relationships');
  if (!response || response.ok !== true || !response.profiles || typeof response.profiles !== 'object') {
    return undefined;
  }
  return response.profiles as Record<string, RelationshipMemory>;
}

export async function saveLadybugRelationshipMemories(
  profiles: Record<string, RelationshipMemory>,
) {
  const response = await requestLadybugMemory('/memory/relationships', {
    body: JSON.stringify({ profiles }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return response?.ok === true;
}

export async function deleteLadybugRelationshipMemory(scopeKey: string) {
  const response = await requestLadybugMemory(
    `/memory/relationships?scopeKey=${encodeURIComponent(scopeKey)}`,
    { method: 'DELETE' },
  );
  return response?.ok === true;
}

export async function loadLadybugMemoryStatus() {
  return requestLadybugMemory<LadybugMemoryStatus>('/memory/status');
}

export async function loadLadybugMemoryGraph() {
  const response = await requestLadybugMemory<{ graph: LadybugMemoryGraphSummary }>(
    '/memory/graph',
  );
  return response?.ok === true ? response.graph : null;
}

async function requestLadybugMemory<T>(
  path: string,
  init?: RequestInit,
): Promise<LadybugResponse<T> | null> {
  if (!canUseLadybugMemoryBackend()) {
    return null;
  }
  const url = getDesktopBackendUrl(path);
  if (!url) {
    return null;
  }
  try {
    const response = await fetch(url, init);
    return (await response.json()) as LadybugResponse<T>;
  } catch {
    return null;
  }
}
