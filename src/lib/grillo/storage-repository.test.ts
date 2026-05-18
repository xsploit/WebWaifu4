import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import type { MemorySlotPatchRecord, MemorySlotRecord } from "./storage-repository";
import { createStorageRepository } from "./storage-repository";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "grillo-storage-"));
  try {
    return fn(dir);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // SQLite file handles can linger briefly on Windows; cleanup is best-effort.
    }
  }
}

function makeSlot(userId: string, slotName: string): MemorySlotRecord {
  return {
    schema_version: "1.0.0",
    slot_id: `${userId}:${slotName}`,
    user_id: userId,
    slot_name: slotName,
    content_json: JSON.stringify(["alpha"]),
    source_candidate_ids_json: JSON.stringify(["c1"]),
    updated_at: new Date().toISOString(),
  };
}

function makePatch(slot: MemorySlotRecord): MemorySlotPatchRecord {
  return {
    schema_version: "1.0.0",
    patch_id: `${slot.slot_id}:p1`,
    slot_id: slot.slot_id,
    user_id: slot.user_id,
    slot_name: slot.slot_name,
    operation: "merge",
    patch_json: JSON.stringify({ add: ["beta"] }),
    source_candidate_ids_json: JSON.stringify(["c2"]),
    created_at: new Date().toISOString(),
  };
}

describe("StorageRepository", () => {
  it("jsonl backend supports append/read/replace/singleton/slots", () => {
    withTempDir((dataDir) => {
      const repo = createStorageRepository({ backend: "jsonl", dataDir });
      repo.append("memory_candidates", { candidate_id: "c1", text: "one" });
      repo.append("memory_candidates", { candidate_id: "c2", text: "two" });
      const rows = repo.readAll<Record<string, unknown>>("memory_candidates");
      assert.equal(rows.length, 2);

      repo.replaceAll("memory_candidates", [{ candidate_id: "c3", text: "three" }]);
      const replaced = repo.readAll<Record<string, unknown>>("memory_candidates");
      assert.equal(replaced.length, 1);
      assert.equal(replaced[0]?.["candidate_id"], "c3");

      repo.setSingleton("runtime_settings", { persona_id: "hikari_chan" });
      const singleton = repo.getSingleton<Record<string, unknown>>("runtime_settings");
      assert.equal(singleton?.["persona_id"], "hikari_chan");

      const slot = makeSlot("u1", "preferences");
      repo.upsertSlot(slot);
      const slots = repo.listSlots("u1");
      assert.equal(slots.length, 1);
      assert.equal(slots[0]?.slot_name, "preferences");

      const patch = makePatch(slot);
      repo.appendSlotPatch(patch);
      const patches = repo.listSlotPatches("u1");
      assert.equal(patches.length, 1);
      assert.equal(patches[0]?.slot_id, slot.slot_id);
      repo.close();
    });
  });

  it("sqlite backend supports append/read/replace/singleton/slots", () => {
    withTempDir((dataDir) => {
      let repo: ReturnType<typeof createStorageRepository>;
      try {
        repo = createStorageRepository({
          backend: "sqlite",
          dataDir,
          sqlitePath: join(dataDir, "grillo.db"),
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("SQLite backend unavailable")) {
          return;
        }
        throw error;
      }
      repo.append("memory_candidates", { candidate_id: "c1", text: "one" });
      repo.append("memory_candidates", { candidate_id: "c2", text: "two" });
      const rows = repo.readAll<Record<string, unknown>>("memory_candidates");
      assert.equal(rows.length, 2);

      repo.replaceAll("memory_candidates", [{ candidate_id: "c3", text: "three" }]);
      const replaced = repo.readAll<Record<string, unknown>>("memory_candidates");
      assert.equal(replaced.length, 1);
      assert.equal(replaced[0]?.["candidate_id"], "c3");

      repo.setSingleton("runtime_settings", { persona_id: "hikari_chan" });
      const singleton = repo.getSingleton<Record<string, unknown>>("runtime_settings");
      assert.equal(singleton?.["persona_id"], "hikari_chan");

      const slot = makeSlot("u1", "preferences");
      repo.upsertSlot(slot);
      const slots = repo.listSlots("u1");
      assert.equal(slots.length, 1);
      assert.equal(slots[0]?.slot_name, "preferences");

      const patch = makePatch(slot);
      repo.appendSlotPatch(patch);
      const patches = repo.listSlotPatches("u1");
      assert.equal(patches.length, 1);
      assert.equal(patches[0]?.slot_id, slot.slot_id);
      repo.close();
    });
  });
});
