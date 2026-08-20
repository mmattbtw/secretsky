import assert from "node:assert/strict";
import { test } from "bun:test";
import { orderCredentialCandidates } from "./credential-candidates";

test("prefers the authority's session", () => {
  assert.deepEqual(
    orderCredentialCandidates(
      "did:plc:owner",
      ["did:plc:follower", "did:plc:owner"],
      new Set(["did:plc:follower"]),
    ),
    ["did:plc:owner", "did:plc:follower"],
  );
});

test("only includes sessions that can read the space", () => {
  assert.deepEqual(
    orderCredentialCandidates(
      "did:plc:owner",
      ["did:plc:reader", "did:plc:stranger"],
      new Set(["did:plc:reader"]),
    ),
    ["did:plc:reader"],
  );
});

test("deduplicates stored sessions", () => {
  assert.deepEqual(
    orderCredentialCandidates(
      "did:plc:owner",
      ["did:plc:reader", "did:plc:reader"],
      new Set(["did:plc:reader"]),
    ),
    ["did:plc:reader"],
  );
});
