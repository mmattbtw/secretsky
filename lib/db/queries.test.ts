import assert from "node:assert/strict";
import { test } from "bun:test";

process.env.DATABASE_PATH = ":memory:";

const { migrate } = await import("./migrations");
const {
  deleteSyncedReposExcept,
  getAccount,
  getPost,
  getSyncedRepo,
  hasBoard,
  hasSpaceWatch,
  hideSyncedSpace,
  listBoardPosts,
  listFeedPosts,
  listBoards,
  listReactionNotifications,
  listReplyNotifications,
  replaceRepoRecords,
  saveAccount,
  saveBoard,
  saveSpaceWatch,
  saveSyncedRepo,
  upsertRemoval,
  upsertReaction,
  upsertPosition,
  upsertPost,
} = await import("./queries");

await migrate();

test("account and board queries return typed application rows", async () => {
  await saveAccount({
    did: "did:plc:owner",
    handle: "owner.test",
    pdsUrl: "https://pds.test",
  });
  await saveAccount({ did: "did:plc:owner" });
  await saveBoard("at://did:plc:owner/space/example.board/self", "did:plc:owner");

  assert.deepEqual(await getAccount("did:plc:owner"), {
    did: "did:plc:owner",
    handle: "owner.test",
    pdsUrl: "https://pds.test",
  });
  assert.equal(await hasBoard("did:plc:owner"), true);
  assert.deepEqual(await listBoards(), [
    { ownerDid: "did:plc:owner", handle: "owner.test" },
  ]);
});

test("feed reactions retain emoji and group their counts", async () => {
  const spaceUri = "at://did:plc:emoji/space/at.secretsky.feed/self";
  const postUri = `${spaceUri}/did:plc:emoji/at.secretsky.post/one`;
  const createdAt = new Date().toISOString();
  await upsertPost({
    uri: postUri,
    cid: "emoji-post-cid",
    spaceUri,
    authorDid: "did:plc:emoji",
    text: "pick a reaction",
    createdAt,
  });
  await upsertReaction({
    uri: `${spaceUri}/did:plc:viewer/at.secretsky.reaction/one`,
    cid: "heart-cid",
    spaceUri,
    authorDid: "did:plc:viewer",
    subjectUri: postUri,
    subjectCid: "emoji-post-cid",
    emoji: "❤️",
    createdAt,
  });
  for (const actor of ["one", "two"]) {
    await upsertReaction({
      uri: `${spaceUri}/did:plc:${actor}/at.secretsky.reaction/one`,
      cid: `star-${actor}-cid`,
      spaceUri,
      authorDid: `did:plc:${actor}`,
      subjectUri: postUri,
      subjectCid: "emoji-post-cid",
      emoji: "⭐",
      createdAt,
    });
  }

  const [post] = await listFeedPosts(
    spaceUri,
    "did:plc:emoji",
    "did:plc:viewer",
  );
  assert.equal(post.reactionCount, 3);
  assert.equal(post.viewerReactionEmoji, "❤️");
  assert.equal(
    post.viewerReactionUri,
    `${spaceUri}/did:plc:viewer/at.secretsky.reaction/one`,
  );
  assert.deepEqual(post.reactionEmojiCounts, [
    {
      emoji: "⭐",
      count: 2,
      actors: [
        { did: "did:plc:one", handle: null },
        { did: "did:plc:two", handle: null },
      ],
    },
    {
      emoji: "❤️",
      count: 1,
      actors: [{ did: "did:plc:viewer", handle: null }],
    },
  ]);
});

