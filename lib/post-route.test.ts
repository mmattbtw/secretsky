import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  postOwnerDid,
  postPermalink,
  postRkey,
  postRouteId,
  postUriFromPath,
  postUriFromRouteId,
} from "./post-route";

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

test("post paths accept the raw secretsky AT URI", () => {
  assert.equal(postUriFromPath(uri), uri);
  assert.equal(
    postPermalink(uri),
    "/profile/did:plc:owner/post/3mexample",
  );
  assert.equal(postRkey(uri), "3mexample");
  assert.equal(
    postUriFromPath("at://did:plc:owner/app.bsky.feed.post/example"),
    null,
  );
});

test("post permalinks support did:web feed owners", () => {
  const webUri =
    "at://did:web:web.mmatt.net/space/at.secretsky.feed/self/did:web:web.mmatt.net/at.secretsky.post/3mwebexample";

  assert.equal(postUriFromPath(webUri), webUri);
  assert.equal(postOwnerDid(webUri), "did:web:web.mmatt.net");
  assert.equal(postRkey(webUri), "3mwebexample");
  assert.equal(
    postPermalink(webUri),
    "/profile/did:web:web.mmatt.net/post/3mwebexample",
  );
  assert.equal(postUriFromRouteId(postRouteId(webUri)), webUri);
});

test("post permalinks reject unsupported did:web paths", () => {
  const pathDidUri =
    "at://did:web:example.com:users:alice/space/at.secretsky.feed/self/did:web:example.com:users:alice/at.secretsky.post/3mwebexample";

  assert.equal(postUriFromPath(pathDidUri), null);
  assert.throws(() => postPermalink(pathDidUri), /Invalid secretsky post URI/);
});

test("post permalinks preserve encoded did:web ports", () => {
  const localhostUri =
    "at://did:web:localhost%3A3000/space/at.secretsky.feed/self/did:web:localhost%3A3000/at.secretsky.post/3mlocal";

  assert.equal(
    postPermalink(localhostUri),
    "/profile/did:web:localhost%253A3000/post/3mlocal",
  );
});
