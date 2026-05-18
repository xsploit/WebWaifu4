import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import type { Envelope } from "./envelope";
import { createEnvelopeTransport, type EnvelopeTransport } from "./envelope-transport";

function envelope(messageType: Envelope["message_type"], turn: string = randomUUID()): Envelope {
  return {
    schema_version: "1.0.0",
    message_type: messageType,
    trace_id: randomUUID(),
    turn_id: turn,
    user_id: "user-test",
    channel_id: "channel-test",
    created_at: new Date().toISOString(),
    payload: { ok: true },
  };
}

async function runContract(transport: EnvelopeTransport): Promise<void> {
  const e1 = envelope("turn.ingest.request", "t1");
  const e2 = envelope("memory.extract.request", "t2");
  await transport.publish(e1);
  await transport.publish(e2);

  const first = await transport.consume("0");
  assert.equal(first.envelopes.length >= 2, true);
  assert.equal(first.envelopes[first.envelopes.length - 1]?.turn_id, "t2");
  const seen = new Set(first.envelopes.map((env) => env.turn_id));
  assert.equal(seen.has("t1"), true);
  assert.equal(seen.has("t2"), true);

  const second = await transport.consume(first.nextOffset);
  assert.equal(second.envelopes.length, 0);

  const filtered = await transport.consume("0", ["memory.extract.request"]);
  assert.equal(filtered.envelopes.length >= 1, true);
  assert.equal(filtered.envelopes.every((env) => env.message_type === "memory.extract.request"), true);
}

describe("EnvelopeTransport contract", () => {
  it("jsonl returns empty consume on new file", async () => {
    const filePath = join(tmpdir(), `grillo-transport-empty-${randomUUID()}.jsonl`);
    const metaPath = `${filePath}.meta.json`;
    const transport = await createEnvelopeTransport({
      type: "jsonl",
      filePath,
    });
    try {
      const first = await transport.consume("0");
      assert.equal(first.envelopes.length, 0);
      assert.equal(first.nextOffset, "0");
    } finally {
      await transport.close();
      rmSync(filePath, { force: true });
      rmSync(metaPath, { force: true });
    }
  });

  it("jsonl validator can reject payloads", async () => {
    const filePath = join(tmpdir(), `grillo-transport-validate-${randomUUID()}.jsonl`);
    const metaPath = `${filePath}.meta.json`;
    const transport = await createEnvelopeTransport({
      type: "jsonl",
      filePath,
      validator: (value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        return (value as Envelope).message_type !== "chat.generate.result";
      },
    });
    try {
      await transport.publish(envelope("chat.generate.result", "reject-me"));
      await transport.publish(envelope("memory.extract.request", "keep-me"));
      const out = await transport.consume("0");
      const turns = out.envelopes.map((env) => env.turn_id);
      assert.deepEqual(turns, ["keep-me"]);
    } finally {
      await transport.close();
      rmSync(filePath, { force: true });
      rmSync(metaPath, { force: true });
    }
  });

  it("jsonl satisfies contract", async () => {
    const filePath = join(tmpdir(), `grillo-transport-${randomUUID()}.jsonl`);
    const metaPath = `${filePath}.meta.json`;
    const transport = await createEnvelopeTransport({
      type: "jsonl",
      filePath,
    });
    try {
      await runContract(transport);
    } finally {
      await transport.close();
      rmSync(filePath, { force: true });
      rmSync(metaPath, { force: true });
    }
  });

  it("jsonl compaction preserves absolute offsets", async () => {
    const filePath = join(tmpdir(), `grillo-transport-compaction-${randomUUID()}.jsonl`);
    const metaPath = `${filePath}.meta.json`;
    const transport = await createEnvelopeTransport({
      type: "jsonl",
      filePath,
      maxLines: 5,
      retainLines: 2,
    });
    try {
      for (let i = 0; i < 7; i += 1) {
        await transport.publish(envelope("memory.extract.request", `t${i}`));
      }

      const full = await transport.consume("0");
      assert.equal(full.nextOffset, "7");

      // Trigger compaction from caught-up offset. Offset should remain absolute.
      const compacted = await transport.consume(full.nextOffset);
      assert.equal(compacted.envelopes.length, 0);
      assert.equal(compacted.nextOffset, "7");

      await transport.publish(envelope("memory.extract.request", "t7"));
      const next = await transport.consume(compacted.nextOffset);
      assert.equal(next.envelopes.length, 1);
      assert.equal(next.envelopes[0]?.turn_id, "t7");
      assert.equal(next.nextOffset, "8");
    } finally {
      await transport.close();
      rmSync(filePath, { force: true });
      rmSync(metaPath, { force: true });
    }
  });

  it("redis satisfies contract when REDIS_URL is configured", async () => {
    const redisUrl = process.env["REDIS_URL"] || "";
    if (!redisUrl.trim().length) return;
    const streamKey = `grillo:test:${randomUUID()}`;
    const transport = await createEnvelopeTransport({
      type: "redis",
      url: redisUrl,
      streamKey,
    });
    try {
      await runContract(transport);
    } finally {
      await transport.close();
    }
  });
});
