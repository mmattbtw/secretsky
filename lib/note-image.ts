import {
  getBlobCidString,
  getBlobMime,
  getBlobSize,
  isBlobRef,
  parseCid,
} from "@atproto/lex-data";
import {
  isNoteImageMime,
  MAX_NOTE_IMAGE_ALT_LENGTH,
  MAX_NOTE_IMAGE_BYTES,
  type NoteImageMimeType,
} from "./note-constraints";

export type NoteImage = {
  cid: string;
  mimeType: NoteImageMimeType;
  size: number;
  alt: string | null;
};

export function parseNoteImage(
  image: unknown,
  alt: unknown,
): NoteImage | null {
  if (!isBlobRef(image)) return null;
  const cid = getBlobCidString(image);
  const mimeType = getBlobMime(image);
  const size = getBlobSize(image);
  if (
    !cid ||
    !isNoteImageMime(mimeType) ||
    size === undefined ||
    size <= 0 ||
    size > MAX_NOTE_IMAGE_BYTES
  ) {
    return null;
  }
  if (alt !== undefined && alt !== null && typeof alt !== "string") return null;
  const normalizedAlt = typeof alt === "string" ? alt.trim() : "";
  if (Array.from(normalizedAlt).length > MAX_NOTE_IMAGE_ALT_LENGTH) return null;
  return { cid, mimeType, size, alt: normalizedAlt || null };
}

export function noteImageBlobRef(image: NoteImage) {
  return {
    $type: "blob" as const,
    ref: parseCid(image.cid),
    mimeType: image.mimeType,
    size: image.size,
  };
}
