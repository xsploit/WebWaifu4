import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { DEFAULT_SECTION_BUDGETS, reduceContextBudget, type ContextSections } from "./context-budget";

function buildSections(): ContextSections {
  return {
    background_information: ["interface: discord", "character_id: hikari_chan"],
    instructions: ["stay in character", "no repetition"],
    channel_history: [
      "u: hello there this is a long-ish message",
      "a: hi there",
      "u: can we continue talking about dinner plans",
      "a: yes, let's continue",
    ],
    relationship_memory: [
      "user likes calm responses",
      "user dislikes being ignored",
    ],
    recalled_memories: [
      { text: "low score memory", score: 0.1 },
      { text: "high score memory", score: 0.9 },
      { text: "mid score memory", score: 0.3 },
    ],
    thoughts: ["thought 1", "thought 2"],
    output_description: ["mode: discord_reply", "tone: natural"],
  };
}

describe("reduceContextBudget", () => {
  it("drops lower-score recalled memories before higher-score memories", () => {
    const sections = buildSections();
    const result = reduceContextBudget(sections, undefined, 80);
    const recalled = result.sections.recalled_memories.map((m) => m.text);
    assert.equal(recalled.includes("high score memory"), true);
  });

  it("falls back deterministically when still over budget", () => {
    const sections = buildSections();
    const result = reduceContextBudget(sections, undefined, 20);
    assert.equal(result.usedFallback, true);
    assert.equal(result.sections.channel_history.length <= 2, true);
    assert.equal(result.sections.relationship_memory.length <= 1, true);
    assert.equal(result.sections.recalled_memories.length, 0);
    assert.equal(result.sections.thoughts.length, 0);
  });

  it("enforces section budgets before the global budget", () => {
    const sections = buildSections();
    sections.channel_history = [
      `old: ${"x".repeat(120)}`,
      `middle: ${"y".repeat(120)}`,
      "latest: keep this",
    ];

    const result = reduceContextBudget(
      sections,
      {
        ...DEFAULT_SECTION_BUDGETS,
        channel_history: 8,
      },
      10_000,
    );

    assert.deepEqual(result.sections.channel_history, ["latest: keep this"]);
    assert.equal(result.usedFallback, false);
    assert.equal(
      result.reductions.some((row) => row.step === "section_budget" && row.section === "channel_history"),
      true,
    );
  });
});
