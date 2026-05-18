import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { evaluatePromotion, type MemoryBlock, type PromotionCandidate } from "./memory-promotion";

describe("evaluatePromotion", () => {
  it("promotes grouped candidates and stays idempotent with promoted ids", () => {
    const candidates: PromotionCandidate[] = [
      {
        candidate_id: "c1",
        type: "preference",
        content: "likes black coffee",
        summary: "prefers black coffee",
        confidence: 0.92,
        user_id: "u1",
      },
      {
        candidate_id: "c2",
        type: "preference",
        content: "likes espresso",
        summary: "enjoys espresso shots",
        confidence: 0.9,
        user_id: "u1",
      },
    ];

    const first = evaluatePromotion(candidates, [], new Set());
    assert.equal(first.results.length, 1);
    assert.equal(first.results[0]?.block.user_id, "u1");
    assert.equal(first.results[0]?.block.block_name, "preferences");
    assert.equal(first.results[0]?.block.items.length, 2);
    assert.deepEqual(first.consumedCandidateIds.sort(), ["c1", "c2"]);

    const existingBlocks: MemoryBlock[] = [first.results[0].block];
    const second = evaluatePromotion(candidates, existingBlocks, new Set(first.consumedCandidateIds));
    assert.equal(second.results.length, 0);
    assert.equal(second.consumedCandidateIds.length, 0);
  });

  it("keeps promotions isolated per user", () => {
    const candidates: PromotionCandidate[] = [
      {
        candidate_id: "a1",
        type: "fact",
        content: "works nights",
        summary: "user works nights",
        confidence: 0.88,
        user_id: "alice",
      },
      {
        candidate_id: "a2",
        type: "fact",
        content: "prefers late shifts",
        summary: "likes late shifts",
        confidence: 0.82,
        user_id: "alice",
      },
      {
        candidate_id: "b1",
        type: "fact",
        content: "works mornings",
        summary: "user works mornings",
        confidence: 0.9,
        user_id: "bob",
      },
      {
        candidate_id: "b2",
        type: "fact",
        content: "takes coffee at 7am",
        summary: "coffee at 7am",
        confidence: 0.84,
        user_id: "bob",
      },
    ];

    const evaluated = evaluatePromotion(candidates, [], new Set());
    assert.equal(evaluated.results.length, 2);
    const users = evaluated.results.map((r) => r.block.user_id).sort();
    assert.deepEqual(users, ["alice", "bob"]);
  });
});
