import assert from "node:assert/strict";
import { test } from "bun:test";
import { paginateFeedThreads } from "./feed-pagination";

test("a new nested reply bumps its root thread to the top", () => {
  const first = root("first", "2026-01-01T10:00:00.000Z");
  const second = root("second", "2026-01-01T12:00:00.000Z");
  const reply = child("reply", first.uri, "2026-01-01T11:00:00.000Z");
  const nested = child("nested", reply.uri, "2026-01-01T13:00:00.000Z");

  const page = paginateFeedThreads([first, second, reply, nested]);

  assert.deepEqual(
    page.posts.filter(({ replyParentUri }) => !replyParentUri).map(({ uri }) => uri),
    [first.uri, second.uri],
  );
  assert.equal(page.posts[0]?.threadActivityAt, nested.createdAt);
});

test("home previews two direct replies and counts the full thread", () => {
  const post = root("post", "2026-01-01T10:00:00.000Z");
  const one = child("one", post.uri, "2026-01-01T11:00:00.000Z");
  const two = child("two", post.uri, "2026-01-01T12:00:00.000Z");
  const three = child("three", post.uri, "2026-01-01T13:00:00.000Z");
  const nested = child("nested", one.uri, "2026-01-01T14:00:00.000Z");

  const page = paginateFeedThreads([post, one, two, three, nested]);

  assert.equal(page.posts[0]?.threadReplyCount, 4);
  assert.deepEqual(page.posts.slice(1).map(({ uri }) => uri), [three.uri, two.uri]);
});

test("cursor pagination returns each root thread once", () => {
  const posts = [
    root("one", "2026-01-01T13:00:00.000Z"),
    root("two", "2026-01-01T12:00:00.000Z"),
    root("three", "2026-01-01T11:00:00.000Z"),
  ];

  const first = paginateFeedThreads(posts, null, 2);
  const second = paginateFeedThreads(posts, first.nextCursor, 2);

  assert.ok(first.nextCursor);
  assert.deepEqual(first.posts.map(({ uri }) => uri), [posts[0].uri, posts[1].uri]);
  assert.deepEqual(second.posts.map(({ uri }) => uri), [posts[2].uri]);
  assert.equal(second.nextCursor, null);
});

type TestPost = {
  uri: string;
  feedOwnerDid: string;
  authorDid: string;
  replyParentUri: string | null;
  createdAt: string;
};

function root(key: string, createdAt: string): TestPost {
  return {
    uri: `at://did:plc:owner/space/at.secretsky.feed/self/did:plc:owner/at.secretsky.post/${key}`,
    feedOwnerDid: "did:plc:owner",
    authorDid: "did:plc:owner",
    replyParentUri: null,
    createdAt,
  };
}

function child(key: string, replyParentUri: string, createdAt: string): TestPost {
  return {
    uri: `at://did:plc:owner/space/at.secretsky.feed/self/did:plc:reply/at.secretsky.post/${key}`,
    feedOwnerDid: "did:plc:owner",
    authorDid: "did:plc:reply",
    replyParentUri,
    createdAt,
  };
}
