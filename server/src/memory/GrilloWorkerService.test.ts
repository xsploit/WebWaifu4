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

  it('runs core worker tools against Ladybug and records tool telemetry', async () => {
    const { grillo, memory } = createServices();
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      const memoryWrite = await grillo.runWorkerTool({
        args: {
          block_name: 'preferences',
          items: ['Subsect likes direct technical memory checks.'],
          operation: 'merge',
          source_candidate_ids: ['cand-existing'],
        },
        name: 'core.worker_memory_write',
        participantKey,
        scopeKey,
      });
      const candidateWrite = await grillo.runWorkerTool({
        args: {
          confidence: 0.91,
          content: 'Subsect wants GRILLO worker tools backed by Ladybug.',
          summary: 'Subsect wants native Ladybug worker tools.',
          type: 'goal',
        },
        name: 'core.worker_candidate_write',
        participantKey,
        scopeKey,
      });
      const diaryWrite = await grillo.runWorkerTool({
        args: {
          beat_type: 'reflection',
          personal_thought: 'I should keep GRILLO tool writes visible and inspectable.',
          summary: 'GRILLO tool writes should be inspectable.',
          tags: ['grillo', 'tools'],
        },
        name: 'core.worker_diary_write',
        participantKey,
        scopeKey,
      });
      const profilePatch = await grillo.runWorkerTool({
        args: {
          field: 'active_threads',
          operation: 'add',
          value: 'native GRILLO worker tools',
        },
        name: 'core.worker_profile_patch',
        participantKey,
        scopeKey,
      });
      const archivalWrite = await grillo.runWorkerTool({
        args: {
          text: 'Native GRILLO worker tools use Ladybug records.',
        },
        name: 'core.worker_memory_insert_archival',
        participantKey,
        scopeKey,
      });
      const memoryRead = await grillo.runWorkerTool({
        args: { block_name: 'preferences' },
        name: 'core.worker_memory_read',
        participantKey,
        scopeKey,
      });
      const search = await grillo.runWorkerTool({
        args: { limit: 10, query: 'Ladybug worker tools' },
        name: 'core.worker_memory_search',
        participantKey,
        scopeKey,
      });
      const candidateList = await grillo.runWorkerTool({
        args: { type_filter: 'goal' },
        name: 'core.worker_candidate_list',
        participantKey,
        scopeKey,
      });

      expect(memoryWrite.ok).toBe(true);
      expect(candidateWrite.ok).toBe(true);
      expect(diaryWrite.ok).toBe(true);
      expect(profilePatch.ok).toBe(true);
      expect(archivalWrite.ok).toBe(true);
      expect(memoryRead.result).toMatchObject({
        slots: [
          expect.objectContaining({
            items: ['Subsect likes direct technical memory checks.'],
            slot_name: 'preferences',
          }),
        ],
      });
      expect(String(JSON.stringify(search.result))).toContain('native Ladybug worker tools');
      expect(String(JSON.stringify(search.result))).toContain('Native GRILLO worker tools use Ladybug records');
      expect(candidateList.result).toMatchObject({
        candidates: [expect.objectContaining({ summary: 'Subsect wants native Ladybug worker tools.' })],
      });

      const graph = await memory.getGraphSummary();
      expect(graph.recent.activities.filter((row) => row.beatType === 'worker_tool')).toHaveLength(8);
      expect(graph.edges.map((edge) => edge.relation)).toEqual(
        expect.arrayContaining(['HAS_BLOCK', 'HAS_SLOT', 'HAS_SLOT_PATCH', 'HAS_ACTIVITY']),
      );

      const packet = await grillo.buildContextPacket({
        participantKeys: [participantKey],
        query: 'Ladybug worker tools',
        scopeKey,
      });
      expect(packet.relationship_memory.join('\n')).toContain(
        'Subsect likes direct technical memory checks.',
      );
      expect(packet.recalled_memories.map((item) => item.text).join('\n')).toContain(
        'Subsect wants native Ladybug worker tools.',
      );
      expect(packet.thoughts.join('\n')).toContain(
        'I should keep GRILLO tool writes visible and inspectable.',
      );
    } finally {
      await memory.close();
    }
  });

  it('runs backend extraction ticks from native turn pairs into context-visible memory', async () => {
    const { grillo, memory } = createServices();
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will keep the GRILLO backend thread visible.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey,
        scopeKey,
        source: 'local',
        userText: 'backend grillo extraction should remember this thread',
      });

      const firstTick = await grillo.runTick({
        reason: 'manual_test',
        scopeKey,
      });

      expect(firstTick).toMatchObject({
        noOpReason: '',
        ok: true,
        reason: 'manual_test',
        writes: 3,
      });

      const graph = await memory.getGraphSummary();
      expect(graph.recent.traces[0]).toMatchObject({
        model: 'native-extraction',
        provider: 'backend',
        taskType: 'extraction',
      });
      expect(graph.recent.candidates[0]?.summary).toContain(
        'backend grillo extraction should remember this thread',
      );
      expect(graph.recent.diary[0]?.summary).toBe('Processed a recent exchange with Subsect.');
      expect(graph.recent.slots[0]).toMatchObject({
        itemCount: 1,
        slotName: 'open_threads',
      });
      expect(graph.recent.activities.some((row) => row.beatType === 'worker_tick')).toBe(true);
      expect(graph.recent.activities.filter((row) => row.beatType === 'worker_tool')).toHaveLength(
        3,
      );

      const packet = await grillo.buildContextPacket({
        participantKeys: [participantKey],
        query: 'backend grillo extraction',
        scopeKey,
      });
      expect(packet.recalled_memories.map((item) => item.text).join('\n')).toContain(
        'backend grillo extraction should remember this thread',
      );
      expect(packet.relationship_memory.join('\n')).toContain('[slot:open_threads');
      expect(packet.thoughts.join('\n')).toContain(
        'I should remember this recent exchange with Subsect',
      );

      await expect(grillo.runTick({ reason: 'manual_test', scopeKey })).resolves.toMatchObject({
        noOpReason: 'no_new_turn_pairs',
        writes: 0,
      });
    } finally {
      await memory.close();
    }
  });

  it('runs LLM-guided backend extraction ticks through the memory lane tool loop', async () => {
    const { grillo, memory } = createServices();
    const requests: Array<{
      maxToolRounds: number;
      messages: Array<{ content: string; role: string }>;
      stateKey: string;
      stateScope: string;
      toolChoiceMode: string;
    }> = [];
    try {
      const scopeKey = 'local:persona:hikari-chan';
      const participantKey = 'local:local:subsect';

      await grillo.ingestTurnPair({
        assistantName: 'Hikari-chan',
        assistantText: 'I will keep backend memory lane extraction grounded.',
        authorName: 'Subsect',
        channelId: 'local',
        createdAt: 1770000001000,
        participantKey,
        scopeKey,
        source: 'local',
        userText: 'remember that backend memory lane should use worker tools',
      });

      const tick = await grillo.runTickWithOptions(
        {
          reason: 'manual_test',
          scopeKey,
        },
        {
          completion: async (request) => {
            requests.push(request);
            if (requests.length === 1) {
              return {
                meta: { model: 'openai/gpt-5-nano', provider: 'vercel-gateway' },
                text: JSON.stringify({
                  candidate: null,
                  diary: null,
                  done: false,
                  memory: null,
                  notes: 'writing grounded worker memories',
                  relationship: null,
                  toolCalls: [
                    {
                      args: {
                        confidence: 0.9,
                        content: 'Subsect wants backend GRILLO extraction to use the memory lane and worker tools.',
                        summary: 'Subsect wants backend memory-lane worker tools.',
                        tags: ['grillo', 'memory-lane'],
                        type: 'goal',
                      },
                      name: 'core.worker_candidate_write',
                    },
                    {
                      args: {
                        beat_type: 'extraction',
                        personal_thought: 'I should use the backend memory lane and real worker tools for GRILLO extraction.',
                        summary: 'Backend memory-lane extraction was requested.',
                        tags: ['grillo', 'reflection'],
                      },
                      name: 'core.worker_diary_write',
                    },
                  ],
                }),
              };
            }
            return JSON.stringify({
              candidate: null,
              diary: null,
              done: true,
              memory: null,
              notes: 'done',
              relationship: null,
              toolCalls: [],
            });
          },
          maxToolRounds: 15,
          model: 'openai/gpt-5-nano',
          provider: 'vercel-gateway',
        },
      );

      expect(tick).toMatchObject({
        noOpReason: '',
        ok: true,
        writes: 2,
      });
      expect(requests[0]).toMatchObject({
        maxToolRounds: 15,
        stateKey: 'memory:local:persona:hikari-chan',
        stateScope: 'memory',
        toolChoiceMode: 'auto',
      });
      expect(requests[0]?.messages[0]?.content).toContain('Available tools:');
      expect(requests[0]?.messages[1]?.content).toContain('source_turn_ids');

      const graph = await memory.getGraphSummary();
      expect(graph.recent.traces[0]).toMatchObject({
        model: 'openai/gpt-5-nano',
        provider: 'vercel-gateway',
        taskType: 'extraction',
      });
      expect(graph.recent.candidates[0]?.summary).toBe(
        'Subsect wants backend memory-lane worker tools.',
      );
      expect(graph.recent.diary[0]?.summary).toBe(
        'Backend memory-lane extraction was requested.',
      );
      expect(graph.recent.activities.filter((row) => row.beatType === 'worker_tool')).toHaveLength(
        2,
      );

      await expect(grillo.runTickWithOptions({ reason: 'manual_test', scopeKey })).resolves.toMatchObject({
        noOpReason: 'no_new_turn_pairs',
        writes: 0,
      });
    } finally {
      await memory.close();
    }
  });

  it('starts, stops, and guards backend worker ticks', async () => {
    const dbPath = join(tmpdir(), `webwaifu4-grillo-runtime-test-${process.pid}-${Date.now()}.db`);
    dbPaths.push(dbPath);
    const memory = new LadybugMemoryService(dbPath);
    let id = 0;
    let releaseTick: (() => void) | null = null;
    const grillo = new GrilloWorkerService(
      memory,
      () => 1770000000000,
      () => `runtime-id-${++id}`,
      async () => {
        await new Promise<void>((resolve) => {
          releaseTick = resolve;
        });
        return { noOpReason: 'test_tick_noop', writes: 0 };
      },
    );

    try {
      expect(grillo.start({ enabled: true, intervalMs: 5000 })).toMatchObject({
        enabled: true,
        intervalMs: 5000,
        started: true,
      });

      const firstTick = grillo.runTick({
        reason: 'manual_test',
        scopeKey: 'local:persona:hikari-chan',
      });
      const guardedTick = await grillo.runTick({
        reason: 'manual_test',
        scopeKey: 'local:persona:hikari-chan',
      });

      expect(guardedTick).toMatchObject({
        noOpReason: 'tick_already_running',
        running: true,
        writes: 0,
      });

      releaseTick?.();
      expect(await firstTick).toMatchObject({
        noOpReason: 'test_tick_noop',
        reason: 'manual_test',
        running: false,
        tickId: 'runtime-id-1',
        writes: 0,
      });

      const state = await memory.getGrilloSingleton<Record<string, unknown>>('memory_worker_state');
      expect(state).toMatchObject({
        lastNoOpReason: 'test_tick_noop',
        lastTickId: 'runtime-id-1',
        scopeKey: 'local:persona:hikari-chan',
      });
      const graph = await memory.getGraphSummary();
      expect(graph.recent.activities[0]).toMatchObject({
        beatType: 'worker_tick',
        responseText: 'GRILLO tick no-op: test_tick_noop',
      });
      expect(grillo.stop()).toMatchObject({
        enabled: false,
        lastNoOpReason: 'stopped',
        started: false,
      });
    } finally {
      grillo.stop();
      await memory.close();
    }
  });
});
