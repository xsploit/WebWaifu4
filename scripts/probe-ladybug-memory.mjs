import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Connection, Database } from '@ladybugdb/core';

const dbDir = join(tmpdir(), `webwaifu4-ladybug-memory-${process.pid}`);

async function all(connection, query) {
  const result = await connection.query(query);
  return await result.getAll();
}

async function main() {
  await rm(dbDir, { recursive: true, force: true });
  const db = new Database(dbDir);
  const connection = new Connection(db);

  try {
    await connection.query(
      'CREATE NODE TABLE Participant(id STRING, displayName STRING, source STRING, channel STRING, PRIMARY KEY(id))',
    );
    await connection.query(
      'CREATE NODE TABLE Persona(id STRING, name STRING, PRIMARY KEY(id))',
    );
    await connection.query(
      'CREATE NODE TABLE ChatTurn(id STRING, text STRING, source STRING, channel STRING, createdAt INT64, PRIMARY KEY(id))',
    );
    await connection.query(
      'CREATE NODE TABLE MemoryFact(id STRING, scopeKey STRING, participantKey STRING, fact STRING, confidence DOUBLE, PRIMARY KEY(id))',
    );
    await connection.query(
      'CREATE NODE TABLE DiaryEntry(id STRING, scopeKey STRING, participantKey STRING, summary STRING, emotion STRING, PRIMARY KEY(id))',
    );
    await connection.query(
      'CREATE REL TABLE SAID(FROM Participant TO ChatTurn)',
    );
    await connection.query(
      'CREATE REL TABLE FOR_PERSONA(FROM ChatTurn TO Persona)',
    );
    await connection.query(
      'CREATE REL TABLE ABOUT(FROM MemoryFact TO Participant)',
    );
    await connection.query(
      'CREATE REL TABLE REFLECTS_ON(FROM DiaryEntry TO ChatTurn)',
    );

    await connection.query(`
      CREATE (:Participant {id: 'local:subby', displayName: 'Subby', source: 'local', channel: 'local'});
      CREATE (:Participant {id: 'twitch:subsect:rayen', displayName: 'Rayen', source: 'twitch', channel: 'subsect'});
      CREATE (:Persona {id: 'hikari-chan', name: 'Hikari-chan'});
      CREATE (:ChatTurn {id: 'turn-local-1', text: 'remember I like fast Fish websocket TTS', source: 'local', channel: 'local', createdAt: 1779660000000});
      CREATE (:ChatTurn {id: 'turn-twitch-1', text: '@Hikari did you remember the stream context?', source: 'twitch', channel: 'subsect', createdAt: 1779660001000});
      CREATE (:MemoryFact {id: 'fact-local-1', scopeKey: 'local:persona:hikari-chan', participantKey: 'local:local:subby', fact: 'Subby cares about fast Fish websocket TTS latency.', confidence: 0.94});
      CREATE (:MemoryFact {id: 'fact-twitch-1', scopeKey: 'twitch:subsect:persona:hikari-chan', participantKey: 'twitch:subsect:rayen', fact: 'Rayen asks about stream context in Twitch chat.', confidence: 0.88});
      CREATE (:DiaryEntry {id: 'diary-1', scopeKey: 'twitch:subsect:persona:hikari-chan', participantKey: 'twitch:subsect:rayen', summary: 'Rayen checked whether Hikari retained stream context.', emotion: 'curious'});
    `);

    await connection.query(`
      MATCH (p:Participant), (t:ChatTurn)
      WHERE p.id = 'local:subby' AND t.id = 'turn-local-1'
      CREATE (p)-[:SAID]->(t);
      MATCH (p:Participant), (t:ChatTurn)
      WHERE p.id = 'twitch:subsect:rayen' AND t.id = 'turn-twitch-1'
      CREATE (p)-[:SAID]->(t);
      MATCH (t:ChatTurn), (persona:Persona)
      WHERE t.id IN ['turn-local-1', 'turn-twitch-1'] AND persona.id = 'hikari-chan'
      CREATE (t)-[:FOR_PERSONA]->(persona);
      MATCH (f:MemoryFact), (p:Participant)
      WHERE f.participantKey = 'local:local:subby' AND p.id = 'local:subby'
      CREATE (f)-[:ABOUT]->(p);
      MATCH (f:MemoryFact), (p:Participant)
      WHERE f.participantKey = 'twitch:subsect:rayen' AND p.id = 'twitch:subsect:rayen'
      CREATE (f)-[:ABOUT]->(p);
      MATCH (d:DiaryEntry), (t:ChatTurn)
      WHERE d.id = 'diary-1' AND t.id = 'turn-twitch-1'
      CREATE (d)-[:REFLECTS_ON]->(t);
    `);

    const localFacts = await all(
      connection,
      `
        MATCH (f:MemoryFact)-[:ABOUT]->(p:Participant)
        WHERE f.scopeKey = 'local:persona:hikari-chan'
        RETURN p.displayName AS participant, p.source AS source, f.fact AS fact, f.confidence AS confidence
        ORDER BY f.confidence DESC
      `,
    );
    const twitchContext = await all(
      connection,
      `
        MATCH (p:Participant)-[:SAID]->(t:ChatTurn)<-[:REFLECTS_ON]-(d:DiaryEntry)
        RETURN p.displayName AS participant, t.text AS turnText, d.summary AS diarySummary, d.emotion AS emotion
      `,
    );
    const personaTurns = await all(
      connection,
      `
        MATCH (p:Participant)-[:SAID]->(t:ChatTurn)-[:FOR_PERSONA]->(persona:Persona)
        WHERE persona.id = 'hikari-chan'
        RETURN p.displayName AS participant, t.source AS source, t.channel AS channel, t.text AS text
        ORDER BY t.createdAt ASC
      `,
    );

    console.log(
      JSON.stringify(
        {
          dbDir,
          localFacts,
          personaTurns,
          twitchContext,
          verdict:
            localFacts.length === 1 && twitchContext.length === 1 && personaTurns.length === 2
              ? 'ladybug-memory-graph-probe-pass'
              : 'ladybug-memory-graph-probe-unexpected-result',
        },
        null,
        2,
      ),
    );
  } finally {
    await connection.close().catch(() => undefined);
    await db.close().catch(() => undefined);
    await rm(dbDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
