import assert from "node:assert/strict";
import { test } from "bun:test";
import {
  DEFAULT_REACTION_EMOJI,
  reactionEmoji,
  visibleReactionEmojiCounts,
} from "./reaction-emoji";

test("reactions default to a star", () => {
  assert.equal(reactionEmoji(undefined), DEFAULT_REACTION_EMOJI);
});

test("reactions accept one emoji grapheme", () => {
  assert.equal(reactionEmoji("❤️"), "❤️");
  assert.equal(reactionEmoji("👩🏽‍💻"), "👩🏽‍💻");
});

test("reactions reject text and multiple emoji", () => {
  assert.throws(() => reactionEmoji("nice"), /one emoji/i);
  assert.throws(() => reactionEmoji("⭐🔥"), /one emoji/i);
});

test("the visible reaction row keeps custom emoji beside the default star", () => {
  assert.deepEqual(
    visibleReactionEmojiCounts([
      { emoji: "❤️", count: 2 },
      { emoji: "😂", count: 1 },
    ]),
    [
      { emoji: "⭐", count: 0, actors: [] },
      { emoji: "❤️", count: 2 },
      { emoji: "😂", count: 1 },
    ],
  );
  assert.deepEqual(
    visibleReactionEmojiCounts([
      { emoji: "⭐", count: 3 },
      { emoji: "🔥", count: 1 },
    ]),
    [
      { emoji: "⭐", count: 3 },
      { emoji: "🔥", count: 1 },
    ],
  );
});
