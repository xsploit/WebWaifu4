import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import type { MemoryBlock } from "./memory-promotion";
import { createStorageRepository } from "./storage-repository";
import { applyPromotedBlockToSlots } from "./slot-manager";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "grillo-slot-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function parseJsonArray(raw: string): string[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((x) => String(x || "").trim()).filter(Boolean);
}

describe("applyPromotedBlockToSlots", () => {
  it("merges promoted block items into the same slot and records patch history", () => {
    withTempDir((dataDir) => {
      const repo = createStorageRepository({ backend: "jsonl", dataDir });
      const blockA: MemoryBlock = {
        schema_version: "1.0.0",
        block_id: "u1:preferences:v1",
        user_id: "u1",
        block_name: "preferences",
        operation: "upsert",
        items: ["likes tea", "likes tea"],
        reason: "seed",
        source_candidate_ids: ["c1", "c2"],
        created_at: new Date().toISOString(),
      };
      const blockB: MemoryBlock = {
        schema_version: "1.0.0",
        block_id: "u1:preferences:v2",
        user_id: "u1",
        block_name: "preferences",
        operation: "upsert",
        items: ["likes tea", "likes coffee"],
        reason: "expand",
        source_candidate_ids: ["c3"],
        created_at: new Date().toISOString(),
      };

      applyPromotedBlockToSlots(repo, blockA);
      applyPromotedBlockToSlots(repo, blockB);

      const slots = repo.listSlots("u1");
      assert.equal(slots.length, 1);
      assert.equal(slots[0]?.slot_name, "preferences");
      const content = parseJsonArray(slots[0]?.content_json || "[]");
      assert.deepEqual(content, ["likes tea", "likes coffee"]);

      const patches = repo.listSlotPatches("u1");
      assert.equal(patches.length, 2);
      assert.equal(patches.every((patch) => patch.operation === "merge"), true);
      repo.close();
    });
  });

  it("maps ongoing_topics blocks to ongoing_threads slot", () => {
    withTempDir((dataDir) => {
      const repo = createStorageRepository({ backend: "jsonl", dataDir });
      const block: MemoryBlock = {
        schema_version: "1.0.0",
        block_id: "u2:ongoing_topics:v1",
        user_id: "u2",
        block_name: "ongoing_topics",
        operation: "upsert",
        items: ["watching hells paradise"],
        reason: "thread",
        source_candidate_ids: ["t1"],
        created_at: new Date().toISOString(),
      };
      const slot = applyPromotedBlockToSlots(repo, block);
      assert.equal(slot.slot_name, "ongoing_threads");
      repo.close();
    });
  });
});
