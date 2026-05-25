import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { LadybugMemoryService } from './LadybugMemoryService';

const dbPaths: string[] = [];

function createService() {
  const dbPath = join(tmpdir(), `webwaifu4-ladybug-test-${process.pid}-${Date.now()}.db`);
  dbPaths.push(dbPath);
  return new LadybugMemoryService(dbPath);
}

afterEach(async () => {
  await Promise.all(
    dbPaths.splice(0).map(async (dbPath) => {
      await rm(dbPath, { force: true }).catch(() => undefined);
      await rm(`${dbPath}.wal`, { force: true }).catch(() => undefined);
    }),
  );
});

describe('LadybugMemoryService', () => {
  it('stores Grillo, semantic, participant, persona, and relationship graph rows', async () => {
    const service = createService();
    try {
      await service.saveGrilloState('local:persona:hikari-chan', {
        blocks: [
          {
            blockId: 'block-1',
            blockName: 'preferences',
            createdAt: 2,
            items: ['Subby likes fast TTS.'],
            participantKey: 'local:local:subby',
            scopeKey: 'local:persona:hikari-chan',
            sourceCandidateIds: ['candidate-1'],
            updatedAt: 3,
          },
        ],
        candidates: [
          {
            candidateId: 'candidate-1',
            confidence: 0.94,
            content: 'Subby likes fast TTS.',
            createdAt: 1,
            participantKey: 'local:local:subby',
            scopeKey: 'local:persona:hikari-chan',
            source: 'local',
            sourceTurnIds: ['turn-1'],
            summary: 'Subby likes fast TTS.',
            type: 'preference',
          },
        ],
        diaryEntries: [
          {
            beatType: 'relationship',
            createdAt: 4,
            diaryId: 'diary-1',
            participantKey: 'local:local:subby',
            personalThought: 'I should remember that fast speech latency matters here.',
            scopeKey: 'local:persona:hikari-chan',
            sourceTurnIds: ['turn-1'],
            summary: 'Subby emphasized fast TTS.',
            tags: ['tts'],
          },
        ],
        emotionState: { intensities: {}, updatedAt: 0 },
        promotedCandidateIds: ['candidate-1'],
        scopeKey: 'local:persona:hikari-chan',
        updatedAt: 5,
        version: 1,
      });

      await service.saveSemanticRecords('local:persona:hikari-chan', [
        {
          assistantText: 'Got it.',
          createdAt: 6,
          embedding: [0.1, 0.2, 0.3],
          id: 'semantic-1',
          personaId: 'hikari-chan',
          scopeKey: 'local:persona:hikari-chan',
          text: 'User: remember fast TTS\nHikari-chan: Got it.',
          userText: 'remember fast TTS',
        },
      ]);

      const grilloState = await service.loadGrilloState('local:persona:hikari-chan');
      const semanticRecords = await service.loadSemanticRecords('local:persona:hikari-chan');
      const status = await service.getStatus();

      expect((grilloState as { candidates: unknown[] }).candidates).toHaveLength(1);
      expect(semanticRecords?.[0]?.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(status.scopes).toBe(1);
      expect(status.participants).toBe(1);
      expect(status.personas).toBe(1);
      expect(status.candidates).toBe(1);
      expect(status.diaryEntries).toBe(1);
      expect(status.semanticRecords).toBe(1);
      expect(status.relationshipEdges).toBe(4);
    } finally {
      await service.close();
    }
  });
});
