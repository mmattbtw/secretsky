import assert from "node:assert/strict";
import { test } from "bun:test";
import { asStringFormat } from "@atproto/lex-schema";
import type { Repo } from "../lexicons/com/atproto/space/listRepos";
import { catchUpRepos } from "./catch-up";

const REV1 = "3lzzzzzzzzzaa";
const REV2 = "3lzzzzzzzzzab";

function repo(spaceRev: string, repoRev = spaceRev): Repo {
  return {
    did: asStringFormat("did:plc:writer", "did"),
    repoRev: asStringFormat(repoRev, "tid"),
    spaceRev: asStringFormat(spaceRev, "tid"),
    hash: new Uint8Array(32),
  };
}

test("catch-up continues through short pages and repeated writers until empty", async () => {
  const requests: Array<string | undefined> = [];
  const processed: string[] = [];
  const pages = [
    { repos: [repo(REV1)], cursor: REV1 },
    { repos: [repo(REV2)], cursor: REV2 },
    { repos: [] },
  ];
  const result = await catchUpRepos(async (cursor) => {
    requests.push(cursor);
    return pages.shift()!;
  }, async (entry) => { processed.push(entry.repoRev); });
  assert.deepEqual(requests, [undefined, REV1, REV2]);
  assert.deepEqual(processed, [REV1, REV2]);
  assert.equal(result.cursor, REV2);
  assert.deepEqual([...result.repoDids], ["did:plc:writer"]);
});

test("empty catch-up preserves an opaque checkpoint unchanged", async () => {
  const checkpoint = "not-a-tid";
  const result = await catchUpRepos(async (cursor) => {
    assert.equal(cursor, checkpoint);
    return { repos: [] };
  }, async () => { assert.fail("An empty listing has no work"); }, checkpoint);
  assert.equal(result.cursor, checkpoint);
});

test("failed repo work cannot produce a checkpoint and can be replayed", async () => {
  let savedCheckpoint: string | undefined;
  const fetchPage = async (cursor?: string) => cursor === REV1
    ? { repos: [repo(REV2)], cursor: REV2 }
    : cursor === REV2 ? { repos: [] } : { repos: [repo(REV1)], cursor: REV1 };
  const work: string[] = [];
  await assert.rejects(async () => {
    const result = await catchUpRepos(fetchPage, async (entry) => {
      work.push(entry.repoRev);
      if (entry.spaceRev === REV2) throw new Error("Repo unavailable");
    }, savedCheckpoint);
    savedCheckpoint = result.cursor;
  }, /Repo unavailable/);
  assert.equal(savedCheckpoint, undefined);
  const result = await catchUpRepos(fetchPage, async (entry) => {
    work.push(entry.repoRev);
  }, savedCheckpoint);
  savedCheckpoint = result.cursor;
  assert.deepEqual(work, [REV1, REV2, REV1, REV2]);
  assert.equal(savedCheckpoint, REV2);
});
