import assert from "node:assert/strict";
import { test } from "bun:test";
import { discoverBoard } from "./client";

test("Space discovery distinguishes missing Spaces from sync failures", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json({ error: "Space not found" }, { status: 404 });
    assert.equal(
      await discoverBoard("at://did:plc:test/space/example/self"),
      false,
    );

    globalThis.fetch = async () => new Response(null, { status: 404 });
    await assert.rejects(
      discoverBoard("at://did:plc:test/space/example/self"),
      /Space sync failed \(404\)/,
    );

    globalThis.fetch = async () => new Response(null, { status: 200 });
    assert.equal(
      await discoverBoard("at://did:plc:test/space/example/self"),
      true,
    );

    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(
      discoverBoard("at://did:plc:test/space/example/self"),
      /Space sync failed \(503\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
