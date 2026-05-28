import { randomUUID } from 'node:crypto';
import type {
  LadybugMemoryService,
  LadybugMemorySlotPatchRecord,
  LadybugMemorySlotRecord,
} from './LadybugMemoryService.js';

export type GrilloTurnIngestInput = {
  assistantName?: unknown;
  assistantText?: unknown;
  authorName?: unknown;
  channelId?: unknown;
  createdAt?: unknown;
  interfacePath?: unknown;
  participantKey?: unknown;
  scopeKey?: unknown;
  source?: unknown;
  userText?: unknown;
};

export type GrilloManualRunInput = {
  beatType?: unknown;
  candidate?: unknown;
  diary?: unknown;
  participantKey?: unknown;
  responseText?: unknown;
  scopeKey?: unknown;
  slot?: unknown;
  trace?: unknown;
};

export type GrilloManualRunResult = {
  activityId: string;
  beatType: string;
  candidateIds: string[];
  diaryIds: string[];
  slotIds: string[];
  traceId: string;
  writes: number;
};

export type GrilloContextPacketInput = {
  participantKeys?: unknown;
  query?: unknown;
  scopeKey?: unknown;
};

export type GrilloContextPacket = {
  background_information: string[];
  channel_history: string[];
  generatedAt: number;
  output_description: string[];
  recalled_memories: Array<{ score?: number; text: string }>;
  relationship_memory: string[];
  scopeKey: string;
  thoughts: string[];
};

export class GrilloWorkerService {
  constructor(
    private readonly memory: LadybugMemoryService,
    private readonly nowMs: () => number = () => Date.now(),
    private readonly idFactory: () => string = () => randomUUID(),
  ) {}

  async ingestTurnPair(input: GrilloTurnIngestInput) {
    const scopeKey = normalizeKey(input.scopeKey, 'local:persona:default');
    const participantKey = normalizeKey(input.participantKey, '');
    const channelId = normalizeKey(input.channelId, inferChannel(scopeKey));
    const source = normalizeKey(input.source, inferSource(scopeKey));
    const interfacePath = normalizeKey(input.interfacePath, `${source}/${channelId}`);
    const createdAt = numberOrNow(input.createdAt, this.nowMs);
    const writtenTurnIds: string[] = [];

    const userText = normalizeText(input.userText);
    if (userText) {
      const turnId = this.idFactory();
      await this.memory.appendGrilloRecord('turn_events', {
        author_name: normalizeText(input.authorName) || 'User',
        channel_id: channelId,
        content: userText,
        created_at: createdAt,
        interface_path: interfacePath,
        participant_key: participantKey,
        role: 'user',
        scope_key: scopeKey,
        source,
        turn_id: turnId,
        user_id: scopeKey,
      });
      writtenTurnIds.push(turnId);
    }

    const assistantText = normalizeText(input.assistantText);
    if (assistantText) {
      const turnId = this.idFactory();
      await this.memory.appendGrilloRecord('turn_events', {
        author_name: normalizeText(input.assistantName) || 'Assistant',
        channel_id: channelId,
        content: assistantText,
        created_at: createdAt + 1,
        interface_path: interfacePath,
        role: 'assistant',
        scope_key: scopeKey,
        source,
        turn_id: turnId,
        user_id: scopeKey,
      });
      writtenTurnIds.push(turnId);
    }

    return {
      scopeKey,
      turnIds: writtenTurnIds,
      writes: writtenTurnIds.length,
    };
  }

