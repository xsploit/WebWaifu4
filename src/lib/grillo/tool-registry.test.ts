import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { z } from "zod";
import { buildToolSet } from "./tool-registry";
import type { ToolDefinition } from "./chat-tools";

function mockTool(): ToolDefinition {
  return {
    description: "mock tool",
    inputSchema: z.object({}).passthrough(),
    timeoutMs: 1000,
    execute: async () => ({ ok: true }),
  };
}

describe("buildToolSet", () => {
  it("merges namespaced tools and enforces allowlist", () => {
    const tools = buildToolSet(
      {
        core: {
          "core.memory_search": mockTool(),
        },
        plugin: {
          "plugin.weather.lookup": mockTool(),
        },
      },
      [{ namespace: "core", pattern: "core.*" }],
    );

    assert.equal(Object.keys(tools).includes("core.memory_search"), true);
    assert.equal(Object.keys(tools).includes("plugin.weather.lookup"), false);
  });

  it("rejects non-namespaced ids", () => {
    const tools = buildToolSet({
      core: {
        "memory_search": mockTool(),
        "core.profile_get": mockTool(),
      },
    });

    assert.deepEqual(Object.keys(tools), ["core.profile_get"]);
  });
});
