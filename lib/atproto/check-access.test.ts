import assert from "node:assert/strict";
import { test } from "bun:test";
import { connectionsUri, feedUri } from "../config";
import { checkAccess } from "./check-access";

const owner = "did:plc:owner";
const dependencies = {
  verify: async (_auth: string | null, authority: string) => {
    assert.equal(authority, owner);
  },
  canAccessFeed: async (user: string) => user === owner || user === "did:plc:mutual",
};

function request(space: string, repo?: string, clientId?: string) {
  const url = new URL("https://secretsky.at/xrpc/com.atproto.managedspace.checkAccess");
  url.searchParams.set("space", space);
  if (repo) url.searchParams.set("repo", repo);
  if (clientId) url.searchParams.set("clientId", clientId);
  return new Request(url);
}

test("one check answers read and write with mutual feed access and owner-only connections", async () => {
  for (const repo of [owner, "did:plc:mutual", "did:plc:stranger"]) {
    const feed = await checkAccess(request(feedUri(owner), repo), dependencies);
    const feedAllowed = repo !== "did:plc:stranger";
    assert.deepEqual(await feed.json(), { read: feedAllowed, write: feedAllowed });
    const connections = await checkAccess(request(connectionsUri(owner), repo), dependencies);
    assert.deepEqual(await connections.json(), { read: repo === owner, write: repo === owner });
  }
});

test("a check without a repo denies the private spaces", async () => {
  for (const space of [feedUri(owner), connectionsUri(owner)]) {
    const response = await checkAccess(request(space), dependencies);
    assert.deepEqual(await response.json(), { read: false, write: false });
  }
});

test("an attested clientId does not change the answer", async () => {
  const response = await checkAccess(request(feedUri(owner), owner, "https://client.example"), dependencies);
  assert.deepEqual(await response.json(), { read: true, write: true });
});

test("unknown spaces and malformed repos are rejected", async () => {
  assert.equal((await checkAccess(request(`at://${owner}/space/com.example.other/self`, owner), dependencies)).status, 400);
  assert.equal((await checkAccess(request(feedUri(owner), "not-a-did"), dependencies)).status, 400);
});

test("managing-app checks reject failed authority service authentication", async () => {
  const response = await checkAccess(request(feedUri(owner), owner), {
    ...dependencies,
    verify: async () => { throw new Error("Wrong issuer"); },
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "AuthRequired" });
});