test("repository replay keeps the latest reaction per actor and post", async () => {
  const ownerDid = "did:plc:replay-owner";
  const actorDid = "did:plc:replay-actor";
  const spaceUri = `at://${ownerDid}/space/at.secretsky.feed/self`;
  const postUri = `${spaceUri}/${ownerDid}/at.secretsky.post/one`;
  await upsertPost({
    uri: postUri,
    cid: "replay-post-cid",
    spaceUri,
    authorDid: ownerDid,
    text: "replayed reactions",
    createdAt: "2026-08-20T10:00:00.000Z",
  });

  await replaceRepoRecords({
    spaceUri,
    authorDid: actorDid,
    posts: [],
    removals: [],
    positions: [],
    reactions: [
      {
        uri: `${spaceUri}/${actorDid}/at.secretsky.reaction/old`,
        cid: "old-reaction-cid",
        subjectUri: postUri,
        subjectCid: "replay-post-cid",
        emoji: "⭐",
        createdAt: "2026-08-20T10:01:00.000Z",
      },
      {
        uri: `${spaceUri}/${actorDid}/at.secretsky.reaction/new`,
        cid: "new-reaction-cid",
        subjectUri: postUri,
        subjectCid: "replay-post-cid",
        emoji: "❤️",
        createdAt: "2026-08-20T10:02:00.000Z",
      },
    ],
  });

  const [post] = await listFeedPosts(spaceUri, ownerDid, actorDid);
  assert.equal(post.reactionCount, 1);
  assert.equal(post.viewerReactionEmoji, "❤️");
  assert.equal(
    post.viewerReactionUri,
    `${spaceUri}/${actorDid}/at.secretsky.reaction/new`,
  );
});

test("reply and reaction notifications target the post author", async () => {
  const viewerDid = "did:plc:notification-viewer";
  const authorDid = "did:plc:notification-author";
  const spaceUri = `at://${viewerDid}/space/at.secretsky.feed/self`;
  const parentUri = `${spaceUri}/${viewerDid}/at.secretsky.post/parent`;
  const replyUri = `${spaceUri}/${authorDid}/at.secretsky.post/reply`;
  const createdAt = "2026-08-20T12:00:00.000Z";
  await saveAccount({ did: authorDid, handle: "author.example" });
  await saveBoard(spaceUri, viewerDid);
  await upsertPost({
    uri: parentUri,
    cid: "parent-cid",
    spaceUri,
    authorDid: viewerDid,
    text: "original post",
    createdAt,
  });
  await upsertPost({
    uri: replyUri,
    cid: "reply-cid",
    spaceUri,
    authorDid,
    text: "a reply",
    replyParentUri: parentUri,
    replyParentCid: "parent-cid",
    createdAt,
  });
  await upsertReaction({
    uri: `${spaceUri}/${authorDid}/at.secretsky.reaction/one`,
    cid: "reaction-cid",
    spaceUri,
    authorDid,
    subjectUri: parentUri,
    subjectCid: "parent-cid",
    emoji: "⭐",
    createdAt,
  });

  assert.deepEqual(await listReplyNotifications(viewerDid), [{
    uri: replyUri,
    cid: "reply-cid",
    ownerDid: viewerDid,
    authorDid,
    authorHandle: "author.example",
    text: "a reply",
    createdAt,
    parentUri,
    parentCid: "parent-cid",
    parentText: "original post",
  }]);
  assert.deepEqual(await listReactionNotifications(viewerDid), [{
    uri: `${spaceUri}/${authorDid}/at.secretsky.reaction/one`,
    ownerDid: viewerDid,
    authorDid,
    authorHandle: "author.example",
    emoji: "⭐",
    createdAt,
    postUri: parentUri,
    postText: "original post",
  }]);
});

test("space watches can be checked without materializing a board", async () => {
  const spaceUri = "at://did:plc:watched/space/example.board/self";
  assert.equal(await hasSpaceWatch(spaceUri), false);
  await saveBoard(spaceUri, "did:plc:watched");
  await saveSpaceWatch({ spaceUri, authorityDid: "did:plc:watched" });
  assert.equal(await hasSpaceWatch(spaceUri), true);
  assert.equal(await hasBoard("did:plc:watched"), true);
  await hideSyncedSpace(spaceUri);
  assert.equal(await hasSpaceWatch(spaceUri), false);
  assert.equal(await hasBoard("did:plc:watched"), false);
});

