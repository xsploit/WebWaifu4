// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildCoreTools, type ToolContext, toolInputSchemaToJsonSchema } from "./chat-tools";

function buildTestTools(overrides: Partial<ToolContext> = {}) {
  const baseContext: ToolContext = {
    userId: "user-1",
    channelId: "channel-1",
    turnId: "turn-1",
    memorySearch: async () => [],
    profileGet: async () => null,
    candidateWrite: async () => ({ candidate_id: "cand-1" }),
    diaryAppend: async () => ({ diary_id: "diary-1" }),
    profileSetCandidate: async () => ({ ok: true }),
  };
  return buildCoreTools({ ...baseContext, ...overrides });
}

describe("toolInputSchemaToJsonSchema", () => {
  it("emits a plain object schema for OpenAI function tools", () => {
    const tools = buildTestTools();
    const schema = toolInputSchemaToJsonSchema(tools["core.memory_search"].inputSchema);

    assert.equal(schema.type, "object");
    assert.equal(typeof schema.properties, "object");
    assert.equal(Array.isArray(schema.required), true);
    assert.equal((schema.properties as Record<string, unknown>).query instanceof Object, true);
    assert.equal("$schema" in schema, false);
  });

  it("preserves optional fields as optional in the emitted schema", () => {
    const tools = buildTestTools();
    const schema = toolInputSchemaToJsonSchema(tools["core.diary_append_candidate"].inputSchema);
    const required = Array.isArray(schema.required) ? schema.required.map(String) : [];

    assert.equal(required.includes("summary"), true);
    assert.equal(required.includes("personal_thought"), true);
    assert.equal(required.includes("content"), false);
    assert.equal(required.includes("interaction_summary"), false);
  });

  it("adds Tavily tools only when tavily handlers are provided", () => {
    const withoutTavily = buildTestTools();
    assert.equal("core.tavily_search" in withoutTavily, false);
    assert.equal("core.tavily_extract" in withoutTavily, false);
    assert.equal("core.tavily_crawl" in withoutTavily, false);

    const withTavily = buildTestTools({
      tavilySearch: async () => ({ ok: true }),
      tavilyExtract: async () => ({ ok: true }),
      tavilyCrawl: async () => ({ ok: true }),
    });
    assert.equal("core.tavily_search" in withTavily, true);
    assert.equal("core.tavily_extract" in withTavily, true);
    assert.equal("core.tavily_crawl" in withTavily, true);
  });

  it("adds Discord tools only when a discord dispatcher is provided", () => {
    const withoutDiscord = buildTestTools();
    assert.equal("core.discord_send_message" in withoutDiscord, false);
    assert.equal("core.discord_ban_member" in withoutDiscord, false);

    const withDiscord = buildTestTools({
      discordToolCall: async () => ({ ok: true }),
    });
    assert.equal("core.discord_send_message" in withDiscord, true);
    assert.equal("core.discord_ban_member" in withDiscord, true);
    assert.equal("core.discord_list_channels" in withDiscord, true);
  });
});
