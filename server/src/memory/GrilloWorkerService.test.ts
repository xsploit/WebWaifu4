import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GrilloWorkerService } from './GrilloWorkerService';
import { LadybugMemoryService } from './LadybugMemoryService';

const dbPaths: string[] = [];

function createServices() {
  const dbPath = join(tmpdir(), `webwaifu4-grillo-worker-test-${process.pid}-${Date.now()}.db`);
  dbPaths.push(dbPath);
  const memory = new LadybugMemoryService(dbPath);
  let id = 0;
  const grillo = new GrilloWorkerService(
    memory,
    () => 1770000000000,
    () => `id-${++id}`,
  );
  return { grillo, memory };
}

afterEach(async () => {
  await Promise.all(
    dbPaths.splice(0).map(async (dbPath) => {
      await rm(dbPath, { force: true }).catch(() => undefined);
      await rm(`${dbPath}.wal`, { force: true }).catch(() => undefined);
      await rm(`${dbPath}.json`, { force: true }).catch(() => undefined);
    }),
  );
});

describe('GrilloWorkerService', () => {
  it('ingests a local turn pair as native Ladybug GRILLO turn events', async () => {
    const { grillo, memory } = createServices();
    try {
      const result = await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will remember that clean memory matters.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey: 'local:local:subsect',
        scopeKey: 'local:persona:hikari-chan',
        source: 'local',
        userText: 'remember that clean memory matters',
      });

      const graph = await memory.getGraphSummary();

      expect(result.turnIds).toEqual(['id-1', 'id-2']);
      expect(graph.recent.turns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            authorName: 'Subsect',
            role: 'user',
            text: 'remember that clean memory matters',
          }),
          expect.objectContaining({
            authorName: 'Hikari-chan',
            role: 'assistant',
            text: 'I will remember that clean memory matters.',
          }),
        ]),
      );
      expect(graph.edges.map((edge) => edge.relation)).toContain('HAS_TURN');
    } finally {
      await memory.close();
    }
  });

  it('runs a manual extraction pass through Ladybug candidates, diary, slots, activity, and traces', async () => {
    const { grillo, memory } = createServices();
    try {
      const result = await grillo.runManualExtraction({
        beatType: 'relationship',
        candidate: {
          confidence: 0.88,
          content: 'Subsect wants backend-owned GRILLO memory.',
          summary: 'Subsect wants GRILLO owned by the backend.',
          type: 'goal',
        },
        diary: {
          personalThought: 'I should treat backend GRILLO as the source of durable memory.',
          summary: 'Subsect clarified GRILLO ownership.',
          tags: ['grillo', 'backend'],
        },
        participantKey: 'local:local:subsect',
        responseText: 'Manual extraction wrote the backend ownership memory.',
        scopeKey: 'local:persona:hikari-chan',
        slot: {
          items: ['Subsect wants backend-owned GRILLO memory.'],
          operation: 'merge',
          slotName: 'ongoing_threads',
          sourceCandidateIds: ['id-2'],
        },
        trace: {
          model: 'gpt-5-nano',
          prompt: 'New messages to process...',
          provider: 'vercel-gateway',
          systemPrompt: 'You are the background sleep-time memory agent.',
        },
      });

      const graph = await memory.getGraphSummary();

      expect(result).toMatchObject({
        activityId: 'id-5',
        beatType: 'relationship',
        candidateIds: ['id-2'],
        diaryIds: ['id-3'],
        slotIds: ['local:persona:hikari-chan:ongoing_threads'],
        traceId: 'id-1',
        writes: 3,
      });
      expect(graph.recent.candidates[0]?.summary).toBe(
        'Subsect wants GRILLO owned by the backend.',
      );
      expect(graph.recent.diary[0]?.summary).toBe('Subsect clarified GRILLO ownership.');
      expect(graph.recent.slots[0]).toMatchObject({
        itemCount: 1,
        slotName: 'ongoing_threads',
      });
      expect(graph.recent.activities[0]).toMatchObject({
        responseText: 'Manual extraction wrote the backend ownership memory.',
      });
      expect(graph.recent.traces[0]).toMatchObject({
        model: 'gpt-5-nano',
        provider: 'vercel-gateway',
        taskType: 'manual_extraction',
      });

      await memory.saveRelationshipProfiles({
        'local:persona:hikari-chan': {
          facts: ['Subsect wants backend-owned GRILLO memory.'],
          mood: 'focused',
          relationshipStage: 'familiar',
          summary: 'Subsect is verifying native GRILLO context packets.',
        },
      });
      await memory.saveSemanticRecords('local:persona:hikari-chan', [
        {
          assistantText: 'Native context packet acknowledged.',
          createdAt: 1770000002000,
          embedding: [1, 0, 0],
          id: 'semantic-1',
          personaId: 'hikari-chan',
          scopeKey: 'local:persona:hikari-chan',
          text: 'User: native GRILLO packet\nHikari: Native context packet acknowledged.',
          userText: 'native GRILLO packet',
        },
      ]);

      const packet = await grillo.buildContextPacket({
        participantKeys: ['local:local:subsect'],
        query: 'native GRILLO packet',
        scopeKey: 'local:persona:hikari-chan',
      });

      expect(packet.background_information).toContain('scope_key: local:persona:hikari-chan');
      expect(packet.relationship_memory.join('\n')).toContain(
        'Subsect is verifying native GRILLO context packets.',
      );
      expect(packet.relationship_memory.join('\n')).toContain(
        '[slot:ongoing_threads local:local:subsect] Subsect wants backend-owned GRILLO memory.',
      );
      expect(packet.recalled_memories.map((item) => item.text).join('\n')).toContain(
        'Subsect wants GRILLO owned by the backend.',
      );
      expect(packet.recalled_memories.map((item) => item.text).join('\n')).toContain(
        'Native context packet acknowledged.',
      );
      expect(packet.thoughts.join('\n')).toContain(
        'I should treat backend GRILLO as the source of durable memory.',
      );
    } finally {
      await memory.close();
    }
  });
});
