import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Connection, Database } from '@ladybugdb/core';

export type LadybugSemanticMemoryRecord = {
  id: string;
  createdAt: number;
  personaId: string;
  scopeKey: string;
  text: string;
  userText: string;
  assistantText: string;
  embedding: number[] | null;
};

type LadybugSnapshotKind = 'grillo' | 'semantic';

type LadybugSnapshot = {
  id: string;
  json: string;
  kind: LadybugSnapshotKind;
  scopeKey: string;
  updatedAt: number;
};

type LadybugQueryResult = {
  getAll: () => Promise<Array<Record<string, unknown>>>;
};

type LadybugState = {
  connection: Connection;
  database: Database;
  initialized: boolean;
};

type LadybugCoreModule = {
  Connection: new (database: Database) => Connection;
  Database: new (path: string) => Database;
};

const DEFAULT_MEMORY_DB_DIR = join(process.cwd(), '.webwaifu4', 'ladybug-memory.db');
const MAX_SCOPE_KEY_LENGTH = 180;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

export class LadybugMemoryService {
  readonly dbDir: string;
  private state: LadybugState | null = null;
  private initPromise: Promise<LadybugState> | null = null;

  constructor(dbDir = process.env.WEBWAIFU_MEMORY_DB_DIR?.trim() || DEFAULT_MEMORY_DB_DIR) {
    this.dbDir = dbDir;
  }

  async getStatus() {
    const state = await this.open();
    const [
      snapshots,
      grilloScopes,
      semanticScopes,
      scopes,
      participants,
      personas,
      candidates,
      diaryEntries,
      semanticRecords,
      hasCandidateEdges,
      hasBlockEdges,
      hasDiaryEdges,
      hasSemanticEdges,
    ] = await Promise.all([
        this.scalarCount('MATCH (m:MemoryState) RETURN count(m) AS count'),
        this.scalarCount("MATCH (m:MemoryState) WHERE m.kind = 'grillo' RETURN count(m) AS count"),
        this.scalarCount(
          "MATCH (m:MemoryState) WHERE m.kind = 'semantic' RETURN count(m) AS count",
        ),
        this.scalarCount('MATCH (m:MemoryScope) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:Participant) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:Persona) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:MemoryCandidate) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:DiaryEntry) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:SemanticRecord) RETURN count(m) AS count'),
        this.scalarCount('MATCH (s:MemoryScope)-[:HAS_CANDIDATE]->(m:MemoryCandidate) RETURN count(m) AS count'),
        this.scalarCount('MATCH (s:MemoryScope)-[:HAS_BLOCK]->(m:MemoryBlock) RETURN count(m) AS count'),
        this.scalarCount('MATCH (s:MemoryScope)-[:HAS_DIARY]->(m:DiaryEntry) RETURN count(m) AS count'),
        this.scalarCount('MATCH (s:MemoryScope)-[:HAS_SEMANTIC]->(m:SemanticRecord) RETURN count(m) AS count'),
      ]);
    const relationshipEdges =
      hasCandidateEdges + hasBlockEdges + hasDiaryEdges + hasSemanticEdges;
    return {
      backend: 'ladybug',
      dbDir: this.dbDir,
      initialized: state.initialized,
      snapshots,
      grilloScopes,
      semanticScopes,
      scopes,
      participants,
      personas,
      candidates,
      diaryEntries,
      semanticRecords,
      relationshipEdges,
    };
  }

  async loadGrilloState(scopeKey: string) {
    const snapshot = await this.loadSnapshot('grillo', scopeKey);
    return snapshot ? safeJsonParse(snapshot.json) : null;
  }

  async saveGrilloState(scopeKey: string, state: unknown) {
    await this.saveSnapshot('grillo', scopeKey, state);
    await this.replaceGrilloGraph(scopeKey, state);
  }

