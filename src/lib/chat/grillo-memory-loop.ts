import type { ChatTurn } from './chat-turn';
import {
  buildGrilloMemoryPromptAdditions,
  getGrilloParticipantKey,
  loadGrilloMemoryState,
  promoteGrilloCandidates,
  saveGrilloMemoryState,
  type GrilloBlockName,
  type GrilloCandidateType,
  type GrilloDiaryEntry,
  type GrilloMemoryBlock,
  type GrilloMemoryCandidate,
} from './grillo-memory';
import type { ChatMessage, PersonaProfile, RelationshipMemory } from './types';

export type GrilloWorkerLoopMessage = {
  role: string;
  content: string;
};

export type GrilloWorkerLoopCompletionRequest = {
  maxTokens: number;
  messages: GrilloWorkerLoopMessage[];
  model: string;
  responseFormat: { type: 'json_object' };
  stateKey: string;
  stateScope: 'memory';
  temperature: number;
};

export type GrilloWorkerLoopCompletion = (
  request: GrilloWorkerLoopCompletionRequest,
) => Promise<string>;

export type GrilloWorkerToolCall = {
  args: Record<string, unknown>;
  name: GrilloWorkerToolName;
};

export type GrilloWorkerToolName =
  | 'core.worker_memory_read'
  | 'core.worker_memory_search'
  | 'core.worker_candidate_list'
  | 'core.worker_candidate_write'
  | 'core.worker_diary_write'
  | 'core.worker_memory_write'
  | 'core.worker_memory_insert_archival';

export type GrilloWorkerLoopResult = {
  finalJsonText: string;
  rounds: number;
  sideEffects: {
    archivalWrites: number;
    candidateIds: string[];
    diaryIds: string[];
    slotWrites: number;
  };
  toolCalls: Array<{
    args: Record<string, unknown>;
    name: string;
    result: unknown;
  }>;
};

type RunGrilloMemoryWorkerLoopOptions = {
  complete: GrilloWorkerLoopCompletion;
  history: ChatMessage[];
  maxRounds?: number;
  model: string;
  persona: PersonaProfile | null;
  relationshipMemory: RelationshipMemory;
  scopeKey: string;
  turns: ChatTurn[];
};

type ParsedWorkerResponse = {
  candidate?: unknown;
  diary?: unknown;
  done?: unknown;
  final?: unknown;
  memory?: unknown;
  notes?: unknown;
  relationship?: unknown;
  toolCalls?: unknown;
  tool_calls?: unknown;
};

const TOOL_NAMES = new Set<GrilloWorkerToolName>([
  'core.worker_memory_read',
  'core.worker_memory_search',
  'core.worker_candidate_list',
  'core.worker_candidate_write',
  'core.worker_diary_write',
  'core.worker_memory_write',
  'core.worker_memory_insert_archival',
]);

const CANDIDATE_TYPES = new Set<GrilloCandidateType>([
  'preference',
  'fact',
  'goal',
  'boundary',
  'bond_signal',
  'thread',
]);

const BLOCK_NAMES = new Set<GrilloBlockName>([
  'preferences',
  'boundaries',
  'relationship_state',
  'ongoing_topics',
  'verified_facts',
  'open_threads',
]);

