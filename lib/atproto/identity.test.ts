import assert from "node:assert/strict";
import { test } from "bun:test";
import { DidWebResolver, UnsupportedDidWebPathError } from "@atproto/identity";
import { getIdResolver, resolveDid, resolveHandle } from "./identity";

test("handle resolution does not retain negative responses", async () => {
  const handleResolver = getIdResolver().handle;
  const originalResolve = handleResolver.resolve;
  try {
    let attempt = 0;
    handleResolver.resolve = async () => {
      attempt += 1;
      return attempt === 1 ? undefined : "did:plc:resolved";
    };

    assert.equal(await resolveHandle("eventual.test"), null);
    assert.equal(await resolveHandle("eventual.test"), "did:plc:resolved");
    assert.equal(attempt, 2);
  } finally {
    handleResolver.resolve = originalResolve;
  }
});

test("did:web resolution uses the well-known DID document", async () => {
  const did = "did:web:web.mmatt.net";
  const originalFetch = globalThis.fetch;
  try {
    let requestedUrl: string | undefined;
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return Response.json({ id: did });
    };

    const resolver = new DidWebResolver(1_000);
    assert.deepEqual(await resolver.resolveNoCheck(did), { id: did });
    assert.equal(
      requestedUrl,
      "https://web.mmatt.net/.well-known/did.json",
    );
    await assert.rejects(
      () => resolver.resolveNoCheck("did:web:example.com:users:alice"),
      UnsupportedDidWebPathError,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("identity resolution preserves a supported did:web", async () => {
  const did = "did:web:web.mmatt.net";
  const didResolver = getIdResolver().did;
  const originalResolve = didResolver.resolve;
  try {
    didResolver.resolve = async (input) => {
      assert.equal(input, did);
      return { id: did } as never;
    };
    assert.equal((await resolveDid(did)).id, did);
    await assert.rejects(
      () => resolveDid("did:web:example.com:users:alice"),
      /Unsupported ATProto DID/,
    );
  } finally {
    didResolver.resolve = originalResolve;
  }
});
