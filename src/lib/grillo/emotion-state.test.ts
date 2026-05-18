import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import { applyEmotionSignal, readEmotionState } from "./emotion-state";
import { createStorageRepository, type StorageBackend } from "./storage-repository";

async function withTempRepo<T>(
  backend: StorageBackend,
  fn: (repo: ReturnType<typeof createStorageRepository>) => Promise<T> | T,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "grillo-emotion-state-"));
  let repo: ReturnType<typeof createStorageRepository> | null = null;
  try {
    repo = createStorageRepository({
      backend,
      dataDir: dir,
      sqlitePath: join(dir, "grillo.db"),
    });
    return await fn(repo);
  } finally {
    repo?.close();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort on Windows if sqlite handle lingers briefly
    }
  }
}

async function runEmotionContract(backend: StorageBackend): Promise<void> {
  await withTempRepo(backend, async (repo) => {
    const userId = "emotion_user";
    const t0 = "2026-02-18T00:00:00.000Z";

    const first = applyEmotionSignal({
      storage: repo,
      userId,
      signal: { name: "joy", intensity: 10, confidence: 1 },
      source: "test",
      nowIso: t0,
    });
    assert.ok(first.intensities.happy > 0);
    assert.equal(first.last_signal_source, "test");

    const oneHourLater = readEmotionState(repo, userId, "2026-02-18T01:00:00.000Z", 3600, 0.01);
    assert.ok(oneHourLater.intensities.happy < first.intensities.happy);
    assert.ok(oneHourLater.intensities.happy > 0);

    const beforeRelaxed = oneHourLater.intensities.angry;
    const relaxed = applyEmotionSignal({
      storage: repo,
      userId,
      signal: { name: "calm", intensity: 8, confidence: 1 },
      source: "test_relaxed",
      nowIso: "2026-02-18T01:00:10.000Z",
    });
    assert.ok(relaxed.intensities.relaxed > 0);
    assert.ok(relaxed.intensities.angry <= beforeRelaxed);
  });
}

describe("emotion-state", () => {
  it("supports apply+decay contract on jsonl backend", async () => {
    await runEmotionContract("jsonl");
  });

  it("supports apply+decay contract on sqlite backend", async () => {
    try {
      await runEmotionContract("sqlite");
    } catch (error) {
      if (error instanceof Error && error.message.includes("SQLite backend unavailable")) {
        return;
      }
      throw error;
    }
  });
});

