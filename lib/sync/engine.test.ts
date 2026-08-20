import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  FOLLOW_COLLECTION,
  POST_COLLECTION,
  REACTION_COLLECTION,
  REMOVAL_COLLECTION,
  connectionsUri,
} from "../config";
import { parseChange } from "./change-parser";

test("removes a stale post when a replacement value is malformed", () => {
  const space = "at://did:plc:owner/space/at.secretsky.feed/self";
  const repoDid = "did:plc:writer";
  assert.deepEqual(
    parseChange({
      space,
      repoDid,
      collection: POST_COLLECTION,
      rkey: "post",
      cid: "bafyreireplacement",
      value: null,
    }),
    {
      kind: "delete",
      table: "post",
      uri: `${space}/${repoDid}/${POST_COLLECTION}/post`,
      spaceUri: space,
      authorDid: repoDid,
    },
  );
});

test("parses a board removal without generic label fields", () => {
  const space = "at://did:plc:owner/space/at.secretsky.feed/self";
  const repoDid = "did:plc:owner";
  const subjectUri = `${space}/did:plc:writer/${POST_COLLECTION}/post`;
  const createdAt = "2026-08-19T12:00:00.000Z";

  assert.deepEqual(
    parseChange({
      space,
      repoDid,
      collection: REMOVAL_COLLECTION,
      rkey: "removal",
      cid: "bafyreiremoval",
      value: {
        subject: { uri: subjectUri, cid: "bafyreipost" },
        createdAt,
      },
    }),
    {
      kind: "removal",
      value: {
        uri: `${space}/${repoDid}/${REMOVAL_COLLECTION}/removal`,
        cid: "bafyreiremoval",
        spaceUri: space,
        authorDid: repoDid,
        subjectUri,
        subjectCid: "bafyreipost",
        createdAt,
      },
    },
  );
});

test("removes a stale removal when its replacement is malformed", () => {
  const space = "at://did:plc:owner/space/at.secretsky.feed/self";
  const repoDid = "did:plc:owner";

  assert.deepEqual(
    parseChange({
      space,
      repoDid,
      collection: REMOVAL_COLLECTION,
      rkey: "removal",
      cid: "bafyreireplacement",
      value: { createdAt: "2026-08-19T12:00:00.000Z" },
    }),
    {
      kind: "delete",
      table: "removal",
      uri: `${space}/${repoDid}/${REMOVAL_COLLECTION}/removal`,
      spaceUri: space,
      authorDid: repoDid,
    },
  );
});

test("parses replies and reactions as space records", () => {
  const space = "at://did:plc:owner/space/at.secretsky.feed/self";
  const repoDid = "did:plc:follower";
  const parent = `${space}/did:plc:owner/${POST_COLLECTION}/parent`;
  const createdAt = "2026-08-20T12:00:00.000Z";

  const reply = parseChange({
    space,
    repoDid,
    collection: POST_COLLECTION,
    rkey: "reply",
    cid: "bafyreireply",
    value: {
      text: "hello back",
      reply: { parent: { uri: parent, cid: "bafyreiparent" } },
      createdAt,
    },
  });
  assert.equal(reply?.kind, "post");
  if (reply?.kind === "post") {
    assert.equal(reply.value.replyParentUri, parent);
    assert.equal(reply.value.replyParentCid, "bafyreiparent");
  }

  assert.deepEqual(
    parseChange({
      space,
      repoDid,
      collection: REACTION_COLLECTION,
      rkey: "heart",
      cid: "bafyreireaction",
      value: { subject: { uri: parent, cid: "bafyreiparent" }, createdAt },
    }),
    {
      kind: "reaction",
      value: {
        uri: `${space}/${repoDid}/${REACTION_COLLECTION}/heart`,
        cid: "bafyreireaction",
        spaceUri: space,
        authorDid: repoDid,
        subjectUri: parent,
        subjectCid: "bafyreiparent",
        emoji: "⭐",
        createdAt,
      },
    },
  );
});

test("parses private follows only from their owner's connections Space", () => {
  const repoDid = "did:plc:owner";
  const space = connectionsUri(repoDid);
  const createdAt = "2026-08-20T12:00:00.000Z";
  assert.deepEqual(
    parseChange({
      space,
      repoDid,
      collection: FOLLOW_COLLECTION,
      rkey: "follow",
      cid: "bafyreifollow",
      value: { subject: "did:plc:friend", createdAt },
    }),
    {
      kind: "privateFollow",
      value: {
        uri: `${space}/${repoDid}/${FOLLOW_COLLECTION}/follow`,
        cid: "bafyreifollow",
        spaceUri: space,
        authorDid: repoDid,
        subjectDid: "did:plc:friend",
        createdAt,
      },
    },
  );
  assert.equal(
    parseChange({
      space: "at://did:plc:owner/space/at.secretsky.feed/self",
      repoDid,
      collection: FOLLOW_COLLECTION,
      rkey: "follow",
      cid: "bafyreifollow",
      value: { subject: "did:plc:friend", createdAt },
    })?.kind,
    "delete",
  );
});
