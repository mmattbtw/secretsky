import assert from "node:assert/strict";
import { test } from "bun:test";
import { isArchivedPost } from "./post-time";

test("large timestamp discrepancies are marked as archived", () => {
  assert.equal(
    isArchivedPost(
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
    ),
    true,
  );
  assert.equal(
    isArchivedPost(
      "2026-01-03T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
    ),
    true,
  );
  assert.equal(
    isArchivedPost(
      "2026-01-01T12:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
    ),
    false,
  );
});
