export const MAX_NOTE_TEXT_LENGTH = 300;
export const MAX_NOTE_IMAGE_BYTES = 500_000;
export const MAX_NOTE_IMAGE_ALT_LENGTH = 300;
export const BOARD_COORDINATE_MAX = 1000;

export const NOTE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type NoteImageMimeType = (typeof NOTE_IMAGE_MIME_TYPES)[number];

export function isNoteImageMime(value: unknown): value is NoteImageMimeType {
  return NOTE_IMAGE_MIME_TYPES.includes(value as NoteImageMimeType);
}

export function isBoardCoordinate(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) >= 0 &&
    Number(value) <= BOARD_COORDINATE_MAX
  );
}