export async function runGrilloMemoryWorkerLoop({
  complete,
  history,
  maxRounds = 4,
  model,
  persona,
  relationshipMemory,
  scopeKey,
  turns,
}: RunGrilloMemoryWorkerLoopOptions): Promise<GrilloWorkerLoopResult> {
  const sideEffects: GrilloWorkerLoopResult['sideEffects'] = {
    archivalWrites: 0,
    candidateIds: [],
    diaryIds: [],
    slotWrites: 0,
  };
  const toolCalls: GrilloWorkerLoopResult['toolCalls'] = [];
  const participantKeys = getParticipantKeys(scopeKey, turns);
  const messages = buildInitialWorkerMessages({
    history,
    participantKeys,
    persona,
    relationshipMemory,
    scopeKey,
    turns,
  });

  let finalJsonText = '';

  for (let round = 1; round <= maxRounds; round += 1) {
    const raw = await complete({
      maxTokens: 700,
      messages,
      model,
      responseFormat: { type: 'json_object' },
      stateKey: `memory:${scopeKey}`,
      stateScope: 'memory',
      temperature: 0.25,
    });
    finalJsonText = raw.trim();

    const parsed = parseJsonLoose(finalJsonText) as ParsedWorkerResponse | null;
    const calls = normalizeToolCalls(parsed);
    const recoveryCalls = buildRecoveryToolCalls(parsed, calls, sideEffects);
    const allCalls = [...calls, ...recoveryCalls];

    if (allCalls.length === 0) {
      return {
        finalJsonText,
        rounds: round,
        sideEffects,
        toolCalls,
      };
    }

    messages.push({
      role: 'assistant',
      content: finalJsonText,
    });

    for (const call of allCalls) {
      const result = executeGrilloWorkerTool({
        call,
        participantKeys,
        scopeKey,
        sideEffects,
        turns,
      });
      toolCalls.push({
        args: call.args,
        name: call.name,
        result,
      });
      messages.push({
        role: 'user',
        content: JSON.stringify({
          tool: call.name,
          result,
        }),
      });
    }

    messages.push({
      role: 'user',
      content:
        'Continue the worker loop. Use more tools if needed. If the memory pass is complete, return {"done":true,"relationship":{...},"notes":"..."}.',
    });
  }

  return {
    finalJsonText,
    rounds: maxRounds,
    sideEffects,
    toolCalls,
  };
}

export function extractGrilloWorkerRelationshipJson(raw: string) {
  const parsed = parseJsonLoose(raw);
  if (!parsed) {
    return raw;
  }

  const nested = parsed['relationship'] ?? parsed['memory'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return JSON.stringify(nested);
  }

  return JSON.stringify(parsed);
}

function buildInitialWorkerMessages({
  history,
  participantKeys,
  persona,
  relationshipMemory,
  scopeKey,
  turns,
}: {
  history: ChatMessage[];
  participantKeys: string[];
  persona: PersonaProfile | null;
  relationshipMemory: RelationshipMemory;
  scopeKey: string;
  turns: ChatTurn[];
}): GrilloWorkerLoopMessage[] {
  const state = loadGrilloMemoryState(scopeKey);
  const recentHistory = history
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .slice(-18)
    .map((message) => `${message.role}: ${message.content.replace(/\s+/g, ' ').trim()}`)
    .join('\n');
  const turnTranscript = turns
    .map((turn) => `${turn.displayName} (${getGrilloParticipantKey(turn)}): ${turn.text}`)
    .join('\n');

  return [
    {
      role: 'system',
      content: [
        `You are the background sleep-time memory agent for ${persona?.name ?? 'YourWifey'}.`,
        'You are not writing a user-facing chat reply.',
        'Run a tool loop over Grillo memory. Return only JSON each round.',
        'Use tools to inspect and write memory. Do not claim a write happened unless you call a write tool.',
        'Write durable memory candidates for explicit preferences, facts, goals, boundaries, bond signals, and ongoing threads.',
        'Write diary entries as private first-person reflections from the avatar perspective.',
        'Use memory_write only for consolidated slot updates that are already well grounded.',
        'When done, return {"done":true,"relationship":{...},"notes":"short status"}.',
        'relationship must use the legacy merge shape when useful: actionTag,mood,trustDelta,attractionDelta,respectDelta,irritationDelta,jealousyDelta,guardDelta,facts,summary,rikoDiaryEntry.',
        '',
        'Available tools:',
        '- core.worker_memory_read args: {"block_name"?: "preferences|boundaries|relationship_state|ongoing_topics|verified_facts|open_threads"}',
        '- core.worker_memory_search args: {"query": string, "limit"?: number}',
        '- core.worker_candidate_list args: {"limit"?: number, "type_filter"?: "preference|fact|goal|boundary|bond_signal|thread"}',
        '- core.worker_candidate_write args: {"type": string, "content": string, "summary": string, "confidence": number, "tags"?: string[], "origin_turn_id"?: string}',
        '- core.worker_diary_write args: {"summary": string, "personal_thought": string, "tags": string[], "beat_type"?: string}',
        '- core.worker_memory_write args: {"block_name": string, "items": string[], "operation": "merge|replace", "reason"?: string, "source_candidate_ids"?: string[]}',
        '- core.worker_memory_insert_archival args: {"text": string, "metadata"?: object}',
        '',
        'To call tools, return JSON: {"toolCalls":[{"name":"core.worker_memory_read","args":{}}]}',
        'You may also include candidate or diary objects; the runtime will recover them into tool calls if you forgot the write tool.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `scopeKey: ${scopeKey}`,
        `participantKeys: ${JSON.stringify(participantKeys)}`,
        `currentTimeIso: ${new Date().toISOString()}`,
        `relationshipMemory: ${JSON.stringify({
          attraction: relationshipMemory.attraction,
          facts: relationshipMemory.facts,
          guard: relationshipMemory.guard,
          irritation: relationshipMemory.irritation,
          jealousy: relationshipMemory.jealousy,
          mood: relationshipMemory.mood,
          respect: relationshipMemory.respect,
          stage: relationshipMemory.relationshipStage,
          summary: relationshipMemory.summary,
          trust: relationshipMemory.trust,
          turnCount: relationshipMemory.turnCount,
        })}`,
        `grilloStateCounts: ${JSON.stringify({
          blocks: state.blocks.length,
          candidates: state.candidates.length,
          diaryEntries: state.diaryEntries.length,
          promotedCandidateIds: state.promotedCandidateIds.length,
        })}`,
        '',
        'Current turns:',
        turnTranscript || '(no current ChatTurn objects available; use recent history)',
        '',
        'Recent chat history:',
        recentHistory || '(none)',
        '',
        'Start by reading/searching memory if useful, then write candidates/diary/slots, then finish.',
      ].join('\n'),
    },
  ];
}

