import assert from "node:assert/strict";
import { test } from "bun:test";
import { P256Keypair } from "@atproto/crypto";
import { asStringFormat } from "@atproto/lex-schema";
import {
  COMMIT_MAC_PROFILE, RepoCommit, createCommitMacHeaders, createSpaceCredential,
  decapsulate, parseMacRequest, serializeRecord, verifyCredentialSig,
  writeRepoStar, type CreateMacParams, type SpaceCommit,
} from "@atproto/space";
import { getIdResolver } from "../atproto/identity";
import { SpaceCredential } from "../atproto/space-credential";
import { closeDb } from "../db";
import { migrate } from "../db/migrations";
import { getPost, getSyncedRepo, saveAccount, saveSpaceWatch } from "../db/queries";
import { SyncEngine } from "./engine";

const REPO = "did:plc:macwriter";
const SPACE = "at://did:plc:macowner/space/at.secretsky.feed/self";
const PDS = "https://mac-pds.example";
const REV1 = "3lzzzzzzzzzaa";
const REV2 = "3lzzzzzzzzzab";
const URI = `${SPACE}/${REPO}/at.secretsky.post/post`;

async function record(text: string) {
  return serializeRecord("at.secretsky.post", "post", {
    $type: "at.secretsky.post", text, createdAt: "2026-10-22T12:00:00.000Z",
  });
}

function commit(records: Parameters<typeof RepoCommit.fromRecords>[0], rev = REV1): SpaceCommit {
  return RepoCommit.fromRecords(records).toCommit({
    space: asStringFormat(SPACE, "space-ref"),
    repo: asStringFormat(REPO, "did"),
    rev: asStringFormat(rev, "tid"),
  });
}

async function archive(value: SpaceCommit, records: Parameters<typeof writeRepoStar>[1]) {
  const chunks: Uint8Array[] = [];

  for await (const chunk of writeRepoStar(value, records)) chunks.push(chunk);

  return Buffer.concat(chunks);
}

// Use real crypto, SDK framing, and SQLite. Only the remote PDS and DID resolver
// are replaced so the test can model key rotation and malformed responses.
async function withEngine(run: (context: {
  recover: () => Promise<void>;
  sync: () => Promise<void>;
  remove: () => Promise<void>;
  key: P256Keypair;
  setKey: (key: P256Keypair) => void;
  serve: (handler: (request: Request, mac: CreateMacParams) => Promise<Response>) => void;
  refreshes: boolean[];
  keyShares: string[];
}) => Promise<void>) {
  const oldPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = ":memory:";
  const resolver = getIdResolver().did;
  const originalResolve = resolver.resolve;
  const engine = new SyncEngine(() => {}, "did:web:secretsky.at#secretsky", "https://secretsky.at");

  const watch = {
    spaceUri: SPACE, authorityDid: "did:plc:macowner", spaceRev: null, lastError: null,
  };

  const key = await P256Keypair.create();
  let currentKey = key;
  const refreshes: boolean[] = [];
  const keyShares: string[] = [];

  let handler: (request: Request, mac: CreateMacParams) => Promise<Response> = async () => {
    throw new Error("Unexpected request");
  };

  const bindingKey = await P256Keypair.create();

  const token = await createSpaceCredential({
    iss: asStringFormat(watch.authorityDid, "did"),
    sub: asStringFormat(SPACE, "space-ref"),
    keyId: asStringFormat(bindingKey.did(), "did"),
    keypair: await P256Keypair.create(),
  });

  const credential = new SpaceCredential(token, bindingKey, async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    await verifyCredentialSig(Object.fromEntries(request.headers), asStringFormat(bindingKey.did(), "did"));
    assert.equal(request.headers.get("atproto-space-audience"), REPO);
    const macRequest = parseMacRequest(request.headers.get("accept-signature") ?? undefined, COMMIT_MAC_PROFILE);
    assert.ok(macRequest);
    assert.notEqual(macRequest.keyShare, bindingKey.did());
    keyShares.push(macRequest.keyShare);

    return handler(request, { ...macRequest, sharedSecret: decapsulate(currentKey, macRequest.keyShare) });
  });

  resolver.resolve = async (did, forceRefresh) => {
    assert.equal(did, REPO);
    refreshes.push(forceRefresh ?? false);

    return {
      id: REPO,
      verificationMethod: [{
        id: `${REPO}#atproto_kem`, type: "Multikey", controller: REPO,
        publicKeyMultibase: currentKey.did().slice("did:key:".length),
      }],
    };
  };

  try {
    await migrate();
    await saveAccount({ did: REPO, pdsUrl: PDS });
    await saveSpaceWatch({ spaceUri: SPACE, authorityDid: watch.authorityDid });
    engine["bindWatch"](watch);
    await run({
      recover: () => engine["recoverRepo"](watch, REPO, credential),
      sync: () => engine["syncRepoWithCredential"](watch, REPO, credential),
      remove: () => engine.deleteSpace(SPACE, { waitForRemoval: true }),
      key, setKey: (value) => { currentKey = value; },
      serve: (value) => { handler = value; }, refreshes, keyShares,
    });
  } finally {
    engine.stop();
    resolver.resolve = originalResolve;
    await closeDb();

    if (oldPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = oldPath;
  }
}

