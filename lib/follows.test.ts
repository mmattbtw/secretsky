import assert from "node:assert/strict";
import { test } from "bun:test";
import { connectionsUri } from "./config";

process.env.DATABASE_PATH = ":memory:";

const { migrate } = await import("./db/migrations");
const { deleteStoredPrivateFollow, upsertPrivateFollow } = await import(
  "./db/queries"
);
const {
  canAccessFeed,
  getPrivateFollowRelationship,
  listIncomingFollows,
  listPrivateFollowing,
} = await import("./follows");

await migrate();

const alice = "did:plc:alice";
const bob = "did:plc:bob";

test("a private follow stays locked until it is reciprocal", async () => {
  const aliceFollowUri = await storeFollow(alice, bob, "alice-bob");

  assert.deepEqual(await getPrivateFollowRelationship(alice, bob), {
    follows: true,
    followedBy: false,
    mutual: false,
  });
  assert.equal(await canAccessFeed(alice, bob), false);
  assert.deepEqual(await listIncomingFollows(bob), [
    {
      requesterDid: alice,
      handle: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      followsBack: false,
    },
  ]);
  assert.deepEqual(await listPrivateFollowing(alice), [
    { ownerDid: bob, handle: null, mutual: false },
  ]);

  await storeFollow(bob, alice, "bob-alice");
  assert.deepEqual(await getPrivateFollowRelationship(alice, bob), {
    follows: true,
    followedBy: true,
    mutual: true,
  });
  assert.equal(await canAccessFeed(alice, bob), true);
  assert.deepEqual(await listIncomingFollows(bob), [
    {
      requesterDid: alice,
      handle: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      followsBack: true,
    },
  ]);
  assert.deepEqual(await listPrivateFollowing(alice), [
    { ownerDid: bob, handle: null, mutual: true },
  ]);

  await deleteStoredPrivateFollow(aliceFollowUri);
  assert.equal(await canAccessFeed(alice, bob), false);
});

test("an account always has access to its own feed", async () => {
  assert.equal(await canAccessFeed(alice, alice), true);
});

async function storeFollow(
  authorDid: string,
  subjectDid: string,
  key: string,
): Promise<string> {
  const spaceUri = connectionsUri(authorDid);
  const uri = `${spaceUri}/${authorDid}/at.secretsky.follow/${key}`;
  await upsertPrivateFollow({
    uri,
    cid: `${key}-cid`,
    spaceUri,
    authorDid,
    subjectDid,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  return uri;
}
