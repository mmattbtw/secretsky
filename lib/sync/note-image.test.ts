import assert from "node:assert/strict";
import { test } from "bun:test";
import { cidForRawBytes } from "@atproto/lex-data";
import { MAX_NOTE_IMAGE_BYTES } from "../note-constraints";
import { parseNoteImage } from "../note-image";

test("accepts one supported, size-bounded image blob", async () => {
  const bytes = new TextEncoder().encode("tiny image fixture");
  const ref = await blobRef(bytes, "image/webp");
  const image = parseNoteImage(ref, "  A tiny image  ");

  assert.deepEqual(image, {
    cid: ref.ref.toString(),
    mimeType: "image/webp",
    size: bytes.length,
    alt: "A tiny image",
  });
  assert.equal(parseNoteImage(ref, null)?.alt, null);
});

test("rejects unsupported and oversized image references", async () => {
  const bytes = new Uint8Array([1]);
  const unsupported = await blobRef(bytes, "image/gif");
  assert.equal(parseNoteImage(unsupported, undefined), null);

  const oversized = {
    ...(await blobRef(bytes, "image/png")),
    size: MAX_NOTE_IMAGE_BYTES + 1,
  };
  assert.equal(parseNoteImage(oversized, undefined), null);
});

async function blobRef(bytes: Uint8Array, mimeType: string) {
  return {
    $type: "blob" as const,
    ref: await cidForRawBytes(bytes),
    mimeType,
    size: bytes.length,
  };
}
