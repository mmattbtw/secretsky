import assert from "node:assert/strict";
import { test } from "bun:test";
import { didPathSegment, isSupportedAtprotoDid } from "./did";

test("ATProto supports authority-style did:web identifiers", () => {
  assert.equal(isSupportedAtprotoDid("did:web:web.mmatt.net"), true);
  assert.equal(isSupportedAtprotoDid("did:web:localhost%3A3000"), true);
  assert.equal(
    isSupportedAtprotoDid("did:web:example.com:users:alice"),
    false,
  );
  assert.equal(isSupportedAtprotoDid("did:key:example"), false);
});

test("DID path segments preserve percent-encoded ports", () => {
  const did = "did:web:localhost%3A3000";
  const segment = didPathSegment(did);
  assert.equal(segment, "did:web:localhost%253A3000");
  assert.equal(decodeURIComponent(segment), did);
});