test("board materialization applies owner moderation and positioning", async () => {
  const spaceUri = "at://did:plc:owner/space/example.board/self";
  const postUri = `${spaceUri}/did:plc:author/example.post/one`;
  const createdAt = new Date().toISOString();
  await saveAccount({ did: "did:plc:author", handle: "author.test" });
  await upsertPost({
    uri: postUri,
    cid: "post-cid",
    spaceUri,
    authorDid: "did:plc:author",
    text: "hello",
    color: "pink",
    rotation: 4,
    x: 10,
    y: 20,
    createdAt,
  });
  await upsertPosition({
    uri: `${spaceUri}/did:plc:owner/example.position/one`,
    cid: "position-cid",
    spaceUri,
    authorDid: "did:plc:owner",
    subjectUri: postUri,
    subjectCid: "post-cid",
    x: 30,
    y: 40,
    createdAt,
  });
  await upsertRemoval({
    uri: `${spaceUri}/did:plc:owner/example.removal/one`,
    cid: "removal-cid",
    spaceUri,
    authorDid: "did:plc:owner",
    subjectUri: postUri,
    subjectCid: "post-cid",
    createdAt,
  });

  assert.deepEqual(await listBoardPosts(spaceUri, "did:plc:owner"), [
    {
      uri: postUri,
      cid: "post-cid",
      spaceUri,
      authorDid: "did:plc:author",
      authorHandle: "author.test",
      text: "hello",
      imageCid: null,
      imageMime: null,
      imageSize: null,
      imageAlt: null,
      replyParentUri: null,
      replyParentCid: null,
      color: "pink",
      rotation: 4,
      x: 30,
      y: 40,
      createdAt,
      hidden: true,
    },
  ]);
});

test("sync repository hashes round-trip as byte arrays", async () => {
  await saveSyncedRepo({
    spaceUri: "at://did:plc:owner/space/example.board/self",
    repoDid: "did:plc:author",
    pdsUrl: "https://pds.test",
    rev: "1",
    ltHash: new Uint8Array([1, 2]),
    commitHash: new Uint8Array([3, 4]),
  });

  assert.deepEqual(
    await getSyncedRepo(
      "at://did:plc:owner/space/example.board/self",
      "did:plc:author",
    ),
    {
      spaceUri: "at://did:plc:owner/space/example.board/self",
      repoDid: "did:plc:author",
      pdsUrl: "https://pds.test",
      rev: "1",
      ltHash: new Uint8Array([1, 2]),
      commitHash: new Uint8Array([3, 4]),
    },
  );
});

test("reconciliation removes repositories absent from the remote space", async () => {
  const spaceUri = "at://did:plc:owner/space/example.board/recreated";
  const retainedDid = "did:plc:retained";
  const staleDid = "did:plc:stale";
  for (const repoDid of [retainedDid, staleDid]) {
    await saveSyncedRepo({
      spaceUri,
      repoDid,
      pdsUrl: "https://pds.test",
      rev: "1",
      ltHash: new Uint8Array([1]),
      commitHash: new Uint8Array([2]),
    });
  }
  const stalePostUri = `${spaceUri}/${staleDid}/example.post/old`;
  await upsertPost({
    uri: stalePostUri,
    cid: "stale-cid",
    spaceUri,
    authorDid: staleDid,
    text: "from the deleted board",
    createdAt: new Date().toISOString(),
  });

  assert.equal(
    await deleteSyncedReposExcept(spaceUri, new Set([retainedDid])),
    true,
  );
  assert.notEqual(await getSyncedRepo(spaceUri, retainedDid), null);
  assert.equal(await getSyncedRepo(spaceUri, staleDid), null);
  assert.equal(await getPost(stalePostUri), null);
  assert.equal(
    await deleteSyncedReposExcept(spaceUri, new Set([retainedDid])),
    false,
  );
});
