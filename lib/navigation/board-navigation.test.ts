import assert from "node:assert/strict";
import { test } from "bun:test";
import { resolveNavigationHandle } from "../board-navigation";

test("resolves navigation before a board has been materialized locally", async () => {
  const calls: string[] = [];
  const handle = await resolveNavigationHandle("alice.test", {
    async resolveIdentifier(identifier) {
      calls.push(`resolve:${identifier}`);
      return "did:plc:alice";
    },
    async cacheIdentity(did) {
      calls.push(`cache:${did}`);
    },
    async getAccount(did) {
      calls.push(`account:${did}`);
      return { handle: "alice.test" };
    },
  });

  assert.equal(handle, "alice.test");
  assert.deepEqual(calls, [
    "resolve:alice.test",
    "cache:did:plc:alice",
    "account:did:plc:alice",
  ]);
});
