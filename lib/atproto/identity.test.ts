import assert from "node:assert/strict";
import { test } from "bun:test";
import { getIdResolver, resolveHandle } from "./identity";

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
