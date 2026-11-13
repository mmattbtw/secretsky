import assert from "node:assert/strict";
import { test } from "bun:test";
import { TID } from "@atproto/common-web";
import { asStringFormat } from "@atproto/lex-schema";
import type { RepoRemoved, RepoWrite } from "../lexicons/com/atproto/space/defs";
import { catchUpRepos, isCheckpointFresh, type WriterEntry } from "./catch-up";

const REV1 = "3lzzzzzzzzzaa";
const REV2 = "3lzzzzzzzzzab";
const REV3 = "3lzzzzzzzzzac";

function write(spaceRev: string, repoRev = spaceRev, did = "did:plc:writer"): WriterEntry {
  return {
    $type: "com.atproto.space.defs#repoWrite",
    repo: asStringFormat(did, "did"),
    repoRev: asStringFormat(repoRev, "tid"),
    spaceRev: asStringFormat(spaceRev, "tid"),
    data: new Uint8Array(32),
  };
}

function removed(spaceRev: string, did = "did:plc:writer"): WriterEntry {
  return {
    $type: "com.atproto.space.defs#repoRemoved",
    repo: asStringFormat(did, "did"),
    spaceRev: asStringFormat(spaceRev, "tid"),
  };
}

function handlers(work: string[]) {
  return {
    syncRepo: async (entry: RepoWrite) => { work.push(`write ${entry.repoRev}`); },
    removeRepo: async (entry: RepoRemoved) => { work.push(`remove ${entry.spaceRev}`); },
  };
}

test("catch-up continues through short pages and repeated writers until empty", async () => {
  const requests: Array<string | undefined> = [];
  const work: string[] = [];
  const pages = [
    { repos: [write(REV1)], cursor: REV1 },
    { repos: [write(REV2)], cursor: REV2 },
    { repos: [] },
  ];
  const result = await catchUpRepos(async (cursor) => {
    requests.push(cursor);
    return pages.shift()!;
  }, handlers(work));
  assert.deepEqual(requests, [undefined, REV1, REV2]);
  assert.deepEqual(work, [`write ${REV1}`, `write ${REV2}`]);
  assert.equal(result.cursor, REV2);
  assert.deepEqual([...result.repoDids], ["did:plc:writer"]);
});

test("removed writers are handled and leave the writer set until they write again", async () => {
  const work: string[] = [];
  const pages = [
    { repos: [write(REV1), removed(REV2), write(REV2, REV2, "did:plc:other")], cursor: REV2 },
    { repos: [] },
  ];
  const result = await catchUpRepos(async () => pages.shift()!, handlers(work));
  assert.deepEqual(work, [`write ${REV1}`, `remove ${REV2}`, `write ${REV2}`]);
  assert.deepEqual([...result.repoDids], ["did:plc:other"]);

  const readded = await catchUpRepos(
    async (cursor) => cursor ? { repos: [] } : { repos: [removed(REV2), write(REV3)], cursor: REV3 },
    handlers([]),
  );
  assert.deepEqual([...readded.repoDids], ["did:plc:writer"]);
});

test("unknown writer entries are skipped", async () => {
  const work: string[] = [];
  const pages = [
    { repos: [{ $type: "com.example.unknown#entry" } as unknown as WriterEntry], cursor: REV1 },
    { repos: [] },
  ];
  const result = await catchUpRepos(async () => pages.shift()!, handlers(work));
  assert.deepEqual(work, []);
  assert.equal(result.cursor, REV1);
});

test("empty catch-up preserves an opaque checkpoint unchanged", async () => {
  const checkpoint = "not-a-tid";
  const result = await catchUpRepos(async (cursor) => {
    assert.equal(cursor, checkpoint);
    return { repos: [] };
  }, {
    syncRepo: async () => { assert.fail("An empty listing has no work"); },
    removeRepo: async () => { assert.fail("An empty listing has no work"); },
  }, checkpoint);
  assert.equal(result.cursor, checkpoint);
});

test("failed repo work cannot produce a checkpoint and can be replayed", async () => {
  let savedCheckpoint: string | undefined;
  const fetchPage = async (cursor?: string) => cursor === REV1
    ? { repos: [write(REV2)], cursor: REV2 }
    : cursor === REV2 ? { repos: [] } : { repos: [write(REV1)], cursor: REV1 };
  const work: string[] = [];
  await assert.rejects(async () => {
    const result = await catchUpRepos(fetchPage, {
      syncRepo: async (entry) => {
        work.push(entry.repoRev);
        if (entry.spaceRev === REV2) throw new Error("Repo unavailable");
      },
      removeRepo: async () => {},
    }, savedCheckpoint);
    savedCheckpoint = result.cursor;
  }, /Repo unavailable/);
  assert.equal(savedCheckpoint, undefined);
  const result = await catchUpRepos(fetchPage, {
    syncRepo: async (entry) => { work.push(entry.repoRev); },
    removeRepo: async () => {},
  }, savedCheckpoint);
  savedCheckpoint = result.cursor;
  assert.deepEqual(work, [REV1, REV2, REV1, REV2]);
  assert.equal(savedCheckpoint, REV2);
});

test("checkpoints older than 72 hours require a full writer listing", () => {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  assert.equal(isCheckpointFresh(TID.fromTime((now - 71 * hour) * 1000, 0).toString(), now), true);
  assert.equal(isCheckpointFresh(TID.fromTime((now - 73 * hour) * 1000, 0).toString(), now), false);
  assert.equal(isCheckpointFresh("not-a-tid", now), false);
});