function macHeaders(mac: CreateMacParams, value: SpaceCommit) {
  return createCommitMacHeaders(value, mac).headers;
}

function wrongSecret(mac: CreateMacParams): CreateMacParams {
  return { ...mac, sharedSecret: new Uint8Array(32) };
}

function commitJson(value: SpaceCommit) {
  return { ...value, data: { $bytes: Buffer.from(value.data).toString("base64") } };
}

test("STAR recovery indexes verified records, preserves the digest, and replaces absent records", async () => {
  await withEngine(async ({ recover, remove, serve }) => {
    const post = await record("verified post");
    const value = commit([post]);
    serve(async (request, mac) => {
      assert.equal(new URL(request.url).pathname, "/xrpc/com.atproto.space.getRepo");

      return new Response(await archive(value, [post]), { headers: macHeaders(mac, value) });
    });
    await recover();
    assert.equal((await getPost(URI))?.text, "verified post");
    assert.deepEqual((await getSyncedRepo(SPACE, REPO))?.commitHash, value.data);
    const empty = commit([], REV2);
    serve(async (_, mac) => new Response(await archive(empty, []), { headers: macHeaders(mac, empty) }));
    await recover();
    assert.equal(await getPost(URI), null);
    await remove();
    await remove();
    assert.equal(await getSyncedRepo(SPACE, REPO), null);
  });
});

test("incremental pages each verify the current commit with separate MAC keys", async () => {
  await withEngine(async ({ recover, sync, serve, keyShares }) => {
    const empty = commit([]);
    serve(async (_, mac) => new Response(await archive(empty, []), { headers: macHeaders(mac, empty) }));
    await recover();
    const post = await record("incremental post");
    const value = commit([post], REV2);
    serve(async (request, mac) => {
      const url = new URL(request.url);
      assert.equal(url.pathname, "/xrpc/com.atproto.space.listRepoOps");
      assert.equal(url.searchParams.get("since"), REV1);

      if (!url.searchParams.has("cursor")) {
        return Response.json({ ops: [{
          rev: REV2, collection: post.collection, rkey: post.rkey, cid: post.cid.toString(),
          prev: null, value: { $type: "at.secretsky.post", text: "incremental post", createdAt: "2026-10-22T12:00:00.000Z" },
        }], commit: commitJson(value), cursor: "next" }, { headers: macHeaders(mac, value) });
      }

      return Response.json({ ops: [], commit: commitJson(value) }, { headers: macHeaders(mac, value) });
    });
    await sync();
    assert.equal((await getPost(URI))?.text, "incremental post");
    assert.equal((await getSyncedRepo(SPACE, REPO))?.rev, REV2);
    assert.equal(keyShares.length, 3);
    assert.equal(new Set(keyShares).size, 3);
  });
});

