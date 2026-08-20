import {
  FOLLOW_COLLECTION,
  POSITION_COLLECTION,
  POST_COLLECTION,
  REACTION_COLLECTION,
  REMOVAL_COLLECTION,
  connectionsUri,
} from "../config";
import type { SyncedChange } from "../db/queries";
import { isBoardCoordinate } from "../note-constraints";
import { parseNoteImage } from "../note-image";
import { isNoteColor, isNoteRotation } from "../note-style";
import { reactionEmoji } from "../reaction-emoji";

export function parseChange(input: {
  space: string;
  repoDid: string;
  collection: string;
  rkey: string;
  cid: string | null;
  value?: unknown;
}): SyncedChange | undefined {
  const uri = `${input.space}/${input.repoDid}/${input.collection}/${input.rkey}`;
  const table = tableForCollection(input.collection);
  const deletion = table
    ? {
        kind: "delete" as const,
        table,
        uri,
        spaceUri: input.space,
        authorDid: input.repoDid,
      }
    : undefined;
  if (!input.cid) return deletion;
  if (!input.value || typeof input.value !== "object") return deletion;
  const value = input.value as Record<string, unknown>;
  const createdAt =
    typeof value.createdAt === "string" ? value.createdAt : undefined;

  if (input.collection === POST_COLLECTION) {
    if (typeof value.text !== "string" || !createdAt) return deletion;
    let image: NonNullable<ReturnType<typeof parseNoteImage>> | undefined;
    if (value.image !== undefined) {
      const parsedImage = parseNoteImage(value.image, value.imageAlt);
      if (!parsedImage) return deletion;
      image = parsedImage;
    }
    const position = parsePosition(value.position);
    const reply =
      value.reply && typeof value.reply === "object"
        ? parseSubject((value.reply as Record<string, unknown>).parent)
        : undefined;
    return {
      kind: "post",
      value: {
        uri,
        cid: input.cid,
        spaceUri: input.space,
        authorDid: input.repoDid,
        text: value.text,
        image,
        replyParentUri: reply?.uri,
        replyParentCid: reply?.cid,
        color: isNoteColor(value.color) ? value.color : undefined,
        rotation: isNoteRotation(value.rotation) ? value.rotation : undefined,
        x: position?.x,
        y: position?.y,
        createdAt,
      },
    };
  }

  if (input.collection === FOLLOW_COLLECTION) {
    if (
      input.space !== connectionsUri(input.repoDid) ||
      typeof value.subject !== "string" ||
      !value.subject.startsWith("did:") ||
      !createdAt
    ) {
      return deletion;
    }
    return {
      kind: "privateFollow",
      value: {
        uri,
        cid: input.cid,
        spaceUri: input.space,
        authorDid: input.repoDid,
        subjectDid: value.subject,
        createdAt,
      },
    };
  }

  const subject = parseSubject(value.subject);
  if (input.collection === REACTION_COLLECTION && subject?.cid && createdAt) {
    let emoji: string;
    try {
      emoji = reactionEmoji(value.emoji);
    } catch {
      return deletion;
    }
    return {
      kind: "reaction",
      value: {
        uri,
        cid: input.cid,
        spaceUri: input.space,
        authorDid: input.repoDid,
        subjectUri: subject.uri,
        subjectCid: subject.cid,
        emoji,
        createdAt,
      },
    };
  }
  if (input.collection === REMOVAL_COLLECTION && subject?.cid && createdAt) {
    return {
      kind: "removal",
      value: {
        uri,
        cid: input.cid,
        spaceUri: input.space,
        authorDid: input.repoDid,
        subjectUri: subject.uri,
        subjectCid: subject.cid,
        createdAt,
      },
    };
  }

  const position = parsePosition(value.position);
  if (
    input.collection === POSITION_COLLECTION &&
    subject?.cid &&
    position &&
    createdAt
  ) {
    return {
      kind: "position",
      value: {
        uri,
        cid: input.cid,
        spaceUri: input.space,
        authorDid: input.repoDid,
        subjectUri: subject.uri,
        subjectCid: subject.cid,
        ...position,
        createdAt,
      },
    };
  }
  return deletion;
}

function parsePosition(value: unknown): { x: number; y: number } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const position = value as { x?: unknown; y?: unknown };
  return isBoardCoordinate(position.x) && isBoardCoordinate(position.y)
    ? { x: position.x, y: position.y }
    : undefined;
}

function parseSubject(
  value: unknown,
): { uri: string; cid?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const subject = value as { uri?: unknown; cid?: unknown };
  if (typeof subject.uri !== "string") return undefined;
  const cid =
    typeof subject.cid === "string"
      ? subject.cid
      : subject.cid && typeof subject.cid === "object"
        ? String(subject.cid)
        : undefined;
  return { uri: subject.uri, cid };
}

function tableForCollection(
  collection: string,
):
  | "post"
  | "reaction"
  | "removal"
  | "note_position"
  | "private_follow"
  | undefined {
  if (collection === POST_COLLECTION) return "post";
  if (collection === REACTION_COLLECTION) return "reaction";
  if (collection === REMOVAL_COLLECTION) return "removal";
  if (collection === POSITION_COLLECTION) return "note_position";
  if (collection === FOLLOW_COLLECTION) return "private_follow";
  return undefined;
}
