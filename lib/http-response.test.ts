import { test } from "bun:test";
import assert from "node:assert/strict";
import { apiNotFound, methodNotAllowed } from "../src/server/http";

test("methodNotAllowed returns JSON with the allowed methods", async () => {
  const response = methodNotAllowed(["POST", "DELETE"]);

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST, DELETE");
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await response.json(), { error: "Method Not Allowed" });
});

test("apiNotFound returns a JSON 404", async () => {
  const response = apiNotFound();

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await response.json(), { error: "Not Found" });
});
