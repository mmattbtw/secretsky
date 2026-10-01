import assert from "node:assert/strict";
import { test } from "bun:test";
import { connectionsUri, feedUri } from "../config";
import { checkUserAccess } from "./user-access";

const owner = "did:plc:owner";
const dependencies = {
  verify: async (_auth: string | null, authority: string) => {
    assert.equal(authority, owner);
  },
  canAccessFeed: async (user: string) => user === owner || user === "did:plc:mutual",
};

function request(space: string, user: string, access?: string, clientId?: string) {
  const url = new URL("https://secretsky.at/xrpc/com.atproto.simplespace.checkUserAccess");
  url.searchParams.set("space", space);
  url.searchParams.set("user", user);
  if (access) url.searchParams.set("access", access);
  if (clientId) url.searchParams.set("clientId", clientId);
  return new Request(url);
}

test("read and write checks preserve mutual feed access and owner-only connections", async () => {
  for (const access of ["read", "write"]) {
    for (const user of [owner, "did:plc:mutual", "did:plc:stranger"]) {
      const feed = await checkUserAccess(request(feedUri(owner), user, access), dependencies);
      assert.deepEqual(await feed.json(), { authorized: user !== "did:plc:stranger" });
      const connections = await checkUserAccess(request(connectionsUri(owner), user, access), dependencies);
      assert.deepEqual(await connections.json(), { authorized: user === owner });
    }
  }
});

test("access is required and only read checks accept an attested clientId", async () => {
  for (const access of [undefined, "admin"]) {
    assert.equal((await checkUserAccess(request(feedUri(owner), owner, access), dependencies)).status, 400);
  }
  assert.equal((await checkUserAccess(request(feedUri(owner), owner, "write", "https://client.example"), dependencies)).status, 400);
  assert.deepEqual(await (await checkUserAccess(request(feedUri(owner), owner, "read", "https://client.example"), dependencies)).json(), { authorized: true });
});

test("managing-app checks reject failed authority service authentication", async () => {
  const response = await checkUserAccess(request(feedUri(owner), owner, "read"), {
    ...dependencies,
    verify: async () => { throw new Error("Wrong issuer"); },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "AuthRequired" });
});
