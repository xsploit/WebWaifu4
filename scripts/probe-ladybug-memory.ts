import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LadybugMemoryService } from '../server/src/memory/LadybugMemoryService';

const dbDir = join(tmpdir(), `webwaifu4-ladybug-memory-probe-${process.pid}`);
const localScope = 'local:persona:hikari-probe';
const twitchScope = 'twitch:subsect:persona:hikari-probe';

async function main() {
  await rm(dbDir, { recursive: true, force: true });
  const service = new LadybugMemoryService(dbDir);

  try {
    await service.saveGrilloState(localScope, createGrilloState(localScope, 'local:local:subby', 'local'));
    await service.saveGrilloState(
      twitchScope,
      createGrilloState(twitchScope, 'twitch:subsect:rayen', 'twitch'),
    );
    await service.saveSemanticRecords(localScope, [
      {
        assistantText: 'Local vector memory acknowledged.',
        createdAt: Date.parse('2026-05-25T12:00:02.000Z'),
        embedding: [1, 0, 0],
        id: 'probe-local-semantic',
        personaId: 'hikari-probe',
        scopeKey: localScope,
        text: 'User: remember local Ladybug vectors\nHikari: Local vector memory acknowledged.',
        userText: 'remember local Ladybug vectors',
      },
    ]);
    await service.saveSemanticRecords(twitchScope, [
      {
        assistantText: 'Twitch vector memory acknowledged.',
        createdAt: Date.parse('2026-05-25T12:00:03.000Z'),
        embedding: [0, 1, 0],
        id: 'probe-twitch-semantic',
        personaId: 'hikari-probe',
        scopeKey: twitchScope,
        text: 'User: remember Twitch Ladybug vectors\nHikari: Twitch vector memory acknowledged.',
        userText: 'remember Twitch Ladybug vectors',
      },
    ]);
    await service.saveRelationshipProfiles({
      [localScope]: createRelationshipProfile('focused', 'Local probe relationship summary.', [
        'Subby wants local Ladybug memory.',
      ]),
      [twitchScope]: createRelationshipProfile('curious', 'Twitch probe relationship summary.', [
        'Rayen wants Twitch Ladybug memory.',
      ]),
    });

    const status = await service.getStatus();
    const graph = await service.getGraphSummary();
    const localVectorMatches = await service.querySemanticVectors(localScope, [1, 0, 0], 2);
    const twitchVectorMatches = await service.querySemanticVectors(twitchScope, [0, 1, 0], 2);
    const graphText = JSON.stringify(graph);

    const assertions = [
      ['status.backend', status.backend === 'ladybug'],
      ['status.scopes', status.scopes === 2],
      ['status.participants', status.participants === 2],
      ['status.personas', status.personas === 1],
      ['status.candidates', status.candidates === 2],
      ['status.memoryBlocks', status.memoryBlocks === 2],
      ['status.diaryEntries', status.diaryEntries === 2],
      ['status.emotionStates', status.emotionStates === 2],
      ['status.emotionIntensities', status.emotionIntensities === 2],
      ['status.semanticRecords', status.semanticRecords === 2],
      ['status.semanticVectors', status.semanticVectors === 2],
      ['status.relationshipProfiles', status.relationshipProfiles === 2],
      ['status.relationshipFacts', status.relationshipFacts === 2],
      ['local vector search', localVectorMatches[0]?.id === 'probe-local-semantic'],
      ['twitch vector search', twitchVectorMatches[0]?.id === 'probe-twitch-semantic'],
      ['graph local scope', graphText.includes(localScope)],
      ['graph twitch scope', graphText.includes(twitchScope)],
      ['graph relationship facts', graphText.includes('Rayen wants Twitch Ladybug memory.')],
    ] as const;
    const failures = assertions.filter(([, ok]) => !ok).map(([name]) => name);
    if (failures.length > 0) {
      throw new Error(`Ladybug memory probe failed: ${failures.join(', ')}`);
    }

    console.log(
      JSON.stringify(
        {
          dbDir,
          graphEdges: graph.edges,
          localVectorMatches: localVectorMatches.map((match) => ({
            id: match.id,
            score: Number(match.score.toFixed(4)),
          })),
          status,
          twitchVectorMatches: twitchVectorMatches.map((match) => ({
            id: match.id,
            score: Number(match.score.toFixed(4)),
          })),
          verdict: 'ladybug-memory-service-probe-pass',
        },
        null,
        2,
      ),
    );
  } finally {
    await service.close();
    await rm(dbDir, { recursive: true, force: true }).catch(() => undefined);
    await rm(`${dbDir}.wal`, { recursive: true, force: true }).catch(() => undefined);
  }
}

function createGrilloState(scopeKey: string, participantKey: string, label: 'local' | 'twitch') {
  return {
    blocks: [
      {
        blockId: `probe-${label}-block`,
        blockName: label === 'local' ? 'preferences' : 'viewer_context',
        createdAt: Date.parse('2026-05-25T12:00:00.000Z'),
        items: [`${label} Ladybug memory block`],
        participantKey,
        scopeKey,
        sourceCandidateIds: [`probe-${label}-candidate`],
        updatedAt: Date.parse('2026-05-25T12:00:01.000Z'),
      },
    ],
    candidates: [
      {
        candidateId: `probe-${label}-candidate`,
        confidence: 0.94,
        content: `${label} Ladybug memory candidate`,
        createdAt: Date.parse('2026-05-25T12:00:00.000Z'),
        participantKey,
        scopeKey,
        source: label,
        sourceTurnIds: [`probe-${label}-turn`],
        summary: `${label} Ladybug memory candidate`,
        type: 'fact',
      },
    ],
    diaryEntries: [
      {
        beatType: 'relationship',
        createdAt: Date.parse('2026-05-25T12:00:01.000Z'),
        diaryId: `probe-${label}-diary`,
        emotions: [{ intensity: label === 'local' ? 6 : 5, name: label === 'local' ? 'focused' : 'curious' }],
        participantKey,
        personalThought: `I remembered ${label} Ladybug memory.`,
        scopeKey,
        sourceTurnIds: [`probe-${label}-turn`],
        summary: `${label} Ladybug diary entry`,
        tags: ['ladybug', label],
      },
    ],
    emotionState: {
      intensities: { [label === 'local' ? 'focused' : 'curious']: label === 'local' ? 6 : 5 },
      lastSignalAt: Date.parse('2026-05-25T12:00:01.000Z'),
      lastSignalSource: `diary:probe-${label}-diary`,
      updatedAt: Date.parse('2026-05-25T12:00:01.000Z'),
    },
    promotedCandidateIds: [`probe-${label}-candidate`],
    scopeKey,
    updatedAt: Date.parse('2026-05-25T12:00:01.000Z'),
    version: 1,
  };
}

function createRelationshipProfile(mood: string, summary: string, facts: string[]) {
  return {
    attraction: 1,
    diaryEntry: `${summary} diary`,
    facts,
    guard: 8,
    irritation: 0,
    jealousy: 0,
    lastActionTag: 'none',
    lastDiaryTurnCount: 1,
    lastSeenAt: Date.parse('2026-05-25T12:00:03.000Z'),
    mood,
    relationshipStage: 'familiar',
    respect: 5,
    summary,
    trust: 6,
    turnCount: 1,
    version: 2,
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