  async deleteGrilloState(scopeKey: string) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    await this.deleteSnapshot('grillo', normalizedScopeKey);
    await this.deleteGraphRowsForScope(normalizedScopeKey, [
      'MemoryCandidate',
      'MemoryBlock',
      'DiaryEntry',
    ]);
  }

  async loadSemanticRecords(scopeKey: string): Promise<LadybugSemanticMemoryRecord[] | null> {
    const snapshot = await this.loadSnapshot('semantic', scopeKey);
    if (!snapshot) {
      return null;
    }
    const parsed = safeJsonParse(snapshot.json);
    return Array.isArray(parsed) ? normalizeSemanticRecords(parsed) : [];
  }

  async saveSemanticRecords(scopeKey: string, records: LadybugSemanticMemoryRecord[]) {
    const normalized = normalizeSemanticRecords(records);
    await this.saveSnapshot('semantic', scopeKey, normalized);
    await this.replaceSemanticGraph(scopeKey, normalized);
  }

  async deleteSemanticRecords(scopeKey: string) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    await this.deleteSnapshot('semantic', normalizedScopeKey);
    await this.deleteGraphRowsForScope(normalizedScopeKey, ['SemanticRecord']);
  }

  async close() {
    const state = this.state;
    this.state = null;
    this.initPromise = null;
    await state?.connection.close().catch(() => undefined);
    await state?.database.close().catch(() => undefined);
  }

  private async open() {
    if (this.state?.initialized) {
      return this.state;
    }
    this.initPromise ??= this.init();
    this.state = await this.initPromise;
    return this.state;
  }

  private async init(): Promise<LadybugState> {
    await mkdir(dirname(this.dbDir), { recursive: true });
    const { Connection, Database } = await importLadybugCore();
    const database = new Database(this.dbDir);
    const connection = new Connection(database);
    const state = { connection, database, initialized: false };
    this.state = state;

    await this.ensureNodeTable(
      connection,
      'MemoryState',
      'id STRING, scopeKey STRING, kind STRING, json STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'MemoryScope',
      'id STRING, source STRING, channel STRING, personaId STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'Participant',
      'id STRING, source STRING, channel STRING, login STRING, displayName STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'Persona',
      'id STRING, name STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'MemoryCandidate',
      'id STRING, scopeKey STRING, participantKey STRING, type STRING, summary STRING, content STRING, confidence DOUBLE, source STRING, sourceTurnIdsJson STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'MemoryBlock',
      'id STRING, scopeKey STRING, participantKey STRING, blockName STRING, itemsJson STRING, sourceCandidateIdsJson STRING, createdAt INT64, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'DiaryEntry',
      'id STRING, scopeKey STRING, participantKey STRING, beatType STRING, summary STRING, personalThought STRING, interactionSummary STRING, userMessage STRING, emotionsJson STRING, tagsJson STRING, sourceTurnIdsJson STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'SemanticRecord',
      'id STRING, scopeKey STRING, personaId STRING, text STRING, userText STRING, assistantText STRING, embeddingJson STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureRelTable(connection, 'HAS_CANDIDATE', 'FROM MemoryScope TO MemoryCandidate');
    await this.ensureRelTable(connection, 'HAS_BLOCK', 'FROM MemoryScope TO MemoryBlock');
    await this.ensureRelTable(connection, 'HAS_DIARY', 'FROM MemoryScope TO DiaryEntry');
    await this.ensureRelTable(connection, 'HAS_SEMANTIC', 'FROM MemoryScope TO SemanticRecord');
    await this.ensureRelTable(
      connection,
      'CANDIDATE_ABOUT',
      'FROM MemoryCandidate TO Participant',
    );
    await this.ensureRelTable(connection, 'BLOCK_ABOUT', 'FROM MemoryBlock TO Participant');
    await this.ensureRelTable(connection, 'DIARY_ABOUT', 'FROM DiaryEntry TO Participant');
    await this.ensureRelTable(connection, 'SEMANTIC_FOR_PERSONA', 'FROM SemanticRecord TO Persona');

    state.initialized = true;
    return state;
  }

  private async ensureNodeTable(connection: Connection, name: string, columns: string) {
    await connection.query(`CREATE NODE TABLE ${name}(${columns})`).catch((error) => {
      if (!String(error instanceof Error ? error.message : error).toLowerCase().includes('exist')) {
        throw error;
      }
    });
  }

  private async ensureRelTable(connection: Connection, name: string, definition: string) {
    await connection.query(`CREATE REL TABLE ${name}(${definition})`).catch((error) => {
      if (!String(error instanceof Error ? error.message : error).toLowerCase().includes('exist')) {
        throw error;
      }
    });
  }

  private async loadSnapshot(kind: LadybugSnapshotKind, scopeKey: string) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    const rows = await this.all(
      `MATCH (m:MemoryState) WHERE m.id = ${q(snapshotId(kind, normalizedScopeKey))} RETURN m.id AS id, m.scopeKey AS scopeKey, m.kind AS kind, m.json AS json, m.updatedAt AS updatedAt`,
    );
    const row = rows[0];
    if (!row || typeof row['json'] !== 'string') {
      return null;
    }
    return row as LadybugSnapshot;
  }

  private async saveSnapshot(kind: LadybugSnapshotKind, scopeKey: string, value: unknown) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    const json = JSON.stringify(value);
    if (json.length > MAX_SNAPSHOT_BYTES) {
      throw new Error(`Ladybug ${kind} snapshot is too large.`);
    }
    const id = snapshotId(kind, normalizedScopeKey);
    await this.deleteSnapshot(kind, normalizedScopeKey);
    await this.exec(
      `CREATE (:MemoryState {id: ${q(id)}, scopeKey: ${q(normalizedScopeKey)}, kind: ${q(kind)}, json: ${q(json)}, updatedAt: ${Date.now()}})`,
    );
  }

  private async deleteSnapshot(kind: LadybugSnapshotKind, scopeKey: string) {
    await this.exec(
      `MATCH (m:MemoryState) WHERE m.id = ${q(snapshotId(kind, normalizeScopeKey(scopeKey)))} DELETE m`,
    );
  }

  private async replaceGrilloGraph(scopeKey: string, value: unknown) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    await this.ensureScopeNode(normalizedScopeKey);
    await this.deleteGraphRowsForScope(normalizedScopeKey, [
      'MemoryCandidate',
      'MemoryBlock',
      'DiaryEntry',
    ]);
    if (!value || typeof value !== 'object') {
      return;
    }
    const source = value as Record<string, unknown>;
    const candidates = Array.isArray(source['candidates']) ? source['candidates'] : [];
    const blocks = Array.isArray(source['blocks']) ? source['blocks'] : [];
    const diaryEntries = Array.isArray(source['diaryEntries']) ? source['diaryEntries'] : [];

    for (const candidate of candidates.slice(-120)) {
      if (!candidate || typeof candidate !== 'object') continue;
      const item = candidate as Record<string, unknown>;
      const id = stringValue(item['candidateId']);
      const participantKey = stringValue(item['participantKey']);
      await this.ensureParticipantNode(participantKey);
      await this.exec(
        `CREATE (:MemoryCandidate {id: ${q(id)}, scopeKey: ${q(normalizedScopeKey)}, participantKey: ${q(participantKey)}, type: ${q(stringValue(item['type']))}, summary: ${q(stringValue(item['summary']))}, content: ${q(stringValue(item['content']))}, confidence: ${numberValue(item['confidence'], 0)}, source: ${q(stringValue(item['source']))}, sourceTurnIdsJson: ${q(JSON.stringify(arrayValue(item['sourceTurnIds'])))}, createdAt: ${intValue(item['createdAt'])}})`,
      );
      await this.createScopeRelation('HAS_CANDIDATE', 'MemoryCandidate', normalizedScopeKey, id);
      await this.createAboutRelation('CANDIDATE_ABOUT', 'MemoryCandidate', id, participantKey);
    }

    for (const block of blocks.slice(-80)) {
      if (!block || typeof block !== 'object') continue;
      const item = block as Record<string, unknown>;
      const id = stringValue(item['blockId']);
      const participantKey = stringValue(item['participantKey']);
      await this.ensureParticipantNode(participantKey);
      await this.exec(
        `CREATE (:MemoryBlock {id: ${q(id)}, scopeKey: ${q(normalizedScopeKey)}, participantKey: ${q(participantKey)}, blockName: ${q(stringValue(item['blockName']))}, itemsJson: ${q(JSON.stringify(arrayValue(item['items'])))}, sourceCandidateIdsJson: ${q(JSON.stringify(arrayValue(item['sourceCandidateIds'])))}, createdAt: ${intValue(item['createdAt'])}, updatedAt: ${intValue(item['updatedAt'])}})`,
      );
      await this.createScopeRelation('HAS_BLOCK', 'MemoryBlock', normalizedScopeKey, id);
      await this.createAboutRelation('BLOCK_ABOUT', 'MemoryBlock', id, participantKey);
    }

    for (const diaryEntry of diaryEntries.slice(-40)) {
      if (!diaryEntry || typeof diaryEntry !== 'object') continue;
      const item = diaryEntry as Record<string, unknown>;
      const id = stringValue(item['diaryId']);
      const participantKey = stringValue(item['participantKey']);
      await this.ensureParticipantNode(participantKey);
      await this.exec(
        `CREATE (:DiaryEntry {id: ${q(id)}, scopeKey: ${q(normalizedScopeKey)}, participantKey: ${q(participantKey)}, beatType: ${q(stringValue(item['beatType']))}, summary: ${q(stringValue(item['summary']))}, personalThought: ${q(stringValue(item['personalThought']))}, interactionSummary: ${q(stringValue(item['interactionSummary']))}, userMessage: ${q(stringValue(item['userMessage']))}, emotionsJson: ${q(JSON.stringify(arrayValue(item['emotions'])))}, tagsJson: ${q(JSON.stringify(arrayValue(item['tags'])))}, sourceTurnIdsJson: ${q(JSON.stringify(arrayValue(item['sourceTurnIds'])))}, createdAt: ${intValue(item['createdAt'])}})`,
      );
      await this.createScopeRelation('HAS_DIARY', 'DiaryEntry', normalizedScopeKey, id);
      await this.createAboutRelation('DIARY_ABOUT', 'DiaryEntry', id, participantKey);
    }
  }

  private async replaceSemanticGraph(
    scopeKey: string,
    records: LadybugSemanticMemoryRecord[],
  ) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    await this.ensureScopeNode(normalizedScopeKey);
    await this.deleteGraphRowsForScope(normalizedScopeKey, ['SemanticRecord']);
    for (const record of records.slice(0, 160)) {
      await this.ensurePersonaNode(record.personaId);
      await this.exec(
        `CREATE (:SemanticRecord {id: ${q(record.id)}, scopeKey: ${q(normalizedScopeKey)}, personaId: ${q(record.personaId)}, text: ${q(record.text)}, userText: ${q(record.userText)}, assistantText: ${q(record.assistantText)}, embeddingJson: ${q(JSON.stringify(record.embedding ?? []))}, createdAt: ${intValue(record.createdAt)}})`,
      );
      await this.createScopeRelation('HAS_SEMANTIC', 'SemanticRecord', normalizedScopeKey, record.id);
      await this.createSemanticPersonaRelation(record.id, record.personaId);
    }
  }

  private async deleteGraphRowsForScope(scopeKey: string, labels: string[]) {
    await this.deleteGraphRelationsForScope(scopeKey, labels);
    for (const label of labels) {
      await this.exec(`MATCH (m:${label}) WHERE m.scopeKey = ${q(scopeKey)} DELETE m`);
    }
  }

  private async deleteGraphRelationsForScope(scopeKey: string, labels: string[]) {
    if (labels.includes('MemoryCandidate')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_CANDIDATE]->(m:MemoryCandidate) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:MemoryCandidate)-[r:CANDIDATE_ABOUT]->(p:Participant) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('MemoryBlock')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_BLOCK]->(m:MemoryBlock) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:MemoryBlock)-[r:BLOCK_ABOUT]->(p:Participant) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('DiaryEntry')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_DIARY]->(m:DiaryEntry) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:DiaryEntry)-[r:DIARY_ABOUT]->(p:Participant) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
    if (labels.includes('SemanticRecord')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_SEMANTIC]->(m:SemanticRecord) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:SemanticRecord)-[r:SEMANTIC_FOR_PERSONA]->(p:Persona) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
    }
  }

  private async ensureScopeNode(scopeKey: string) {
    const parsed = parseScopeKey(scopeKey);
    await this.createNodeIfMissing(
      `CREATE (:MemoryScope {id: ${q(scopeKey)}, source: ${q(parsed.source)}, channel: ${q(parsed.channel)}, personaId: ${q(parsed.personaId)}, updatedAt: ${Date.now()}})`,
    );
  }

  private async ensureParticipantNode(participantKey: string) {
    const parsed = parseParticipantKey(participantKey);
    await this.createNodeIfMissing(
      `CREATE (:Participant {id: ${q(participantKey)}, source: ${q(parsed.source)}, channel: ${q(parsed.channel)}, login: ${q(parsed.login)}, displayName: ${q(parsed.login)}, updatedAt: ${Date.now()}})`,
    );
  }

  private async ensurePersonaNode(personaId: string) {
    const id = personaId || 'unknown';
    await this.createNodeIfMissing(
      `CREATE (:Persona {id: ${q(id)}, name: ${q(id)}, updatedAt: ${Date.now()}})`,
    );
  }

  private async createScopeRelation(
    relation: 'HAS_CANDIDATE' | 'HAS_BLOCK' | 'HAS_DIARY' | 'HAS_SEMANTIC',
    label: 'MemoryCandidate' | 'MemoryBlock' | 'DiaryEntry' | 'SemanticRecord',
    scopeKey: string,
    memoryId: string,
  ) {
    await this.exec(
      `MATCH (s:MemoryScope), (m:${label}) WHERE s.id = ${q(scopeKey)} AND m.id = ${q(memoryId)} CREATE (s)-[:${relation}]->(m)`,
    );
  }

  private async createAboutRelation(
    relation: 'CANDIDATE_ABOUT' | 'BLOCK_ABOUT' | 'DIARY_ABOUT',
    label: 'MemoryCandidate' | 'MemoryBlock' | 'DiaryEntry',
    memoryId: string,
    participantKey: string,
  ) {
    await this.exec(
      `MATCH (m:${label}), (p:Participant) WHERE m.id = ${q(memoryId)} AND p.id = ${q(participantKey)} CREATE (m)-[:${relation}]->(p)`,
    );
  }

  private async createSemanticPersonaRelation(memoryId: string, personaId: string) {
    await this.exec(
      `MATCH (m:SemanticRecord), (p:Persona) WHERE m.id = ${q(memoryId)} AND p.id = ${q(personaId || 'unknown')} CREATE (m)-[:SEMANTIC_FOR_PERSONA]->(p)`,
    );
  }

  private async createNodeIfMissing(query: string) {
    await this.exec(query).catch((error) => {
      const message = String(error instanceof Error ? error.message : error).toLowerCase();
      if (!message.includes('duplicate') && !message.includes('primary') && !message.includes('exist')) {
        throw error;
      }
    });
  }

  private async scalarCount(query: string) {
    const rows = await this.all(query).catch(() => []);
    const value = rows[0]?.['count'];
    return typeof value === 'number' ? value : Number(value ?? 0);
  }

  private async exec(query: string) {
    const state = await this.open();
    await state.connection.query(query);
  }

  private async all(query: string) {
    const state = await this.open();
    const result = (await state.connection.query(query)) as LadybugQueryResult;
    return result.getAll();
  }
}

