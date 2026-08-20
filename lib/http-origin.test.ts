import assert from "node:assert/strict";
import { test } from "bun:test";
import { isAllowedRequestOrigin } from "./http-origin";

const configured = "http://127.0.0.1:3000";

test("development accepts equivalent loopback origins", () => {
  assert.equal(
    isAllowedRequestOrigin("http://localhost:3000", configured, true),
    true,
  );
  assert.equal(
    isAllowedRequestOrigin("http://[::1]:3000", configured, true),
    true,
  );
  assert.equal(
    isAllowedRequestOrigin("http://127.0.0.2:3000", configured, true),
    true,
  );
});

test("loopback aliases still require the configured protocol and port", () => {
  assert.equal(
    isAllowedRequestOrigin("http://localhost:3001", configured, true),
    false,
  );
  assert.equal(
    isAllowedRequestOrigin("https://localhost:3000", configured, true),
    false,
  );
  assert.equal(
    isAllowedRequestOrigin("http://localhost.evil:3000", configured, true),
    false,
  );
});

test("production requires the exact configured origin", () => {
  assert.equal(
    isAllowedRequestOrigin("http://127.0.0.1:3000", configured, false),
    true,
  );
  assert.equal(
    isAllowedRequestOrigin("http://localhost:3000", configured, false),
    false,
  );
  assert.equal(isAllowedRequestOrigin("not an origin", configured, false), false);
});
