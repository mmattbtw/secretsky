export const NOTE_COLORS = ["yellow", "pink", "blue", "green", "lavender"] as const;

export type NoteColor = (typeof NOTE_COLORS)[number];

export const MIN_NOTE_ROTATION = -25;
export const MAX_NOTE_ROTATION = 25;

export function isNoteColor(value: unknown): value is NoteColor {
  return typeof value === "string" && NOTE_COLORS.includes(value as NoteColor);
}

export function isNoteRotation(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) >= MIN_NOTE_ROTATION &&
    Number(value) <= MAX_NOTE_ROTATION
  );
}

export function fallbackNoteStyle(seed: string): {
  color: NoteColor;
  rotation: number;
} {
  const hash = hashString(seed);
  return {
    color: NOTE_COLORS[hash % NOTE_COLORS.length],
    rotation: -18 + (Math.floor(hash / NOTE_COLORS.length) % 37),
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
