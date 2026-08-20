export const DEFAULT_REACTION_EMOJI = "⭐";

export const REACTION_EMOJI_OPTIONS = [
  DEFAULT_REACTION_EMOJI,
  "❤️",
  "😂",
  "🎉",
  "🔥",
  "👏",
  "👀",
  "🤝",
] as const;

export type ReactionEmojiCount = {
  emoji: string;
  count: number;
  actors?: ReadonlyArray<{ did: string; handle: string | null }>;
};

export function visibleReactionEmojiCounts(
  counts: ReadonlyArray<ReactionEmojiCount>,
): ReactionEmojiCount[] {
  const star = counts.find(({ emoji }) => emoji === DEFAULT_REACTION_EMOJI);
  return [
    star ?? { emoji: DEFAULT_REACTION_EMOJI, count: 0, actors: [] },
    ...counts.filter(({ emoji }) => emoji !== DEFAULT_REACTION_EMOJI),
  ];
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const emojiPattern = /\p{Extended_Pictographic}|\p{Emoji_Presentation}/u;

export function reactionEmoji(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_REACTION_EMOJI;
  }
  if (typeof value !== "string") throw new Error("Choose one emoji");
  const emoji = value.trim();
  const graphemes = [...segmenter.segment(emoji)];
  if (graphemes.length !== 1 || !emojiPattern.test(emoji) || emoji.length > 32) {
    throw new Error("Choose one emoji");
  }
  return emoji;
}
