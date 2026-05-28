import { randomUUID } from 'node:crypto';
import type { LadybugMemoryService, LadybugMemorySlotPatchRecord, LadybugMemorySlotRecord } from './LadybugMemoryService.js';

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
      const slotRecord: LadybugMemorySlotRecord = {
        content_json: JSON.stringify(slotItems),
        schema_version: '1.0.0',
        slot_id: slotId,
        slot_name: slotName,
        source_candidate_ids_json: JSON.stringify(sourceCandidateIds),
        updated_at: String(createdAt + 3),
        user_id: scopeKey,
      };
      await this.memory.upsertGrilloMemorySlot(slotRecord);

      const patchRecord: LadybugMemorySlotPatchRecord = {
        created_at: String(createdAt + 3),
        operation: normalizeSlotOperation(slot['operation']),
        patch_id: this.idFactory(),
        patch_json: JSON.stringify({ items: slotItems }),
        schema_version: '1.0.0',
        slot_id: slotId,
        slot_name: slotName,
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
