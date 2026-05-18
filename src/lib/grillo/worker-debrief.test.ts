// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildWorkerDebriefPlan } from "./worker-debrief";

describe("buildWorkerDebriefPlan", () => {
  it("plans recovery for missing candidate/diary writes and failed tool calls", () => {
    const plan = buildWorkerDebriefPlan({
      parsedObject: {
        candidate: {
          type: "preference",
          content: "likes jasmine tea",
          summary: "User likes jasmine tea",
          confidence: 0.9,
          tags: ["tea"],
        },
        diary: {
          summary: "chat about tea",
          personal_thought: "Tea preferences are durable.",
          tags: ["tea", "preference"],
        },
      },
      sideEffects: {
        candidateIds: [],
        diaryIds: [],
        profileVersions: [],
        slotWrites: 0,
        archivalWrites: 0,
      },
      toolCalls: [
        {
          toolName: "core.worker_profile_patch",
          args: { field: "tone_preferences", operation: "add", value: "warm" },
          result: { ok: false, error: "conflict" },
        },
      ],
      maxRecoveryActions: 8,
    });

    const toolNames = plan.recoveryActions.map((action) => action.toolName);
    assert.equal(toolNames.includes("core.worker_candidate_write"), true);
    assert.equal(toolNames.includes("core.worker_diary_write"), true);
    assert.equal(toolNames.includes("core.worker_profile_patch"), true);
    assert.equal(plan.issues.some((issue) => issue.code === "missing_candidate_write"), true);
    assert.equal(plan.issues.some((issue) => issue.code === "missing_diary_write"), true);
    assert.equal(plan.issues.some((issue) => issue.code === "failed_tool_call"), true);
  });

  it("does not create missing-write recovery when writes already happened", () => {
    const plan = buildWorkerDebriefPlan({
      parsedObject: {
        candidate: {
          type: "fact",
          content: "has two dogs",
          summary: "User has two dogs",
          confidence: 0.8,
        },
        diary: {
          summary: "pet update",
          personal_thought: "Two dogs confirmed.",
          tags: ["pets"],
        },
      },
      sideEffects: {
        candidateIds: ["c1"],
        diaryIds: ["d1"],
        profileVersions: [],
        slotWrites: 0,
        archivalWrites: 0,
      },
      toolCalls: [],
    });

    assert.equal(plan.recoveryActions.length, 0);
    assert.equal(plan.issues.some((issue) => issue.code === "missing_candidate_write"), false);
    assert.equal(plan.issues.some((issue) => issue.code === "missing_diary_write"), false);
  });

  it("suppresses invalid recovery payloads and enforces max recovery cap", () => {
    const plan = buildWorkerDebriefPlan({
      parsedObject: {
        candidate: {
          type: "fact",
          content: "",
          summary: "",
        },
      },
      sideEffects: {
        candidateIds: [],
        diaryIds: [],
        profileVersions: [],
        slotWrites: 0,
        archivalWrites: 0,
      },
      toolCalls: [
        { toolName: "core.worker_profile_patch", args: { field: "boundaries", operation: "add", value: "none" }, result: { ok: false } },
        { toolName: "core.worker_memory_write", args: { block_name: "preferences", items: ["tea"], operation: "merge" }, result: { ok: false } },
        { toolName: "core.worker_memory_insert_archival", args: { text: "note" }, result: { ok: false } },
      ],
      maxRecoveryActions: 2,
    });

    assert.equal(plan.recoveryActions.length, 2);
    assert.equal(plan.suppressedCount >= 1, true);
    assert.equal(plan.issues.some((issue) => issue.code === "suppressed_recovery"), true);
  });
});
