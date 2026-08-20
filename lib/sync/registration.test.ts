import assert from "node:assert/strict";
import { test } from "bun:test";
import { registrationRenewalDelay } from "./registration";

test("renews notification registration one hour before expiry", () => {
  const now = Date.parse("2026-08-12T12:00:00Z");
  const expiresAt = "2026-08-13T12:00:00Z";
  assert.equal(registrationRenewalDelay(expiresAt, now), 23 * 60 * 60 * 1000);
});

test("renews immediately when registration is near expiry", () => {
  const now = Date.parse("2026-08-12T12:00:00Z");
  assert.equal(
    registrationRenewalDelay("2026-08-12T12:30:00Z", now),
    0,
  );
});

test("renews immediately when persisted expiry is invalid", () => {
  assert.equal(registrationRenewalDelay("not-a-date"), 0);
});
