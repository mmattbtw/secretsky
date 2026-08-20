import assert from "node:assert/strict";
import { test } from "bun:test";
import { postOwnerDid, postRouteId, postUriFromRouteId } from "./post-route";

const uri =
  "at://did:plc:owner/space/at.secretsky.feed/self/did:plc:author/at.secretsky.post/3mexample";

test("post route ids round-trip full secretsky AT URIs", () => {
  const id = postRouteId(uri);
  assert.match(id, /^[A-Za-z0-9_-]+$/);
  assert.equal(postUriFromRouteId(id), uri);
  assert.equal(postOwnerDid(uri), "did:plc:owner");
});

test("post route ids reject malformed and non-secretsky records", () => {
  assert.equal(postUriFromRouteId("not+base64"), null);
  assert.throws(
    () => postRouteId("at://did:plc:owner/app.bsky.feed.post/example"),
    /Invalid secretsky post URI/,
  );
});