function executeGrilloWorkerTool({
  call,
  participantKeys,
  scopeKey,
  sideEffects,
  turns,
}: {
  call: GrilloWorkerToolCall;
  participantKeys: string[];
  scopeKey: string;
  sideEffects: GrilloWorkerLoopResult['sideEffects'];
  turns: ChatTurn[];
}) {
  try {
    if (call.name === 'core.worker_memory_read') {
      return toolMemoryRead(scopeKey, participantKeys, call.args);
    }
    if (call.name === 'core.worker_memory_search') {
      return toolMemorySearch(scopeKey, participantKeys, call.args);
    }
    if (call.name === 'core.worker_candidate_list') {
      return toolCandidateList(scopeKey, participantKeys, call.args);
    }
    if (call.name === 'core.worker_candidate_write') {
      const result = toolCandidateWrite(scopeKey, participantKeys, turns, call.args);
      if (result.ok && result.candidate_id) {
        sideEffects.candidateIds.push(result.candidate_id);
      }
      return result;
    }
    if (call.name === 'core.worker_diary_write') {
      const result = toolDiaryWrite(scopeKey, participantKeys, turns, call.args);
      if (result.ok && result.diary_id) {
        sideEffects.diaryIds.push(result.diary_id);
      }
      return result;
    }
    if (call.name === 'core.worker_memory_write') {
      const result = toolMemoryWrite(scopeKey, participantKeys, call.args);
      if (result.ok) {
        sideEffects.slotWrites += 1;
      }
      return result;
    }
    if (call.name === 'core.worker_memory_insert_archival') {
      const result = toolArchivalWrite(scopeKey, participantKeys, turns, call.args);
      if (result.ok) {
        sideEffects.archivalWrites += 1;
      }
      return result;
    }
    return { ok: false, error: `Unknown tool: ${call.name}` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Tool execution failed.',
    };
  }
}

function toolMemoryRead(
  scopeKey: string,
  participantKeys: string[],
  args: Record<string, unknown>,
) {
  const state = loadGrilloMemoryState(scopeKey);
  const blockName = normalizeBlockName(args['block_name']);
  const participantSet = new Set(participantKeys);
  const includeParticipant = (participantKey: string) =>
    participantSet.size === 0 || participantSet.has(participantKey);

  return {
    ok: true,
    blocks: state.blocks
      .filter((block) => includeParticipant(block.participantKey))
      .filter((block) => (blockName ? block.blockName === blockName : true))
      .slice(-20),
    candidates: state.candidates
      .filter((candidate) => includeParticipant(candidate.participantKey))
      .slice(-30),
    diaryEntries: state.diaryEntries
      .filter((entry) => includeParticipant(entry.participantKey))
      .slice(-8),
  };
}