async function importLadybugCore() {
  try {
    return (await import('@ladybugdb/core')) as unknown as LadybugCoreModule;
  } catch (error) {
    throw new Error(
      `LadybugDB is unavailable in this runtime: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

let singleton: LadybugMemoryService | null = null;

export function getLadybugMemoryService() {
  singleton ??= new LadybugMemoryService();
  return singleton;
}

export async function closeLadybugMemoryService() {
  await singleton?.close();
  singleton = null;
}

function snapshotId(kind: LadybugSnapshotKind, scopeKey: string) {
  return `${kind}:${scopeKey}`;
}

function normalizeScopeKey(scopeKey: string) {
  return (
    String(scopeKey || 'default')
      .trim()
      .replace(/[^a-z0-9:_-]+/gi, '-')
      .slice(0, MAX_SCOPE_KEY_LENGTH) || 'default'
  );
}

function parseScopeKey(scopeKey: string) {
  const parts = scopeKey.split(':');
  const personaIndex = parts.indexOf('persona');
  return {
    source: parts[0] || 'local',
    channel: personaIndex > 1 ? parts.slice(1, personaIndex).join(':') : 'local',
    personaId: personaIndex >= 0 ? parts.slice(personaIndex + 1).join(':') || 'unknown' : 'unknown',
  };
}

function parseParticipantKey(participantKey: string) {
  const parts = participantKey.split(':');
  return {
    source: parts[0] || 'local',
    channel: parts[1] || 'local',
    login: parts.slice(2).join(':') || 'unknown',
  };
}

function q(value: unknown) {
  return `'${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stringValue(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 2400);
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function intValue(value: unknown) {
  return Math.trunc(numberValue(value, Date.now()));
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeSemanticRecords(values: unknown[]) {
  return values
    .map((value): LadybugSemanticMemoryRecord | null => {
      if (!value || typeof value !== 'object') {
        return null;
      }
      const source = value as Partial<LadybugSemanticMemoryRecord>;
      const id = stringValue(source.id);
      const scopeKey = stringValue(source.scopeKey);
      const text = stringValue(source.text);
      if (!id || !scopeKey || !text) {
        return null;
      }
      const embedding = Array.isArray(source.embedding)
        ? source.embedding.filter((item): item is number => typeof item === 'number')
        : null;
      return {
        id,
        assistantText: stringValue(source.assistantText).slice(0, 1200),
        createdAt: intValue(source.createdAt),
        embedding: embedding?.length ? embedding : null,
        personaId: stringValue(source.personaId) || 'unknown',
        scopeKey,
        text,
        userText: stringValue(source.userText).slice(0, 1200),
      };
    })
    .filter((record): record is LadybugSemanticMemoryRecord => Boolean(record))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 160);
}