  async runManualExtraction(input: GrilloManualRunInput): Promise<GrilloManualRunResult> {
    const scopeKey = normalizeKey(input.scopeKey, 'local:persona:default');
    const participantKey = normalizeKey(input.participantKey, '');
    const beatType = normalizeKey(input.beatType, 'extraction');
    const createdAt = this.nowMs();
    const candidateIds: string[] = [];
    const diaryIds: string[] = [];
    const slotIds: string[] = [];
    let writes = 0;

    const trace = asRecord(input.trace);
    const traceId = this.idFactory();
    await this.memory.appendGrilloRecord('worker_context_traces', {
      beat_type: beatType,
      created_at: createdAt,
      model: normalizeText(trace['model']),
      prompt: normalizeText(trace['prompt']),
      provider: normalizeText(trace['provider']),
      scope_key: scopeKey,
      system_prompt: normalizeText(trace['systemPrompt'] ?? trace['system_prompt']),
      task_type: 'manual_extraction',
      trace_id: traceId,
      user_id: scopeKey,
    });

    const candidate = asRecord(input.candidate);
    const candidateContent = normalizeText(candidate['content']);
    const candidateSummary = normalizeText(candidate['summary']);
    if (candidateContent && candidateSummary) {
      const candidateId = this.idFactory();
      await this.memory.appendGrilloRecord('memory_candidates', {
        candidate_id: candidateId,
        confidence: clampNumber(candidate['confidence'], 0, 1, 0.7),
        content: candidateContent,
        created_at: createdAt + 1,
        evidence_turn_ids: readStringArray(candidate['sourceTurnIds'] ?? candidate['source_turn_ids']),
        participant_key: participantKey,
        scope_key: scopeKey,
        source: normalizeText(candidate['source']) || 'manual',
        summary: candidateSummary,
        tags: readStringArray(candidate['tags']),
        type: normalizeCandidateType(candidate['type']),
        user_id: scopeKey,
      });
      candidateIds.push(candidateId);
      writes += 1;
    }

    const diary = asRecord(input.diary);
    const diarySummary = normalizeText(diary['summary']);
    const personalThought = normalizeText(diary['personalThought'] ?? diary['personal_thought']);
    if (diarySummary && personalThought) {
      const diaryId = this.idFactory();
      await this.memory.appendGrilloRecord('diary_entries', {
        beat_type: normalizeText(diary['beatType'] ?? diary['beat_type']) || beatType,
        created_at: createdAt + 2,
        diary_id: diaryId,
        interaction_summary: normalizeText(diary['interactionSummary'] ?? diary['interaction_summary']),
        participant_key: participantKey,
        personal_thought: personalThought,
        scope_key: scopeKey,
        source_turn_ids: readStringArray(diary['sourceTurnIds'] ?? diary['source_turn_ids']),
        summary: diarySummary,
        tags: readStringArray(diary['tags']),
        user_id: scopeKey,
      });
      diaryIds.push(diaryId);
      writes += 1;
    }

    const slot = asRecord(input.slot);
    const slotName = normalizeText(slot['slotName'] ?? slot['slot_name']);
    const slotItems = readStringArray(slot['items']);
    if (slotName && slotItems.length > 0) {
      const slotId = normalizeText(slot['slotId'] ?? slot['slot_id']) || `${scopeKey}:${slotName}`;
      const sourceCandidateIds = readStringArray(
        slot['sourceCandidateIds'] ?? slot['source_candidate_ids'],
      );
      const slotRecord: LadybugMemorySlotRecord & {
        participant_key: string;
        scope_key: string;
      } = {
        content_json: JSON.stringify(slotItems),
        participant_key: participantKey,
        schema_version: '1.0.0',
        slot_id: slotId,
        slot_name: slotName,
        scope_key: scopeKey,
        source_candidate_ids_json: JSON.stringify(sourceCandidateIds),
        updated_at: String(createdAt + 3),
        user_id: scopeKey,
      };
      await this.memory.upsertGrilloMemorySlot(slotRecord);

      const patchRecord: LadybugMemorySlotPatchRecord & {
        participant_key: string;
        scope_key: string;
      } = {
        created_at: String(createdAt + 3),
        operation: normalizeSlotOperation(slot['operation']),
        participant_key: participantKey,
        patch_id: this.idFactory(),
        patch_json: JSON.stringify({ items: slotItems }),
        schema_version: '1.0.0',
        slot_id: slotId,
        slot_name: slotName,
        scope_key: scopeKey,
        source_candidate_ids_json: JSON.stringify(sourceCandidateIds),
        user_id: scopeKey,
      };
      await this.memory.appendGrilloMemorySlotPatch(patchRecord);
      slotIds.push(slotId);
      writes += 1;
    }

    const activityId = this.idFactory();
    await this.memory.appendGrilloRecord('grillo_activity_log', {
      activity_id: activityId,
      beat_type: beatType,
      created_at: createdAt + 4,
      response_text:
        normalizeText(input.responseText) ||
        (writes > 0 ? `Manual extraction wrote ${writes} memory update(s).` : 'Manual extraction found no writes.'),
      scope_key: scopeKey,
      user_id: scopeKey,
    });

    return {
      activityId,
      beatType,
      candidateIds,
      diaryIds,
      slotIds,
      traceId,
      writes,
    };
  }

