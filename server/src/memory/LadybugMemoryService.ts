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

export type LadybugSemanticMemoryMatch = LadybugSemanticMemoryRecord & {
  distance: number;
  score: number;
};

export type LadybugMemoryGraphSummary = {
  edges: Array<{ count: number; relation: string }>;
  participants: Array<{ channel: string; displayName: string; id: string; source: string }>;
  personas: Array<{ id: string; name: string }>;
  recent: {
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
    semantic: Array<{ id: string; personaId: string; text: string }>;
    vectors: Array<{ id: string; personaId: string; text: string }>;
  };
  scopes: Array<{ channel: string; id: string; personaId: string; source: string }>;
};

type LadybugSnapshotKind = 'grillo' | 'relationships' | 'semantic';

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
      emotionStates,
      emotionIntensities,
      semanticRecords,
      semanticVectors,
      relationshipProfiles,
      relationshipFacts,
      hasCandidateEdges,
      hasBlockEdges,
      hasDiaryEdges,
      hasEmotionEdges,
      hasEmotionIntensityEdges,
      hasSemanticEdges,
      hasVectorEdges,
      hasVectorPersonaEdges,
      hasRelationshipEdges,
      hasRelationshipPersonaEdges,
      hasRelationshipFactEdges,
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
        this.scalarCount('MATCH (m:EmotionState) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:EmotionIntensity) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:SemanticRecord) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:SemanticVector) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:RelationshipProfile) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:RelationshipFact) RETURN count(m) AS count'),
        this.scalarCount('MATCH (s:MemoryScope)-[:HAS_CANDIDATE]->(m:MemoryCandidate) RETURN count(m) AS count'),
        this.scalarCount('MATCH (s:MemoryScope)-[:HAS_BLOCK]->(m:MemoryBlock) RETURN count(m) AS count'),
        this.scalarCount('MATCH (s:MemoryScope)-[:HAS_DIARY]->(m:DiaryEntry) RETURN count(m) AS count'),
        this.scalarCount('MATCH (s:MemoryScope)-[:HAS_EMOTION]->(m:EmotionState) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:EmotionState)-[:HAS_EMOTION_INTENSITY]->(i:EmotionIntensity) RETURN count(i) AS count'),
        this.scalarCount('MATCH (s:MemoryScope)-[:HAS_SEMANTIC]->(m:SemanticRecord) RETURN count(m) AS count'),
        this.scalarCount('MATCH (s:MemoryScope)-[:HAS_VECTOR]->(m:SemanticVector) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:SemanticVector)-[:VECTOR_FOR_PERSONA]->(p:Persona) RETURN count(m) AS count'),
        this.scalarCount('MATCH (s:MemoryScope)-[:HAS_RELATIONSHIP]->(m:RelationshipProfile) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:RelationshipProfile)-[:RELATIONSHIP_AS_PERSONA]->(p:Persona) RETURN count(m) AS count'),
        this.scalarCount('MATCH (m:RelationshipProfile)-[:HAS_RELATIONSHIP_FACT]->(f:RelationshipFact) RETURN count(f) AS count'),
      ]);
    const relationshipEdges =
      hasCandidateEdges +
      hasBlockEdges +
      hasDiaryEdges +
      hasEmotionEdges +
      hasEmotionIntensityEdges +
      hasSemanticEdges +
      hasVectorEdges +
      hasVectorPersonaEdges +
      hasRelationshipEdges +
      hasRelationshipPersonaEdges +
      hasRelationshipFactEdges;
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
      emotionStates,
      emotionIntensities,
      semanticRecords,
      semanticVectors,
      relationshipProfiles,
      relationshipFacts,
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
      'EmotionState',
      'EmotionIntensity',
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

  async querySemanticVectors(
    scopeKey: string,
    embedding: number[],
    limit = 4,
  ): Promise<LadybugSemanticMemoryMatch[]> {
    const normalizedEmbedding = normalizeEmbeddingArray(embedding);
    if (normalizedEmbedding.length === 0) {
      return [];
    }
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    await this.open();
    await this.ensureSemanticVectorIndex(normalizedEmbedding.length).catch(() => undefined);
    const vectorTable = semanticVectorTableName(normalizedEmbedding.length);
    const vectorIndex = semanticVectorIndexName(normalizedEmbedding.length);
    const rows = await this.all(
      `CALL QUERY_VECTOR_INDEX('${vectorTable}', '${vectorIndex}', ${vectorLiteral(normalizedEmbedding)}, ${Math.max(limit * 8, limit)}) WITH node AS n, distance WHERE n.scopeKey = ${q(normalizedScopeKey)} RETURN n.id AS id, n.scopeKey AS scopeKey, n.personaId AS personaId, n.text AS text, n.userText AS userText, n.assistantText AS assistantText, n.embedding AS embedding, n.createdAt AS createdAt, distance ORDER BY distance LIMIT ${Math.max(1, Math.min(20, Math.trunc(limit)))}`,
    ).catch(() => []);
    return rows.map((row) => {
      const distance = numberValue(row['distance'], 1);
      const embeddingValue = Array.isArray(row['embedding'])
        ? normalizeEmbeddingArray(row['embedding'])
        : [];
      return {
        assistantText: stringValue(row['assistantText']).slice(0, 1200),
        createdAt: intValue(row['createdAt']),
        distance,
        embedding: embeddingValue.length ? embeddingValue : null,
        id: stringValue(row['id']),
        personaId: stringValue(row['personaId']) || 'unknown',
        scopeKey: stringValue(row['scopeKey']) || normalizedScopeKey,
        score: Math.max(0, 1 - distance),
        text: stringValue(row['text']),
        userText: stringValue(row['userText']).slice(0, 1200),
      };
    });
  }

  async deleteSemanticRecords(scopeKey: string) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    await this.deleteSnapshot('semantic', normalizedScopeKey);
    await this.deleteGraphRowsForScope(normalizedScopeKey, ['SemanticRecord', 'SemanticVector']);
  }

  async loadRelationshipProfiles() {
    const snapshot = await this.loadSnapshot('relationships', 'all');
    if (!snapshot) {
      return null;
    }
    const parsed = safeJsonParse(snapshot.json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  async saveRelationshipProfiles(profiles: Record<string, unknown>) {
    const normalizedProfiles = normalizeRelationshipProfiles(profiles);
    await this.saveSnapshot('relationships', 'all', normalizedProfiles);
    await this.replaceRelationshipGraph(normalizedProfiles);
  }

  async getGraphSummary(): Promise<LadybugMemoryGraphSummary> {
    await this.open();
    const [
      hasCandidateEdges,
      hasBlockEdges,
      hasDiaryEdges,
      hasSemanticEdges,
      candidateAboutEdges,
      blockAboutEdges,
      diaryAboutEdges,
      emotionScopeEdges,
      emotionIntensityEdges,
      semanticForPersonaEdges,
      vectorScopeEdges,
      vectorPersonaEdges,
      relationshipScopeEdges,
      relationshipPersonaEdges,
      relationshipFactEdges,
      scopes,
      participants,
      personas,
      candidates,
      diary,
      emotions,
      relationships,
      semantic,
      vectors,
    ] = await Promise.all([
      this.scalarCount(
        'MATCH (s:MemoryScope)-[:HAS_CANDIDATE]->(m:MemoryCandidate) RETURN count(m) AS count',
      ),
      this.scalarCount('MATCH (s:MemoryScope)-[:HAS_BLOCK]->(m:MemoryBlock) RETURN count(m) AS count'),
      this.scalarCount('MATCH (s:MemoryScope)-[:HAS_DIARY]->(m:DiaryEntry) RETURN count(m) AS count'),
      this.scalarCount(
        'MATCH (s:MemoryScope)-[:HAS_SEMANTIC]->(m:SemanticRecord) RETURN count(m) AS count',
      ),
      this.scalarCount(
        'MATCH (m:MemoryCandidate)-[:CANDIDATE_ABOUT]->(p:Participant) RETURN count(m) AS count',
      ),
      this.scalarCount('MATCH (m:MemoryBlock)-[:BLOCK_ABOUT]->(p:Participant) RETURN count(m) AS count'),
      this.scalarCount('MATCH (m:DiaryEntry)-[:DIARY_ABOUT]->(p:Participant) RETURN count(m) AS count'),
      this.scalarCount('MATCH (s:MemoryScope)-[:HAS_EMOTION]->(m:EmotionState) RETURN count(m) AS count'),
      this.scalarCount('MATCH (m:EmotionState)-[:HAS_EMOTION_INTENSITY]->(i:EmotionIntensity) RETURN count(i) AS count'),
      this.scalarCount(
        'MATCH (m:SemanticRecord)-[:SEMANTIC_FOR_PERSONA]->(p:Persona) RETURN count(m) AS count',
      ),
      this.scalarCount('MATCH (s:MemoryScope)-[:HAS_VECTOR]->(m:SemanticVector) RETURN count(m) AS count'),
      this.scalarCount('MATCH (m:SemanticVector)-[:VECTOR_FOR_PERSONA]->(p:Persona) RETURN count(m) AS count'),
      this.scalarCount(
        'MATCH (s:MemoryScope)-[:HAS_RELATIONSHIP]->(m:RelationshipProfile) RETURN count(m) AS count',
      ),
      this.scalarCount(
        'MATCH (m:RelationshipProfile)-[:RELATIONSHIP_AS_PERSONA]->(p:Persona) RETURN count(m) AS count',
      ),
      this.scalarCount(
        'MATCH (m:RelationshipProfile)-[:HAS_RELATIONSHIP_FACT]->(f:RelationshipFact) RETURN count(f) AS count',
      ),
      this.all(
        'MATCH (s:MemoryScope) RETURN s.id AS id, s.source AS source, s.channel AS channel, s.personaId AS personaId LIMIT 12',
      ),
      this.all(
        'MATCH (p:Participant) RETURN p.id AS id, p.source AS source, p.channel AS channel, p.displayName AS displayName LIMIT 16',
      ),
      this.all('MATCH (p:Persona) RETURN p.id AS id, p.name AS name LIMIT 12'),
      this.all(
        'MATCH (m:MemoryCandidate) RETURN m.id AS id, m.participantKey AS participantKey, m.type AS type, m.summary AS summary LIMIT 8',
      ),
      this.all(
        'MATCH (m:DiaryEntry) RETURN m.id AS id, m.participantKey AS participantKey, m.beatType AS beatType, m.summary AS summary LIMIT 8',
      ),
      this.all(
        'MATCH (m:EmotionState) RETURN m.id AS id, m.scopeKey AS scopeKey, m.lastSignalSource AS lastSignalSource, m.updatedAt AS updatedAt LIMIT 8',
      ),
      this.all(
        'MATCH (m:RelationshipProfile) RETURN m.id AS id, m.scopeKey AS scopeKey, m.relationshipStage AS relationshipStage, m.mood AS mood, m.summary AS summary LIMIT 8',
      ),
      this.all(
        'MATCH (m:SemanticRecord) RETURN m.id AS id, m.personaId AS personaId, m.text AS text LIMIT 8',
      ),
      this.all(
        'MATCH (m:SemanticVector) RETURN m.id AS id, m.personaId AS personaId, m.text AS text LIMIT 8',
      ),
    ]);

    return {
      edges: [
        { relation: 'HAS_CANDIDATE', count: hasCandidateEdges },
        { relation: 'HAS_BLOCK', count: hasBlockEdges },
        { relation: 'HAS_DIARY', count: hasDiaryEdges },
        { relation: 'HAS_SEMANTIC', count: hasSemanticEdges },
        { relation: 'CANDIDATE_ABOUT', count: candidateAboutEdges },
        { relation: 'BLOCK_ABOUT', count: blockAboutEdges },
        { relation: 'DIARY_ABOUT', count: diaryAboutEdges },
        { relation: 'HAS_EMOTION', count: emotionScopeEdges },
        { relation: 'HAS_EMOTION_INTENSITY', count: emotionIntensityEdges },
        { relation: 'SEMANTIC_FOR_PERSONA', count: semanticForPersonaEdges },
        { relation: 'HAS_VECTOR', count: vectorScopeEdges },
        { relation: 'VECTOR_FOR_PERSONA', count: vectorPersonaEdges },
        { relation: 'HAS_RELATIONSHIP', count: relationshipScopeEdges },
        { relation: 'RELATIONSHIP_AS_PERSONA', count: relationshipPersonaEdges },
        { relation: 'HAS_RELATIONSHIP_FACT', count: relationshipFactEdges },
      ].filter((edge) => edge.count > 0),
      participants: participants.map((row) => ({
        channel: stringValue(row['channel']),
        displayName: stringValue(row['displayName']),
        id: stringValue(row['id']),
        source: stringValue(row['source']),
      })),
      personas: personas.map((row) => ({
        id: stringValue(row['id']),
        name: stringValue(row['name']),
      })),
      recent: {
        candidates: candidates.map((row) => ({
          id: stringValue(row['id']),
          participantKey: stringValue(row['participantKey']),
          summary: stringValue(row['summary']),
          type: stringValue(row['type']),
        })),
        diary: diary.map((row) => ({
          beatType: stringValue(row['beatType']),
          id: stringValue(row['id']),
          participantKey: stringValue(row['participantKey']),
          summary: stringValue(row['summary']),
        })),
        emotions: emotions.map((row) => ({
          id: stringValue(row['id']),
          lastSignalSource: stringValue(row['lastSignalSource']),
          scopeKey: stringValue(row['scopeKey']),
          updatedAt: Number(row['updatedAt'] ?? 0),
        })),
        relationships: relationships.map((row) => ({
          id: stringValue(row['id']),
          mood: stringValue(row['mood']),
          relationshipStage: stringValue(row['relationshipStage']),
          scopeKey: stringValue(row['scopeKey']),
          summary: stringValue(row['summary']),
        })),
        semantic: semantic.map((row) => ({
          id: stringValue(row['id']),
          personaId: stringValue(row['personaId']),
          text: stringValue(row['text']),
        })),
        vectors: vectors.map((row) => ({
          id: stringValue(row['id']),
          personaId: stringValue(row['personaId']),
          text: stringValue(row['text']),
        })),
      },
      scopes: scopes.map((row) => ({
        channel: stringValue(row['channel']),
        id: stringValue(row['id']),
        personaId: stringValue(row['personaId']),
        source: stringValue(row['source']),
      })),
    };
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
      'EmotionState',
      'id STRING, scopeKey STRING, intensitiesJson STRING, lastSignalAt INT64, lastSignalSource STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'EmotionIntensity',
      'id STRING, emotionStateId STRING, scopeKey STRING, name STRING, intensity DOUBLE, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'SemanticRecord',
      'id STRING, scopeKey STRING, personaId STRING, text STRING, userText STRING, assistantText STRING, embeddingJson STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'SemanticVector',
      'id STRING, scopeKey STRING, personaId STRING, text STRING, userText STRING, assistantText STRING, dimension INT64, vectorTable STRING, createdAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'RelationshipProfile',
      'id STRING, scopeKey STRING, personaId STRING, relationshipStage STRING, mood STRING, trust INT64, attraction INT64, respect INT64, irritation INT64, jealousy INT64, guard INT64, turnCount INT64, lastDiaryTurnCount INT64, lastSeenAt INT64, lastActionTag STRING, summary STRING, diaryEntry STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureNodeTable(
      connection,
      'RelationshipFact',
      'id STRING, profileId STRING, scopeKey STRING, text STRING, updatedAt INT64, PRIMARY KEY(id)',
    );
    await this.ensureRelTable(connection, 'HAS_CANDIDATE', 'FROM MemoryScope TO MemoryCandidate');
    await this.ensureRelTable(connection, 'HAS_BLOCK', 'FROM MemoryScope TO MemoryBlock');
    await this.ensureRelTable(connection, 'HAS_DIARY', 'FROM MemoryScope TO DiaryEntry');
    await this.ensureRelTable(connection, 'HAS_EMOTION', 'FROM MemoryScope TO EmotionState');
    await this.ensureRelTable(
      connection,
      'HAS_EMOTION_INTENSITY',
      'FROM EmotionState TO EmotionIntensity',
    );
    await this.ensureRelTable(connection, 'HAS_SEMANTIC', 'FROM MemoryScope TO SemanticRecord');
    await this.ensureRelTable(connection, 'HAS_VECTOR', 'FROM MemoryScope TO SemanticVector');
    await this.ensureRelTable(connection, 'HAS_RELATIONSHIP', 'FROM MemoryScope TO RelationshipProfile');
    await this.ensureRelTable(
      connection,
      'CANDIDATE_ABOUT',
      'FROM MemoryCandidate TO Participant',
    );
    await this.ensureRelTable(connection, 'BLOCK_ABOUT', 'FROM MemoryBlock TO Participant');
    await this.ensureRelTable(connection, 'DIARY_ABOUT', 'FROM DiaryEntry TO Participant');
    await this.ensureRelTable(connection, 'SEMANTIC_FOR_PERSONA', 'FROM SemanticRecord TO Persona');
    await this.ensureRelTable(connection, 'VECTOR_FOR_PERSONA', 'FROM SemanticVector TO Persona');
    await this.ensureRelTable(
      connection,
      'RELATIONSHIP_AS_PERSONA',
      'FROM RelationshipProfile TO Persona',
    );
    await this.ensureRelTable(
      connection,
      'HAS_RELATIONSHIP_FACT',
      'FROM RelationshipProfile TO RelationshipFact',
    );

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
      'EmotionState',
      'EmotionIntensity',
    ]);
    if (!value || typeof value !== 'object') {
      return;
    }
    const source = value as Record<string, unknown>;
    const candidates = Array.isArray(source['candidates']) ? source['candidates'] : [];
    const blocks = Array.isArray(source['blocks']) ? source['blocks'] : [];
    const diaryEntries = Array.isArray(source['diaryEntries']) ? source['diaryEntries'] : [];
    const emotionState =
      source['emotionState'] && typeof source['emotionState'] === 'object'
        ? (source['emotionState'] as Record<string, unknown>)
        : null;

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

    if (emotionState) {
      await this.createEmotionGraph(normalizedScopeKey, emotionState);
    }
  }

  private async createEmotionGraph(scopeKey: string, emotionState: Record<string, unknown>) {
    const emotionStateId = `emotion:${scopeKey}`;
    const intensities =
      emotionState['intensities'] &&
      typeof emotionState['intensities'] === 'object' &&
      !Array.isArray(emotionState['intensities'])
        ? (emotionState['intensities'] as Record<string, unknown>)
        : {};
    await this.exec(
      `CREATE (:EmotionState {id: ${q(emotionStateId)}, scopeKey: ${q(scopeKey)}, intensitiesJson: ${q(JSON.stringify(intensities))}, lastSignalAt: ${intValue(emotionState['lastSignalAt'])}, lastSignalSource: ${q(stringValue(emotionState['lastSignalSource']))}, updatedAt: ${intValue(emotionState['updatedAt'])}})`,
    );
    await this.exec(
      `MATCH (s:MemoryScope), (m:EmotionState) WHERE s.id = ${q(scopeKey)} AND m.id = ${q(emotionStateId)} CREATE (s)-[:HAS_EMOTION]->(m)`,
    );
    for (const [name, rawIntensity] of Object.entries(intensities)) {
      const intensity = numberValue(rawIntensity, 0);
      if (!Number.isFinite(intensity) || intensity <= 0) {
        continue;
      }
      const intensityId = `${emotionStateId}:${normalizeScopeKey(name)}`;
      await this.exec(
        `CREATE (:EmotionIntensity {id: ${q(intensityId)}, emotionStateId: ${q(emotionStateId)}, scopeKey: ${q(scopeKey)}, name: ${q(name)}, intensity: ${intensity}, updatedAt: ${intValue(emotionState['updatedAt'])}})`,
      );
      await this.exec(
        `MATCH (m:EmotionState), (i:EmotionIntensity) WHERE m.id = ${q(emotionStateId)} AND i.id = ${q(intensityId)} CREATE (m)-[:HAS_EMOTION_INTENSITY]->(i)`,
      );
    }
  }

  private async replaceSemanticGraph(
    scopeKey: string,
    records: LadybugSemanticMemoryRecord[],
  ) {
    const normalizedScopeKey = normalizeScopeKey(scopeKey);
    await this.ensureScopeNode(normalizedScopeKey);
    await this.deleteGraphRowsForScope(normalizedScopeKey, ['SemanticRecord', 'SemanticVector']);
    for (const record of records.slice(0, 160)) {
      await this.ensurePersonaNode(record.personaId);
      await this.exec(
        `CREATE (:SemanticRecord {id: ${q(record.id)}, scopeKey: ${q(normalizedScopeKey)}, personaId: ${q(record.personaId)}, text: ${q(record.text)}, userText: ${q(record.userText)}, assistantText: ${q(record.assistantText)}, embeddingJson: ${q(JSON.stringify(record.embedding ?? []))}, createdAt: ${intValue(record.createdAt)}})`,
      );
      await this.createScopeRelation('HAS_SEMANTIC', 'SemanticRecord', normalizedScopeKey, record.id);
      await this.createSemanticPersonaRelation(record.id, record.personaId);
      const embedding = normalizeEmbeddingArray(record.embedding);
      if (embedding.length > 0) {
        await this.ensureSemanticVectorTable(embedding.length);
        const vectorTable = semanticVectorTableName(embedding.length);
        await this.exec(
          `CREATE (:SemanticVector {id: ${q(record.id)}, scopeKey: ${q(normalizedScopeKey)}, personaId: ${q(record.personaId)}, text: ${q(record.text)}, userText: ${q(record.userText)}, assistantText: ${q(record.assistantText)}, dimension: ${embedding.length}, vectorTable: ${q(vectorTable)}, createdAt: ${intValue(record.createdAt)}})`,
        );
        await this.exec(
          `CREATE (:${vectorTable} {id: ${q(record.id)}, scopeKey: ${q(normalizedScopeKey)}, personaId: ${q(record.personaId)}, text: ${q(record.text)}, userText: ${q(record.userText)}, assistantText: ${q(record.assistantText)}, embedding: ${vectorLiteral(embedding)}, createdAt: ${intValue(record.createdAt)}})`,
        );
        await this.createScopeRelation('HAS_VECTOR', 'SemanticVector', normalizedScopeKey, record.id);
        await this.createVectorPersonaRelation(record.id, record.personaId);
      }
    }
    await this.rebuildSemanticVectorIndexes(records).catch(() => undefined);
  }

  private async replaceRelationshipGraph(profiles: Record<string, Record<string, unknown>>) {
    await this.deleteAllRelationshipGraphRows();
    for (const [scopeKey, profile] of Object.entries(profiles)) {
      const normalizedScopeKey = normalizeScopeKey(scopeKey);
      const parsedScope = parseScopeKey(normalizedScopeKey);
      const profileId = relationshipProfileId(normalizedScopeKey);
      await this.ensureScopeNode(normalizedScopeKey);
      await this.ensurePersonaNode(parsedScope.personaId);
      await this.exec(
        `CREATE (:RelationshipProfile {id: ${q(profileId)}, scopeKey: ${q(normalizedScopeKey)}, personaId: ${q(parsedScope.personaId)}, relationshipStage: ${q(stringValue(profile['relationshipStage']))}, mood: ${q(stringValue(profile['mood']))}, trust: ${intValue(profile['trust'])}, attraction: ${intValue(profile['attraction'])}, respect: ${intValue(profile['respect'])}, irritation: ${intValue(profile['irritation'])}, jealousy: ${intValue(profile['jealousy'])}, guard: ${intValue(profile['guard'])}, turnCount: ${intValue(profile['turnCount'])}, lastDiaryTurnCount: ${intValue(profile['lastDiaryTurnCount'])}, lastSeenAt: ${profile['lastSeenAt'] === null ? 0 : intValue(profile['lastSeenAt'])}, lastActionTag: ${q(stringValue(profile['lastActionTag']))}, summary: ${q(stringValue(profile['summary']))}, diaryEntry: ${q(stringValue(profile['diaryEntry']))}, updatedAt: ${Date.now()}})`,
      );
      await this.exec(
        `MATCH (s:MemoryScope), (m:RelationshipProfile) WHERE s.id = ${q(normalizedScopeKey)} AND m.id = ${q(profileId)} CREATE (s)-[:HAS_RELATIONSHIP]->(m)`,
      );
      await this.exec(
        `MATCH (m:RelationshipProfile), (p:Persona) WHERE m.id = ${q(profileId)} AND p.id = ${q(parsedScope.personaId)} CREATE (m)-[:RELATIONSHIP_AS_PERSONA]->(p)`,
      );
      const facts = arrayValue(profile['facts'])
        .map((value) => stringValue(value))
        .filter(Boolean)
        .slice(0, 60);
      for (let index = 0; index < facts.length; index += 1) {
        const factId = `${profileId}:fact:${index}`;
        await this.exec(
          `CREATE (:RelationshipFact {id: ${q(factId)}, profileId: ${q(profileId)}, scopeKey: ${q(normalizedScopeKey)}, text: ${q(facts[index])}, updatedAt: ${Date.now()}})`,
        );
        await this.exec(
          `MATCH (m:RelationshipProfile), (f:RelationshipFact) WHERE m.id = ${q(profileId)} AND f.id = ${q(factId)} CREATE (m)-[:HAS_RELATIONSHIP_FACT]->(f)`,
        );
      }
    }
  }

  private async deleteAllRelationshipGraphRows() {
    await this.exec('MATCH (m:RelationshipProfile)-[r:HAS_RELATIONSHIP_FACT]->(f:RelationshipFact) DELETE r').catch(() => undefined);
    await this.exec('MATCH (m:RelationshipProfile)-[r:RELATIONSHIP_AS_PERSONA]->(p:Persona) DELETE r').catch(() => undefined);
    await this.exec('MATCH (s:MemoryScope)-[r:HAS_RELATIONSHIP]->(m:RelationshipProfile) DELETE r').catch(() => undefined);
    await this.exec('MATCH (m:RelationshipFact) DELETE m').catch(() => undefined);
    await this.exec('MATCH (m:RelationshipProfile) DELETE m').catch(() => undefined);
  }

  private async deleteGraphRowsForScope(scopeKey: string, labels: string[]) {
    if (labels.includes('SemanticVector')) {
      await this.deleteSemanticVectorRowsForScope(scopeKey);
    }
    await this.deleteGraphRelationsForScope(scopeKey, labels);
    for (const label of labels) {
      await this.exec(`MATCH (m:${label}) WHERE m.scopeKey = ${q(scopeKey)} DELETE m`);
    }
  }

  private async deleteSemanticVectorRowsForScope(scopeKey: string) {
    const rows = await this
      .all(
        `MATCH (m:SemanticVector) WHERE m.scopeKey = ${q(scopeKey)} RETURN m.id AS id, m.vectorTable AS vectorTable`,
      )
      .catch(() => []);
    for (const row of rows) {
      const id = stringValue(row['id']);
      const vectorTable = stringValue(row['vectorTable']);
      if (!id || !/^SemanticVectorDim\d+$/.test(vectorTable)) {
        continue;
      }
      await this.exec(`MATCH (m:${vectorTable}) WHERE m.id = ${q(id)} DELETE m`).catch(
        () => undefined,
      );
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
    if (labels.includes('EmotionState') || labels.includes('EmotionIntensity')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_EMOTION]->(m:EmotionState) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:EmotionState)-[r:HAS_EMOTION_INTENSITY]->(i:EmotionIntensity) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
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
    if (labels.includes('SemanticVector')) {
      await this.exec(
        `MATCH (s:MemoryScope)-[r:HAS_VECTOR]->(m:SemanticVector) WHERE s.id = ${q(scopeKey)} DELETE r`,
      ).catch(() => undefined);
      await this.exec(
        `MATCH (m:SemanticVector)-[r:VECTOR_FOR_PERSONA]->(p:Persona) WHERE m.scopeKey = ${q(scopeKey)} DELETE r`,
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
    relation:
      | 'HAS_CANDIDATE'
      | 'HAS_BLOCK'
      | 'HAS_DIARY'
      | 'HAS_SEMANTIC'
      | 'HAS_VECTOR',
    label:
      | 'MemoryCandidate'
      | 'MemoryBlock'
      | 'DiaryEntry'
      | 'SemanticRecord'
      | 'SemanticVector',
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

  private async createVectorPersonaRelation(memoryId: string, personaId: string) {
    await this.exec(
      `MATCH (m:SemanticVector), (p:Persona) WHERE m.id = ${q(memoryId)} AND p.id = ${q(personaId || 'unknown')} CREATE (m)-[:VECTOR_FOR_PERSONA]->(p)`,
    );
  }

  private async ensureSemanticVectorTable(dimension: number) {
    const vectorTable = semanticVectorTableName(dimension);
    const state = await this.open();
    await this.ensureNodeTable(
      state.connection,
      vectorTable,
      `id STRING PRIMARY KEY, scopeKey STRING, personaId STRING, text STRING, userText STRING, assistantText STRING, embedding FLOAT[${dimension}], createdAt INT64`,
    );
  }

  private async rebuildSemanticVectorIndexes(records: LadybugSemanticMemoryRecord[]) {
    const dimensions = new Set(
      records
        .map((record) => normalizeEmbeddingArray(record.embedding).length)
        .filter((dimension) => dimension > 0),
    );
    for (const dimension of dimensions) {
      await this.ensureSemanticVectorIndex(dimension, { rebuild: true });
    }
  }

  private async ensureSemanticVectorIndex(
    dimension: number,
    options: { rebuild?: boolean } = {},
  ) {
    await this.ensureSemanticVectorTable(dimension);
    const vectorTable = semanticVectorTableName(dimension);
    const vectorIndex = semanticVectorIndexName(dimension);
    await this.exec('INSTALL VECTOR').catch(() => undefined);
    await this.exec('LOAD VECTOR');
    if (options.rebuild) {
      await this.exec(`CALL DROP_VECTOR_INDEX('${vectorTable}', '${vectorIndex}')`).catch(
        () => undefined,
      );
    }
    await this.exec(
      `CALL CREATE_VECTOR_INDEX('${vectorTable}', '${vectorIndex}', 'embedding', metric := 'cosine')`,
    ).catch((error) => {
      const message = String(error instanceof Error ? error.message : error).toLowerCase();
      if (!message.includes('exist') && !message.includes('already')) {
        throw error;
      }
    });
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

function relationshipProfileId(scopeKey: string) {
  return `relationship:${scopeKey}`;
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

function normalizeEmbeddingArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : null))
    .filter((item): item is number => item !== null);
}

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => (Number.isFinite(value) ? value : 0)).join(', ')}]`;
}

function semanticVectorTableName(dimension: number) {
  return `SemanticVectorDim${Math.max(1, Math.min(10000, Math.trunc(dimension)))}`;
}

function semanticVectorIndexName(dimension: number) {
  return `semantic_vector_idx_${Math.max(1, Math.min(10000, Math.trunc(dimension)))}`;
}

function normalizeRelationshipProfiles(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value)
      .map(([scopeKey, profile]) => [
        normalizeScopeKey(scopeKey),
        profile && typeof profile === 'object' && !Array.isArray(profile)
          ? (profile as Record<string, unknown>)
          : null,
      ])
      .filter((entry): entry is [string, Record<string, unknown>] => Boolean(entry[0] && entry[1])),
  );
}
