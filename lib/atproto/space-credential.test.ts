import assert from "node:assert/strict";
import { test } from "bun:test";
import { com } from "../lexicons";
import { asStringFormat } from "@atproto/lex-schema";
import { XrpcResponseError } from "@atproto/lex-client";
import { P256Keypair } from "@atproto/crypto";
import { createSpaceToken, verifySpaceSignature } from "@atproto/space";
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

test("credential exchange binds through an HTTP message signature", async () => {
  const key = await P256Keypair.create();
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

      assert.equal(request.headers.has("dpop"), false);
      assert.equal(
        request.headers.get("signature-input"),
        `atproto-space=("authorization");keyid="${key.did()}"`,
      );
      assert.equal(
        await verifySpaceSignature(Object.fromEntries(request.headers)),
        key.did(),
      );

      return Response.json({ credential: "space-credential" });
    },
  });

  assert.equal(requestSeen, true);
  assert.equal(credential, "space-credential");
});

test("credential exchange preserves structured XRPC errors", async () => {
  const key = await P256Keypair.create();

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

test("credential reads bind to each repo DID even on a shared PDS", async () => {
  const key = await P256Keypair.create();
  const token = await tokenFor(key);
  const audiences: string[] = [];
  const credential = new SpaceCredential(token, key, async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    assert.equal(request.redirect, "error");
    assert.equal(request.headers.get("authorization"), `Atproto-Space ${token}`);
    assert.equal(request.headers.has("dpop"), false);
    assert.equal(request.headers.get("signature-input"),
      'atproto-space=("authorization" "atproto-space-audience")');
    const headers = Object.fromEntries(request.headers);
    assert.equal(await verifySpaceSignature(headers, asStringFormat(key.did(), "did")), key.did());
    await assert.rejects(verifySpaceSignature({
      ...headers, "atproto-space-audience": "did:plc:wrong",
    }, asStringFormat(key.did(), "did")));
    audiences.push(headers["atproto-space-audience"]);
    return Response.json({ ok: true });
  });
  const url = "https://shared-pds.example/xrpc/com.atproto.space.getRepo";
  assert.equal((await credential.fetch("did:plc:writer1", url)).ok, true);
  assert.equal((await credential.fetch("did:plc:writer2", url)).ok, true);
  assert.deepEqual(audiences, ["did:plc:writer1", "did:plc:writer2"]);
});

test("host clients use the bare authority DID and credentials refresh before expiry", async () => {
  const key = await P256Keypair.create();
  const token = await tokenFor(key);
  const credential = new SpaceCredential(token, key, async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    assert.equal(request.headers.get("atproto-space-audience"), "did:plc:owner");
    assert.equal(await verifySpaceSignature(Object.fromEntries(request.headers), asStringFormat(key.did(), "did")), key.did());
    return Response.json({ repos: [] });
  });
  assert.equal(credential.needsRefresh(credential.expiresAt - 5_001), false);
  assert.equal(credential.needsRefresh(credential.expiresAt - 5_000), true);
  assert.equal(credential.needsRefresh(credential.expiresAt), true);
  await credential.client(AUTHORITY_PDS, "did:plc:owner").call(
    com.atproto.space.listRepos, { space: asStringFormat(SPACE, "space-ref") },
  );
});

async function tokenFor(key: P256Keypair): Promise<string> {
  return createSpaceToken("credential", {
    iss: "did:plc:owner", sub: SPACE, keyId: asStringFormat(key.did(), "did"),
  }, await P256Keypair.create());
}

test("raw repo reads preserve revocation and expiry errors for credential replacement", async () => {
  const { throwSpaceResponseError } = await import("./space-credential");
  const { isCredentialInvalidError } = await import("../sync/errors");
  for (const error of ["CredentialRevoked", "JwtExpired"]) {
    await assert.rejects(
      throwSpaceResponseError(Response.json({ error }, { status: 401 })),
      (cause) => isCredentialInvalidError(cause),
    );
  }
});