  async buildContextPacket(input: GrilloContextPacketInput): Promise<GrilloContextPacket> {
    const scopeKey = normalizeKey(input.scopeKey, 'local:persona:default');
    const participantKeys = readStringArray(input.participantKeys).map((key) => key.toLowerCase());
    const participantSet = new Set(participantKeys);
    const includeParticipant = (participantKey: unknown) => {
      const normalized = normalizeText(participantKey).toLowerCase();
      return participantSet.size === 0 || participantSet.has(normalized);
    };
    const inScope = (record: Record<string, unknown>) => recordScopeKey(record) === scopeKey;
    const query = normalizeText(input.query);
    const [
      turns,
      candidates,
      blocks,
      slots,
      diary,
      semanticRecords,
      relationshipProfiles,
    ] = await Promise.all([
      this.memory.readGrilloRecords<Record<string, unknown>>('turn_events'),
      this.memory.readGrilloRecords<Record<string, unknown>>('memory_candidates'),
      this.memory.readGrilloRecords<Record<string, unknown>>('memory_blocks'),
      this.memory.readGrilloRecords<Record<string, unknown>>('memory_slots'),
      this.memory.readGrilloRecords<Record<string, unknown>>('diary_entries'),
      this.memory.loadSemanticRecords(scopeKey),
      this.memory.loadRelationshipProfiles(),
    ]);
    const scopedTurns = turns
      .filter(inScope)
      .sort((left, right) => recordTimestamp(left) - recordTimestamp(right))
      .slice(-14);
    const scopedCandidates = candidates
      .filter((record) => inScope(record) && includeParticipant(recordParticipantKey(record)))
      .sort((left, right) => recordTimestamp(right) - recordTimestamp(left))
      .slice(0, 8);
    const scopedBlocks = blocks
      .filter((record) => inScope(record) && includeParticipant(recordParticipantKey(record)))
      .sort((left, right) => recordUpdatedAt(right) - recordUpdatedAt(left))
      .slice(0, 8);
    const scopedSlots = slots
      .filter((record) => inScope(record) && includeParticipant(recordParticipantKey(record)))
      .sort((left, right) => recordUpdatedAt(right) - recordUpdatedAt(left))
      .slice(0, 8);
    const scopedDiary = diary
      .filter((record) => inScope(record) && includeParticipant(recordParticipantKey(record)))
      .sort((left, right) => recordTimestamp(right) - recordTimestamp(left))
      .slice(0, 5);
    const relationshipProfile = asRecord(asRecord(relationshipProfiles)[scopeKey]);
    const semantic = (semanticRecords ?? []).slice(0, 6);

    const relationshipMemory = [
      ...formatRelationshipProfile(relationshipProfile),
      ...scopedBlocks.flatMap(formatMemoryBlock),
      ...scopedSlots.flatMap(formatMemorySlot),
    ].slice(0, 16);
    const recalledMemories = [
      ...scopedCandidates.map((record) => ({
        score: clampNumber(record['confidence'], 0, 1, 0.72),
        text: `[candidate:${normalizeText(record['type']) || 'thread'} ${recordParticipantKey(record) || 'unknown'}] ${normalizeText(record['summary'] ?? record['content'])}`,
      })),
      ...semantic.map((record, index) => ({
        score: Math.max(0.25, 0.82 - index * 0.08),
        text: `[semantic:${record.personaId || 'unknown'}] ${normalizeText(record.text)}`,
      })),
    ]
      .filter((item) => item.text.trim())
      .slice(0, 12);

    return {
      background_information: [
        `scope_key: ${scopeKey}`,
        `source: ${inferSource(scopeKey)}`,
        `channel: ${inferChannel(scopeKey)}`,
        `participant_filter: ${participantKeys.length > 0 ? participantKeys.join(', ') : 'all'}`,
        `stored_turn_events: ${turns.filter(inScope).length}`,
        `memory_candidates: ${candidates.filter(inScope).length}`,
        `memory_slots: ${slots.filter(inScope).length}`,
        `semantic_records: ${semanticRecords?.length ?? 0}`,
        query ? `query: ${query}` : '',
      ].filter(Boolean),
      channel_history: scopedTurns.map(formatTurnEvent),
      generatedAt: this.nowMs(),
      output_description: [
        'Use this GRILLO packet as scoped memory/context for the current reply.',
        'Treat channel_history as transcript, relationship_memory as durable participant context, recalled_memories as recall, and thoughts as private reflection.',
        'If memory conflicts with the current user turn, trust the current user turn first.',
      ],
      recalled_memories: recalledMemories,
      relationship_memory: relationshipMemory,
      scopeKey,
      thoughts: scopedDiary.map(formatDiaryEntry),
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: unknown, fallback: string) {
  return normalizeText(value) || fallback;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean).slice(0, 24)
    : [];
}

function readJsonArray(value: unknown) {
  const parsed = typeof value === 'string' ? safeJsonParse(value) : value;
  return Array.isArray(parsed) ? parsed.map((item) => normalizeText(item)).filter(Boolean) : [];
}

function numberOrNow(value: unknown, nowMs: () => number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : nowMs();
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function inferSource(scopeKey: string) {
  return scopeKey.split(':')[0] || 'local';
}

function inferChannel(scopeKey: string) {
  return scopeKey.split(':')[1] || 'local';
}

function recordScopeKey(record: Record<string, unknown>) {
  return normalizeText(record['scopeKey'] ?? record['scope_key'] ?? record['user_id']);
}

function recordParticipantKey(record: Record<string, unknown>) {
  return normalizeText(record['participantKey'] ?? record['participant_key']);
}

function recordTimestamp(record: Record<string, unknown>) {
  return numberOrNow(record['createdAt'] ?? record['created_at'] ?? record['timestamp'], () => 0);
}

function recordUpdatedAt(record: Record<string, unknown>) {
  return numberOrNow(record['updatedAt'] ?? record['updated_at'] ?? recordTimestamp(record), () => 0);
}

function formatTurnEvent(record: Record<string, unknown>) {
  const role = normalizeText(record['role']) || 'user';
  const author = normalizeText(record['authorName'] ?? record['author_name']) || role;
  const source = normalizeText(record['source']);
  const channel = normalizeText(record['channelId'] ?? record['channel_id']);
  const text = normalizeText(record['content'] ?? record['text']);
  const metadata = [
    source ? `source=${source}` : '',
    channel ? `channel=${channel}` : '',
    `role=${role}`,
    recordParticipantKey(record) ? `participant=${recordParticipantKey(record)}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `${author}: ${text}${metadata ? `\nmetadata: ${metadata}` : ''}`;
}

function formatMemoryBlock(record: Record<string, unknown>) {
  const blockName = normalizeText(record['blockName'] ?? record['block_name']) || 'memory';
  const participantKey = recordParticipantKey(record) || 'unknown';
  return readJsonArray(record['itemsJson'] ?? record['items_json'] ?? record['items'])
    .slice(0, 5)
    .map((item) => `[block:${blockName} ${participantKey}] ${item}`);
}

function formatMemorySlot(record: Record<string, unknown>) {
  const slotName = normalizeText(record['slotName'] ?? record['slot_name']) || 'slot';
  const participantKey = recordParticipantKey(record) || 'scope';
  return readJsonArray(record['contentJson'] ?? record['content_json'])
    .slice(0, 5)
    .map((item) => `[slot:${slotName} ${participantKey}] ${item}`);
}

function formatDiaryEntry(record: Record<string, unknown>) {
  const beatType = normalizeText(record['beatType'] ?? record['beat_type']) || 'reflection';
  const participantKey = recordParticipantKey(record) || 'unknown';
  const thought = normalizeText(record['personalThought'] ?? record['personal_thought']);
  const summary = normalizeText(record['summary']);
  return `[diary:${beatType} ${participantKey}] ${thought || summary}`;
}

function formatRelationshipProfile(profile: Record<string, unknown>) {
  if (Object.keys(profile).length === 0) {
    return [];
  }
  const facts = readStringArray(profile['facts'] ?? profile['storedFacts']);
  return [
    `stage=${normalizeText(profile['relationshipStage']) || 'new'} mood=${normalizeText(profile['mood']) || 'neutral'}`,
    normalizeText(profile['summary']) ? `summary=${normalizeText(profile['summary'])}` : '',
    facts.length > 0 ? `known_facts=${JSON.stringify(facts.slice(0, 12))}` : '',
  ].filter(Boolean);
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeCandidateType(value: unknown) {
  const normalized = normalizeText(value);
  return ['preference', 'fact', 'goal', 'boundary', 'bond_signal', 'thread'].includes(normalized)
    ? normalized
    : 'thread';
}

function normalizeSlotOperation(value: unknown): LadybugMemorySlotPatchRecord['operation'] {
  const normalized = normalizeText(value);
  if (normalized === 'set' || normalized === 'remove') {
    return normalized;
  }
  return 'merge';
}