test("MAC failure refreshes the KEM key and retries with a new key share", async () => {
  await withEngine(async ({ recover, serve, setKey, refreshes, keyShares }) => {
    const value = commit([]);
    const rotated = await P256Keypair.create();
    let attempts = 0;
    serve(async (_, mac) => {
      attempts++;

      if (attempts === 1) {
        setKey(rotated);

        return new Response(await archive(value, []), { headers: macHeaders(wrongSecret(mac), value) });
      }

      return new Response(await archive(value, []), { headers: macHeaders(mac, value) });
    });
    await recover();
    assert.deepEqual(refreshes, [false, true]);
    assert.equal(new Set(keyShares).size, 2);
    assert.equal((await getSyncedRepo(SPACE, REPO))?.rev, REV1);
  });
});

for (const failure of ["missing MAC", "malformed MAC", "wrong MAC", "wrong repo", "wrong space", "truncated STAR", "digest mismatch"]) {
  test(`recovery rejects ${failure} without replacing indexed data`, async () => {
    await withEngine(async ({ recover, serve }) => {
      const original = await record("keep this post");
      const originalCommit = commit([original]);
      serve(async (_, mac) => new Response(await archive(originalCommit, [original]), { headers: macHeaders(mac, originalCommit) }));
      await recover();
      const replacement = await record("unverified replacement");
      const value = commit([replacement], REV2);

      if (failure === "wrong repo") value.repo = "did:plc:other";

      if (failure === "wrong space") value.space = "at://did:plc:other/space/at.secretsky.feed/self";
      serve(async (_, mac) => {
        const bytes = await archive(value, failure === "digest mismatch" ? [] : [replacement]);

        const headers = failure === "missing MAC" ? {} : failure === "malformed MAC"
          ? { ...macHeaders(mac, value), signature: "invalid" }
          : macHeaders(failure === "wrong MAC" ? wrongSecret(mac) : mac, value);

        return new Response(failure === "truncated STAR" ? bytes.subarray(0, bytes.length - 1) : bytes, { headers });
      });
      await assert.rejects(recover());
      assert.equal((await getPost(URI))?.text, "keep this post");
      assert.equal((await getSyncedRepo(SPACE, REPO))?.rev, REV1);
    });
  });
}

test("bad incremental MACs and failed recovery leave the prior repo intact", async () => {
  await withEngine(async ({ recover, sync, serve }) => {
    const original = await record("original post");
    const originalCommit = commit([original]);
    serve(async (_, mac) => new Response(await archive(originalCommit, [original]), { headers: macHeaders(mac, originalCommit) }));
    await recover();

    const replacement = await record("unverified post");
    const value = commit([replacement], REV2);
    serve(async (request, mac) => {
      const headers = macHeaders(wrongSecret(mac), value);

      if (new URL(request.url).pathname.endsWith("getRepo")) {
        return new Response(await archive(value, [replacement]), { headers });
      }

      return Response.json({
        ops: [{ rev: REV2, collection: replacement.collection, rkey: replacement.rkey,
          cid: replacement.cid.toString(), prev: original.cid.toString(),
          value: { $type: "at.secretsky.post", text: "unverified post", createdAt: "2026-10-22T12:00:00.000Z" } }],
        commit: commitJson(value),
      }, { headers });
    });

    await assert.rejects(sync());
    assert.equal((await getPost(URI))?.text, "original post");
    assert.equal((await getSyncedRepo(SPACE, REPO))?.rev, REV1);
  });
});

test("recovery treats a repo the host no longer has as empty", async () => {
  await withEngine(async ({ recover, serve }) => {
    const post = await record("soon gone");
    const value = commit([post]);
    serve(async (_, mac) => new Response(await archive(value, [post]), { headers: macHeaders(mac, value) }));
    await recover();
    assert.equal((await getPost(URI))?.text, "soon gone");

    serve(async () => Response.json({ error: "RepoNotFound" }, { status: 400 }));
    await recover();
    assert.equal(await getPost(URI), null);
    assert.equal(await getSyncedRepo(SPACE, REPO), null);
  });
});
