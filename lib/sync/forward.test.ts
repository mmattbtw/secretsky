import assert from "node:assert/strict";
import { test } from "bun:test";
import { forwardHealthToSync } from "./forward";

test("health forwarding reports an unavailable sync service without throwing", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError("Connection refused");
    };

    const response = await forwardHealthToSync(
      new Request("https://secretsky.at/sync/health"),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("health forwarding preserves a healthy sync response", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ ok: true });

    const response = await forwardHealthToSync(
      new Request("https://secretsky.at/sync/health"),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