function toolMemorySearch(
  scopeKey: string,
  participantKeys: string[],
  args: Record<string, unknown>,
) {
  const query = String(args['query'] ?? '').trim();
  const limit = clampInt(Number(args['limit'] ?? 5), 1, 20);
  if (!query) {
    return { ok: false, error: 'query is required', results: [] };
  }

  const additions = buildGrilloMemoryPromptAdditions({
    limit,
    participantKeys,
    query,
    scopeKey,
  });
  return {
    ok: true,
    results: additions.recalledMemories,
  };
}

function toolCandidateList(
  scopeKey: string,
  participantKeys: string[],
  args: Record<string, unknown>,
) {
  const typeFilter = normalizeCandidateType(args['type_filter']);
  const limit = clampInt(Number(args['limit'] ?? 20), 1, 100);
  const participantSet = new Set(participantKeys);
  const state = loadGrilloMemoryState(scopeKey);
  return {
    ok: true,
    candidates: state.candidates
      .filter(
        (candidate) => participantSet.size === 0 || participantSet.has(candidate.participantKey),
      )
      .filter((candidate) => (typeFilter ? candidate.type === typeFilter : true))
      .slice(-limit)
      .reverse(),
  };
}

function toolCandidateWrite(
  scopeKey: string,
  participantKeys: string[],
  turns: ChatTurn[],
  args: Record<string, unknown>,
) {
  const type = normalizeCandidateType(args['type']);
  const content = String(args['content'] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
  const summary = String(args['summary'] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260);
  const confidence = clamp01(Number(args['confidence'] ?? 0.75));
  if (!type || !content || !summary) {
    return { ok: false, error: 'type, content, and summary are required' };
  }

  const participantKey = participantKeys[0] ?? `${scopeKey}:background`;
  const sourceTurnIds = turns.map((turn) => turn.id);
  const now = Date.now();
  const candidate: GrilloMemoryCandidate = {
    candidateId: `${participantKey}:worker-candidate:${now}:${hashText(summary).toString(36)}`,
    confidence,
    content,
    createdAt: now,
    participantKey,
    scopeKey,
    source: turns[0]?.source ?? 'local',
    sourceTurnIds,
    summary,
    type,
  };
  const state = loadGrilloMemoryState(scopeKey);
  const promoted = promoteGrilloCandidates({
    ...state,
    candidates: [...state.candidates, candidate],
    updatedAt: now,
  });
  saveGrilloMemoryState(promoted);
  return {
    ok: true,
    candidate_id: candidate.candidateId,
    promotedBlocks: promoted.blocks.filter((block) =>
      block.sourceCandidateIds.includes(candidate.candidateId),
    ),
  };
}

function toolDiaryWrite(
  scopeKey: string,
  participantKeys: string[],
  turns: ChatTurn[],
  args: Record<string, unknown>,
) {
  const summary = String(args['summary'] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
  const personalThought = String(args['personal_thought'] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
  const tags = toStringArray(args['tags']).slice(0, 12);
  if (!summary || !personalThought) {
    return { ok: false, error: 'summary and personal_thought are required' };
  }

  const now = Date.now();
  const entry: GrilloDiaryEntry = {
    beatType: args['beat_type'] === 'relationship' ? 'relationship' : 'self_reflection',
    createdAt: now,
    diaryId: `${scopeKey}:worker-diary:${now}:${hashText(summary).toString(36)}`,
    participantKey: participantKeys[0] ?? `${scopeKey}:background`,
    personalThought,
    scopeKey,
    sourceTurnIds: turns.map((turn) => turn.id),
    summary,
    tags,
  };
  const state = loadGrilloMemoryState(scopeKey);
  saveGrilloMemoryState({
    ...state,
    diaryEntries: [...state.diaryEntries, entry].slice(-40),
    updatedAt: now,
  });
  return {
    ok: true,
    diary_id: entry.diaryId,
  };
}

function toolMemoryWrite(
  scopeKey: string,
  participantKeys: string[],
  args: Record<string, unknown>,
) {
  const blockName = normalizeBlockName(args['block_name']);
  const items = dedupe(toStringArray(args['items'])).slice(0, 20);
  const operation = args['operation'] === 'replace' ? 'replace' : 'merge';
  const sourceCandidateIds = dedupe(toStringArray(args['source_candidate_ids']));
  if (!blockName || items.length === 0) {
    return { ok: false, error: 'block_name and items[] are required' };
  }

  const state = loadGrilloMemoryState(scopeKey);
  const participantKey = participantKeys[0] ?? `${scopeKey}:background`;
  const now = Date.now();
  const existing = state.blocks.find(
    (block) => block.participantKey === participantKey && block.blockName === blockName,
  );
  let block: GrilloMemoryBlock;
  if (existing) {
    block = {
      ...existing,
      items: operation === 'replace' ? items : dedupe([...existing.items, ...items]).slice(-20),
      sourceCandidateIds: dedupe([...existing.sourceCandidateIds, ...sourceCandidateIds]),
      updatedAt: now,
    };
  } else {
    block = {
      blockId: `${participantKey}:${blockName}:worker:v1`,
      blockName,
      createdAt: now,
      items,
      participantKey,
      scopeKey,
      sourceCandidateIds,
      updatedAt: now,
    };
  }

  saveGrilloMemoryState({
    ...state,
    blocks: [...state.blocks.filter((item) => item.blockId !== block.blockId), block].slice(-80),
    updatedAt: now,
  });
  return {
    ok: true,
    block_id: block.blockId,
    item_count: block.items.length,
  };
}

function toolArchivalWrite(
  scopeKey: string,
  participantKeys: string[],
  turns: ChatTurn[],
  args: Record<string, unknown>,
) {
  const text = String(args['text'] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) {
    return { ok: false, error: 'text is required' };
  }

  return toolCandidateWrite(scopeKey, participantKeys, turns, {
    confidence: 0.62,
    content: text,
    summary: text.slice(0, 220),
    type: 'thread',
  });
}

function normalizeToolCalls(parsed: ParsedWorkerResponse | null): GrilloWorkerToolCall[] {
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const rawCalls = parsed.toolCalls ?? parsed.tool_calls;
  const candidates = Array.isArray(rawCalls) ? rawCalls : [];
  return candidates
    .map((raw): GrilloWorkerToolCall | null => {
      if (!raw || typeof raw !== 'object') {
        return null;
      }
      const source = raw as Record<string, unknown>;
      const name = String(source['name'] ?? source['toolName'] ?? source['tool'] ?? '').trim();
      if (!TOOL_NAMES.has(name as GrilloWorkerToolName)) {
        return null;
      }
      const args = source['args'] && typeof source['args'] === 'object' ? source['args'] : {};
      return {
        args: args as Record<string, unknown>,
        name: name as GrilloWorkerToolName,
      };
    })
    .filter((call): call is GrilloWorkerToolCall => Boolean(call));
}

function buildRecoveryToolCalls(
  parsed: ParsedWorkerResponse | null,
  calls: GrilloWorkerToolCall[],
  sideEffects: GrilloWorkerLoopResult['sideEffects'],
) {
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const recovery: GrilloWorkerToolCall[] = [];
  const wroteCandidate =
    sideEffects.candidateIds.length > 0 ||
    calls.some((call) => call.name === 'core.worker_candidate_write');
  const wroteDiary =
    sideEffects.diaryIds.length > 0 ||
    calls.some((call) => call.name === 'core.worker_diary_write');

  if (!wroteCandidate && parsed.candidate && typeof parsed.candidate === 'object') {
    recovery.push({
      args: parsed.candidate as Record<string, unknown>,
      name: 'core.worker_candidate_write',
    });
  }

  if (!wroteDiary && parsed.diary && typeof parsed.diary === 'object') {
    recovery.push({
      args: parsed.diary as Record<string, unknown>,
      name: 'core.worker_diary_write',
    });
  }

  return recovery;
}

function parseJsonLoose(raw: string): Record<string, unknown> | null {
  let content = raw.trim();
  const fenceMatch = content.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch?.[1]) {
    content = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }

  return null;
}

function getParticipantKeys(scopeKey: string, turns: ChatTurn[]) {
  const keys = dedupe(turns.map(getGrilloParticipantKey));
  return keys.length > 0 ? keys : [`${scopeKey}:background`];
}

function normalizeCandidateType(value: unknown): GrilloCandidateType | null {
  const normalized = String(value ?? '').trim();
  return CANDIDATE_TYPES.has(normalized as GrilloCandidateType)
    ? (normalized as GrilloCandidateType)
    : null;
}

function normalizeBlockName(value: unknown): GrilloBlockName | null {
  const normalized = String(value ?? '').trim();
  return BLOCK_NAMES.has(normalized as GrilloBlockName) ? (normalized as GrilloBlockName) : null;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) =>
      String(item ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
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

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function hashText(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return hash >>> 0;
}
