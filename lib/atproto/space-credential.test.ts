import assert from "node:assert/strict";
import { test } from "bun:test";
import { XrpcResponseError } from "@atproto/lex-client";
import { JoseKey } from "@atproto/jwk-jose";
import { dpopJktForKey, verifyDpopProof } from "@atproto/space";
import {
  exchangeSpaceCredential,
  SpaceCredential,
} from "./space-credential";

const AUTHORITY_PDS = "https://authority.example";
const EXCHANGE_URL =
  `${AUTHORITY_PDS}/xrpc/com.atproto.space.getSpaceCredential`;
const SPACE =
  "at://did:plc:owner/space/at.secretsky.feed/self";
const DELEGATION_TOKEN = "delegation-token";

test("credential exchange binds through a DPoP proof", async () => {
  const key = await JoseKey.generate(["ES256"]);
  let requestSeen = false;

  const credential = await exchangeSpaceCredential({
    authorityPds: AUTHORITY_PDS,
    delegationToken: DELEGATION_TOKEN,
    space: SPACE,
    key,
    fetchImpl: async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requestSeen = true;
      assert.equal(request.method, "POST");
      assert.equal(request.url, EXCHANGE_URL);
      assert.equal(request.redirect, "error");
      assert.equal(
        request.headers.get("authorization"),
        `Bearer ${DELEGATION_TOKEN}`,
      );
      assert.deepEqual(await request.json(), { space: SPACE });

      const proof = request.headers.get("dpop");
      assert.ok(proof);
      const verified = await verifyDpopProof(proof, {
        htm: request.method,
        htu: request.url,
      });
      assert.equal(verified.jkt, await dpopJktForKey(key));

      return Response.json({ credential: "space-credential" });
    },
  });

  assert.equal(requestSeen, true);
  assert.equal(credential, "space-credential");
});

test("credential exchange preserves structured XRPC errors", async () => {
  const key = await JoseKey.generate(["ES256"]);

  await assert.rejects(
    exchangeSpaceCredential({
      authorityPds: AUTHORITY_PDS,
      delegationToken: DELEGATION_TOKEN,
      space: SPACE,
      key,
      fetchImpl: async () =>
        Response.json(
          { error: "SpaceDeleted", message: "Space has been deleted" },
          { status: 400, headers: { "x-test-header": "preserved" } },
        ),
    }),
    (error) =>
      error instanceof XrpcResponseError &&
      error.status === 400 &&
      error.response.headers.get("x-test-header") === "preserved" &&
      error.error === "SpaceDeleted" &&
      error.message === "Space has been deleted",
  );
});

test("credential reads prove possession without following redirects", async () => {
  const key = await JoseKey.generate(["ES256"]);
  const token = "space-credential";
  const url = "https://repo.example/xrpc/com.atproto.space.getRepo?repo=writer";
  const credential = new SpaceCredential(token, key, async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    assert.equal(request.url, url);
    assert.equal(request.redirect, "error");
    assert.equal(request.headers.get("authorization"), `DPoP ${token}`);

    const proof = request.headers.get("dpop");
    assert.ok(proof);
    const verified = await verifyDpopProof(proof, {
      htm: request.method,
      htu: request.url,
      credential: token,
      jkt: await dpopJktForKey(key),
    });
    assert.equal(verified.jkt, await dpopJktForKey(key));
    return Response.json({ ok: true });
  });

  const response = await credential.fetch(url);
  assert.equal(response.ok, true);
});
