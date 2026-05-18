import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReflectionContext } from "./reflection-context";
import { createStorageRepository } from "./storage-repository";

async function withTempRepo<T>(fn: (repo: ReturnType<typeof createStorageRepository>) => Promise<T>): Promise<T> {
  const dataDir = mkdtempSync(join(tmpdir(), "grillo-reflection-context-"));
  const repo = createStorageRepository({ backend: "jsonl", dataDir });
  try {
    return await fn(repo);
  } finally {
    repo.close();
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}

describe("buildReflectionContext", () => {
  it("injects slots, latest profile, diary, and bounded new messages", async () => {
    await withTempRepo(async (repo) => {
      const userId = "u1";
      repo.upsertSlot({
        schema_version: "1.0.0",
        slot_id: `${userId}:preferences`,
        user_id: userId,
        slot_name: "preferences",
        content_json: JSON.stringify(["likes tea", "likes anime"]),
        source_candidate_ids_json: JSON.stringify(["c1"]),
        updated_at: new Date().toISOString(),
      });
      repo.append("relationship_profiles", {
        schema_version: "1.0.0",
        profile_version: 2,
        user_id: userId,
        tone_preferences: ["playful"],
        interaction_style: ["direct"],
        boundaries: ["avoid spam"],
        active_threads: ["pets"],
        updated_from_candidates: ["c1"],
        created_at: new Date().toISOString(),
      });
      repo.append("diary_entries", {
        schema_version: "1.0.0",
        diary_id: "d1",
        beat_type: "self_reflection",
        summary: "chat felt warm",
        personal_thought: "keep tone playful",
        tags: ["relationship"],
        user_id: userId,
        origin_turn_id: "t1",
        created_at: new Date().toISOString(),
      });

      const ctx = buildReflectionContext({
        userId,
        storage: repo,
        beatType: "relationship",
        maxSlotChars: 300,
        maxProfileChars: 250,
        maxDiaryChars: 250,
        maxMessageChars: 220,
        maxSemanticRecallChars: 220,
        semanticRecall: [
          {
            id: "m1",
            text: "user mentioned Jelly Bean and Miss Kitty often",
            score: 0.87,
            source: "embedding",
          },
        ],
        newMessages: [
          {
            role: "user",
            author: "Tester",
            timestamp: new Date().toISOString(),
            content: "hello hello hello hello hello hello hello hello hello hello hello",
          },
        ],
      });

      expect(ctx.systemPrompt).toMatch(/Current memory slots:/);
      expect(ctx.systemPrompt).toMatch(/\[preferences\]/);
      expect(ctx.systemPrompt).toMatch(/Latest relationship profile:/);
      expect(ctx.systemPrompt).toMatch(/tone_preferences:/);
      expect(ctx.systemPrompt).toMatch(/Recent diary context:/);
      expect(ctx.systemPrompt).toMatch(/Semantic recall:/);
      expect(ctx.systemPrompt).toMatch(/Jelly Bean/);
      expect(ctx.userPrompt).toMatch(/New messages to process:/);
      expect(ctx.userPrompt.length > 40).toBeTruthy();
    });
  });
});
