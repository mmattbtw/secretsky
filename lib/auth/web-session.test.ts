import assert from "node:assert/strict";
import { test } from "bun:test";

process.env.DATABASE_PATH = ":memory:";

const { migrate } = await import("../db/migrations");
const { getQueryDb } = await import("../db/index");
const {
  createWebSession,
  deleteWebSession,
  resolveWebSession,
  WEB_SESSION_MAX_AGE_SECONDS,
} = await import("./web-session");

await migrate();

test("an opaque session token resolves to its DID", async () => {
  const did = "did:plc:alice";
  const token = await createWebSession(did);

  assert.equal(token.length, 43);
  assert.equal(await resolveWebSession(token), did);
  assert.equal(await resolveWebSession(did), null);

  const stored = await getQueryDb()
    .selectFrom("webSession")
    .select("tokenHash")
    .where("did", "=", did)
    .executeTakeFirstOrThrow();
  assert.notEqual(stored.tokenHash, token);
});

test("expired sessions are rejected", async () => {
  const token = await createWebSession("did:plc:expired");
  await getQueryDb()
    .updateTable("webSession")
    .set({ expiresAt: new Date(0).toISOString() })
    .where("did", "=", "did:plc:expired")
    .execute();

  assert.equal(await resolveWebSession(token), null);
  assert.equal(await deleteWebSession(token), null);
});

test("deleting a session returns its DID and prevents reuse", async () => {
  const did = "did:plc:bob";
  const token = await createWebSession(did);

  assert.equal(await deleteWebSession(token), did);
  assert.equal(await deleteWebSession(token), null);
  assert.equal(await resolveWebSession(token), null);
});

test("session lifetime remains seven days", () => {
  assert.equal(WEB_SESSION_MAX_AGE_SECONDS, 60 * 60 * 24 * 7);
});
