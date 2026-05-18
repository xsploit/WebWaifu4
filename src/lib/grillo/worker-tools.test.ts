// @ts-nocheck
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import { buildWorkerTools } from "./worker-tools";
import { createStorageRepository, type StorageBackend } from "./storage-repository";

async function withTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "grillo-worker-tools-"));
  try {
    return await fn(dir);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup on Windows when sqlite handle lingers briefly
    }
  }
}

function seedSlot(repo: ReturnType<typeof createStorageRepository>, userId: string): void {
  repo.upsertSlot({
    schema_version: "1.0.0",
    slot_id: `${userId}:preferences`,
    user_id: userId,
    slot_name: "preferences",
    content_json: JSON.stringify(["likes tea"]),
    source_candidate_ids_json: JSON.stringify(["c1"]),
    updated_at: new Date().toISOString(),
  });
}

async function runReadWriteContract(backend: StorageBackend): Promise<void> {
  await withTempDir(async (dataDir) => {
    const repo = createStorageRepository({
      backend,
      dataDir,
      sqlitePath: join(dataDir, "grillo.db"),
    });
    const userId = "u_contract";
    seedSlot(repo, userId);
    repo.append("memory_candidates", {
      schema_version: "1.0.0",
      candidate_id: "cand-1",
      user_id: userId,
      channel_id: "c1",
      type: "preference",
      content: "likes tea",
      summary: "user likes tea",
      confidence: 0.9,
      evidence_turn_ids: ["t1"],
      origin_turn_id: "t1",
      source: "chat",
      created_at: new Date().toISOString(),
    });
    repo.append("memory_blocks", {
      schema_version: "1.0.0",
      block_id: "b1",
      block_name: "preferences",
      operation: "upsert",
      items: ["likes tea"],
      reason: "test",
      source_candidate_ids: ["cand-1"],
      user_id: userId,
      created_at: new Date().toISOString(),
    });

    const tools = buildWorkerTools({
      userId,
      storage: repo,
      searchFallback: async () => [{ id: "f1", text: "likes tea", score: 1 }],
    });

    const readResult = (await tools["core.worker_memory_read"]?.execute({})) as Record<string, unknown>;
    assert.ok(Array.isArray(readResult?.slots));
    assert.ok(Array.isArray(readResult?.memory_blocks));

    const writeResult = (await tools["core.worker_memory_write"]?.execute({
      block_name: "preferences",
      items: ["likes anime"],
      operation: "merge",
      source_candidate_ids: ["cand-2"],
    })) as Record<string, unknown>;
    assert.equal(writeResult?.block_name, "preferences");

    const updatedSlot = repo.listSlots(userId).find((row) => row.slot_name === "preferences");
    assert.ok(updatedSlot);
    const parsedItems = JSON.parse(String(updatedSlot?.content_json || "[]"));
    assert.ok(Array.isArray(parsedItems));
    assert.ok(parsedItems.includes("likes tea"));
    assert.ok(parsedItems.includes("likes anime"));

    const patches = repo.listSlotPatches(userId);
    assert.ok(patches.length >= 1);

    const searchResult = (await tools["core.worker_memory_search"]?.execute({
      query: "tea",
      limit: 3,
    })) as Record<string, unknown>;
    assert.ok(Array.isArray(searchResult?.results));

    const roTools = buildWorkerTools(
      {
        userId,
        storage: repo,
      },
      { includeWriteTools: false },
    );
    assert.equal(typeof roTools["core.worker_memory_read"], "object");
    assert.equal(roTools["core.worker_memory_write"], undefined);

    repo.close();
  });
}

describe("worker-tools", () => {
  it("supports read/write/search contract on jsonl backend", async () => {
    await runReadWriteContract("jsonl");
  });

  it("supports read/write/search contract on sqlite backend", async () => {
    try {
      await runReadWriteContract("sqlite");
    } catch (error) {
      if (error instanceof Error && error.message.includes("SQLite backend unavailable")) {
        return;
      }
      throw error;
    }
  });

  it("uses write handlers when provided", async () => {
    await withTempDir(async (dataDir) => {
      const repo = createStorageRepository({
        backend: "jsonl",
        dataDir,
      });
      const writes = {
        diary: 0,
        candidate: 0,
        profile: 0,
        block: 0,
        archival: 0,
      };
      const tools = buildWorkerTools({
        userId: "u1",
        storage: repo,
        onDiaryWrite: async () => {
          writes.diary += 1;
          return { diary_id: "d1" };
        },
        onCandidateWrite: async () => {
          writes.candidate += 1;
          return { candidate_id: "c1" };
        },
        onProfilePatch: async () => {
          writes.profile += 1;
          return { ok: true };
        },
        onMemoryBlockWrite: async () => {
          writes.block += 1;
          return { block_id: "b1" };
        },
        onMemoryInsertArchival: async () => {
          writes.archival += 1;
          return { id: "a1", ok: true };
        },
      });

      await tools["core.worker_diary_write"]?.execute({
        summary: "s",
        personal_thought: "t",
        tags: ["x"],
      });
      await tools["core.worker_candidate_write"]?.execute({
        type: "fact",
        content: "c",
        summary: "s",
        confidence: 0.9,
      });
      await tools["core.worker_profile_patch"]?.execute({
        field: "tone_preferences",
        operation: "add",
        value: "warm",
      });
      await tools["core.worker_memory_write"]?.execute({
        block_name: "preferences",
        items: ["a"],
        operation: "replace",
      });
      await tools["core.worker_memory_insert_archival"]?.execute({
        text: "archive this",
        metadata: { source: "test" },
      });

      assert.equal(writes.diary, 1);
      assert.equal(writes.candidate, 1);
      assert.equal(writes.profile, 1);
      assert.equal(writes.block, 1);
      assert.equal(writes.archival, 1);
      repo.close();
    });
  });
});
