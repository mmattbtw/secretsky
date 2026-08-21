import { sql, type Kysely } from "kysely";
import { deleteBlobFile } from "../blob-store";
import type { NoteImage } from "../note-image";
import { fallbackNoteStyle, type NoteColor } from "../note-style";
import { getQueryDb } from "./index";
import type { DatabaseSchema } from "./schema";
import { writeTransaction } from "./write-transaction";

type DatabaseConnection = Kysely<DatabaseSchema>;

export type BoardPost = {
  uri: string;
  cid: string;
  spaceUri: string;
  authorDid: string;
  authorHandle: string | null;
  text: string;
  imageCid: string | null;
  imageMime: string | null;
  imageSize: number | null;
  imageAlt: string | null;
  replyParentUri: string | null;
  replyParentCid: string | null;
  color: NoteColor;
  rotation: number;
  x: number;
  y: number;
  createdAt: string;
  hidden: boolean;
};

export type StoredPost = Omit<
  BoardPost,
  "authorHandle" | "hidden" | "x" | "y" | "color" | "rotation"
> & {
  x: number | null;
  y: number | null;
  color: NoteColor | null;
  rotation: number | null;
};

export type SpaceWatch = {
  spaceUri: string;
  authorityDid: string;
  registrationExpiresAt: string | null;
  lastError: string | null;
};

export type SyncedRepo = {
  spaceUri: string;
  repoDid: string;
  pdsUrl: string;
  rev: string;
  ltHash: Uint8Array;
  commitHash: Uint8Array;
};

export type SpaceBlob = {
  spaceUri: string;
  repoDid: string;
  cid: string;
  mimeType: string;
  size: number;
};

type PostInput = {
  uri: string;
  cid: string;
  spaceUri: string;
  authorDid: string;
  text: string;
  image?: NoteImage;
  replyParentUri?: string;
  replyParentCid?: string;
  color?: NoteColor;
  rotation?: number;
  x?: number;
  y?: number;
  createdAt: string;
};

export type ReactionInput = {
  uri: string;
  cid: string;
  spaceUri: string;
  authorDid: string;
  subjectUri: string;
  subjectCid: string;
  emoji: string;
  createdAt: string;
};

export type PrivateFollowInput = {
  uri: string;
  cid: string;
  spaceUri: string;
  authorDid: string;
  subjectDid: string;
  createdAt: string;
};

type RemovalInput = {
  uri: string;
  cid: string;
  spaceUri: string;
  authorDid: string;
  subjectUri: string;
  subjectCid: string;
  createdAt: string;
};

type PositionInput = {
  uri: string;
  cid: string;
  spaceUri: string;
  authorDid: string;
  subjectUri: string;
  subjectCid: string;
  x: number;
  y: number;
  createdAt: string;
};

export async function saveAccount(input: {
  did: string;
  handle?: string | null;
  pdsUrl?: string | null;
}): Promise<void> {
  await getQueryDb()
    .insertInto("account")
    .values({
      did: input.did,
      handle: input.handle ?? null,
      pdsUrl: input.pdsUrl ?? null,
      updatedAt: new Date().toISOString(),
    })
    .onConflict((conflict) =>
      conflict.column("did").doUpdateSet((eb) => ({
        handle: eb.fn.coalesce("excluded.handle", "account.handle"),
        pdsUrl: eb.fn.coalesce("excluded.pdsUrl", "account.pdsUrl"),
        updatedAt: eb.ref("excluded.updatedAt"),
      })),
    )
    .execute();
}

export async function getAccount(did: string): Promise<{
  did: string;
  handle: string | null;
  pdsUrl: string | null;
} | null> {
  const row = await getQueryDb()
    .selectFrom("account")
    .select(["did", "handle", "pdsUrl"])
    .where("did", "=", did)
    .executeTakeFirst();
  return row ?? null;
}

export async function saveBoard(
  spaceUri: string,
  ownerDid: string,
): Promise<void> {
  await getQueryDb()
    .insertInto("board")
    .values({ spaceUri, ownerDid, createdAt: new Date().toISOString() })
    .onConflict((conflict) => conflict.column("spaceUri").doNothing())
    .execute();
}

export async function hasBoard(ownerDid: string): Promise<boolean> {
  const row = await getQueryDb()
    .selectFrom("board")
    .select("ownerDid")
    .where("ownerDid", "=", ownerDid)
    .executeTakeFirst();
  return row !== undefined;
}

export async function listBoards(): Promise<
  Array<{ ownerDid: string; handle: string | null }>
> {
  return getQueryDb()
    .selectFrom("board")
    .leftJoin("account", "account.did", "board.ownerDid")
    .select(["board.ownerDid", "account.handle"])
    .orderBy((eb) => eb.fn.coalesce("account.handle", "board.ownerDid"))
    .execute();
}

export async function saveSpaceWatch(input: {
  spaceUri: string;
  authorityDid: string;
}): Promise<void> {
  await getQueryDb()
    .insertInto("syncSpace")
    .values({
      ...input,
      registrationExpiresAt: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    })
    .onConflict((conflict) =>
      conflict.column("spaceUri").doUpdateSet((eb) => ({
        authorityDid: eb.ref("excluded.authorityDid"),
        updatedAt: eb.ref("excluded.updatedAt"),
      })),
    )
    .execute();
}

export async function listSpaceWatches(): Promise<SpaceWatch[]> {
  return getQueryDb()
    .selectFrom("syncSpace")
    .select([
      "spaceUri",
      "authorityDid",
      "registrationExpiresAt",
      "lastError",
    ])
    .execute();
}

export async function hasSpaceWatch(spaceUri: string): Promise<boolean> {
  const row = await getQueryDb()
    .selectFrom("syncSpace")
    .select("spaceUri")
    .where("spaceUri", "=", spaceUri)
    .executeTakeFirst();
  return row !== undefined;
}

export async function hideSyncedSpace(spaceUri: string): Promise<void> {
  await writeTransaction(getQueryDb(), async (trx) => {
    await trx.deleteFrom("syncSpace").where("spaceUri", "=", spaceUri).execute();
    await trx.deleteFrom("board").where("spaceUri", "=", spaceUri).execute();
  });
}

export async function deleteSyncedSpace(spaceUri: string): Promise<void> {
  const db = getQueryDb();
  const dereferenced = await writeTransaction(db, async (trx) => {
    const blobs = await trx
      .selectFrom("spaceBlob")
      .select("cid")
      .where("spaceUri", "=", spaceUri)
      .execute();
    await trx.deleteFrom("spaceBlob").where("spaceUri", "=", spaceUri).execute();
    await trx
      .deleteFrom("notePosition")
      .where("spaceUri", "=", spaceUri)
      .execute();
    await trx
      .deleteFrom("removal")
      .where("spaceUri", "=", spaceUri)
      .execute();
    await trx.deleteFrom("reaction").where("spaceUri", "=", spaceUri).execute();
    await trx
      .deleteFrom("privateFollow")
      .where("spaceUri", "=", spaceUri)
      .execute();
    await trx.deleteFrom("post").where("spaceUri", "=", spaceUri).execute();
    await trx.deleteFrom("syncRepo").where("spaceUri", "=", spaceUri).execute();
    await trx.deleteFrom("syncSpace").where("spaceUri", "=", spaceUri).execute();
    await trx.deleteFrom("board").where("spaceUri", "=", spaceUri).execute();
    return blobs.map(({ cid }) => cid);
  });
  await deleteUnreferencedBlobFiles(db, dereferenced);
}

export async function updateSpaceWatch(input: {
  spaceUri: string;
  registrationExpiresAt?: string | null;
  lastError?: string | null;
}): Promise<void> {
  await getQueryDb()
    .updateTable("syncSpace")
    .set((eb) => ({
      registrationExpiresAt: eb.fn.coalesce(
        eb.val(input.registrationExpiresAt ?? null),
        "syncSpace.registrationExpiresAt",
      ),
      lastError: input.lastError ?? null,
      updatedAt: new Date().toISOString(),
    }))
    .where("spaceUri", "=", input.spaceUri)
    .execute();
}

export async function getSyncedRepo(
  spaceUri: string,
  repoDid: string,
): Promise<SyncedRepo | null> {
  const row = await getQueryDb()
    .selectFrom("syncRepo")
    .select(["spaceUri", "repoDid", "pdsUrl", "rev", "lthash", "commitHash"])
    .where("spaceUri", "=", spaceUri)
    .where("repoDid", "=", repoDid)
    .executeTakeFirst();
  if (!row) return null;
  const { lthash, commitHash, ...repo } = row;
  return {
    ...repo,
    ltHash: new Uint8Array(lthash),
    commitHash: new Uint8Array(commitHash),
  };
}

export async function saveSyncedRepo(input: SyncedRepo): Promise<void> {
  await getQueryDb()
    .insertInto("syncRepo")
    .values({
      spaceUri: input.spaceUri,
      repoDid: input.repoDid,
      pdsUrl: input.pdsUrl,
      rev: input.rev,
      lthash: input.ltHash,
      commitHash: input.commitHash,
      updatedAt: new Date().toISOString(),
    })
    .onConflict((conflict) =>
      conflict.columns(["spaceUri", "repoDid"]).doUpdateSet((eb) => ({
        pdsUrl: eb.ref("excluded.pdsUrl"),
        rev: eb.ref("excluded.rev"),
        lthash: eb.ref("excluded.lthash"),
        commitHash: eb.ref("excluded.commitHash"),
        updatedAt: eb.ref("excluded.updatedAt"),
      })),
    )
    .execute();
}

export async function deleteSyncedReposExcept(
  spaceUri: string,
  repoDids: ReadonlySet<string>,
): Promise<boolean> {
  const db = getQueryDb();
  const localRepos = await db
    .selectFrom("syncRepo")
    .select("repoDid")
    .where("spaceUri", "=", spaceUri)
    .execute();
  const staleRepoDids = localRepos
    .map(({ repoDid }) => repoDid)
    .filter((repoDid) => !repoDids.has(repoDid));
  if (staleRepoDids.length === 0) return false;

  const dereferenced = await writeTransaction(db, async (trx) => {
    const cids: string[] = [];
    for (const repoDid of staleRepoDids) {
      const blobs = await trx
        .selectFrom("spaceBlob")
        .select("cid")
        .where("spaceUri", "=", spaceUri)
        .where("repoDid", "=", repoDid)
        .execute();
      cids.push(...blobs.map(({ cid }) => cid));
      await trx
        .deleteFrom("spaceBlob")
        .where("spaceUri", "=", spaceUri)
        .where("repoDid", "=", repoDid)
        .execute();
      await trx
        .deleteFrom("post")
        .where("spaceUri", "=", spaceUri)
        .where("authorDid", "=", repoDid)
        .execute();
      await trx
        .deleteFrom("removal")
        .where("spaceUri", "=", spaceUri)
        .where("authorDid", "=", repoDid)
        .execute();
      await trx
        .deleteFrom("reaction")
        .where("spaceUri", "=", spaceUri)
        .where("authorDid", "=", repoDid)
        .execute();
      await trx
        .deleteFrom("privateFollow")
        .where("spaceUri", "=", spaceUri)
        .where("authorDid", "=", repoDid)
        .execute();
      await trx
        .deleteFrom("notePosition")
        .where("spaceUri", "=", spaceUri)
        .where("authorDid", "=", repoDid)
        .execute();
      await trx
        .deleteFrom("syncRepo")
        .where("spaceUri", "=", spaceUri)
        .where("repoDid", "=", repoDid)
        .execute();
    }
    return cids;
  });
  await deleteUnreferencedBlobFiles(db, dereferenced);
  return true;
}

export async function replaceRepoRecords(input: {
  spaceUri: string;
  authorDid: string;
  posts: Array<Omit<PostInput, "spaceUri" | "authorDid">>;
  removals: Array<Omit<RemovalInput, "spaceUri" | "authorDid">>;
  reactions?: Array<Omit<ReactionInput, "spaceUri" | "authorDid">>;
  privateFollows?: Array<
    Omit<PrivateFollowInput, "spaceUri" | "authorDid">
  >;
  positions: Array<Omit<PositionInput, "spaceUri" | "authorDid">>;
  blobs?: SpaceBlob[];
}): Promise<void> {
  const db = getQueryDb();
  const indexedAt = new Date().toISOString();
  const dereferenced = await writeTransaction(db, async (trx) => {
    await trx
      .deleteFrom("post")
      .where("spaceUri", "=", input.spaceUri)
      .where("authorDid", "=", input.authorDid)
      .execute();
    await trx
      .deleteFrom("removal")
      .where("spaceUri", "=", input.spaceUri)
      .where("authorDid", "=", input.authorDid)
      .execute();
    await trx
      .deleteFrom("reaction")
      .where("spaceUri", "=", input.spaceUri)
      .where("authorDid", "=", input.authorDid)
      .execute();
    await trx
      .deleteFrom("privateFollow")
      .where("spaceUri", "=", input.spaceUri)
      .where("authorDid", "=", input.authorDid)
      .execute();
    await trx
      .deleteFrom("notePosition")
      .where("spaceUri", "=", input.spaceUri)
      .where("authorDid", "=", input.authorDid)
      .execute();

    if (input.posts.length > 0) {
      await trx
        .insertInto("post")
        .values(
          input.posts.map((post) =>
            postValues(
              {
                ...post,
                spaceUri: input.spaceUri,
                authorDid: input.authorDid,
              },
              indexedAt,
            ),
          ),
        )
        .execute();
    }
    if (input.removals.length > 0) {
      await trx
        .insertInto("removal")
        .values(
          input.removals.map((removal) =>
            removalValues(
              {
                ...removal,
                spaceUri: input.spaceUri,
                authorDid: input.authorDid,
              },
              indexedAt,
            ),
          ),
        )
        .execute();
    }
    const reactions = latestReactionsBySubject(input.reactions ?? []);
    if (reactions.length > 0) {
      await trx
        .insertInto("reaction")
        .values(
          reactions.map((reaction) => ({
            ...reaction,
            spaceUri: input.spaceUri,
            authorDid: input.authorDid,
            indexedAt,
          })),
        )
        .execute();
    }
    for (const follow of input.privateFollows ?? []) {
      await upsertPrivateFollowWith(trx, {
        ...follow,
        spaceUri: input.spaceUri,
        authorDid: input.authorDid,
      });
    }
    if (input.positions.length > 0) {
      await trx
        .insertInto("notePosition")
        .values(
          input.positions.map((position) => ({
            ...position,
            spaceUri: input.spaceUri,
            authorDid: input.authorDid,
            indexedAt,
          })),
        )
        .execute();
    }
    for (const blob of input.blobs ?? []) {
      await insertSpaceBlob(trx, blob, indexedAt);
    }
    return pruneSpaceBlobs(trx, input.spaceUri, input.authorDid);
  });
  await deleteUnreferencedBlobFiles(db, dereferenced);
}

export async function upsertPost(input: PostInput): Promise<void> {
  await upsertPostWith(getQueryDb(), input);
}

export async function getPost(uri: string): Promise<StoredPost | null> {
  const row = await getQueryDb()
    .selectFrom("post")
    .select([
      "uri",
      "cid",
      "spaceUri",
      "authorDid",
      "text",
      "imageCid",
      "imageMime",
      "imageSize",
      "imageAlt",
      "replyParentUri",
      "replyParentCid",
      "color",
      "rotation",
      "x",
      "y",
      "createdAt",
    ])
    .where("uri", "=", uri)
    .executeTakeFirst();
  return row ?? null;
}

export async function deleteStoredPost(uri: string): Promise<void> {
  const db = getQueryDb();
  const dereferenced = await writeTransaction(db, async (trx) => {
    const row = await trx
      .selectFrom("post")
      .select(["spaceUri", "authorDid"])
      .where("uri", "=", uri)
      .executeTakeFirst();
    await trx.deleteFrom("post").where("uri", "=", uri).execute();
    return row ? pruneSpaceBlobs(trx, row.spaceUri, row.authorDid) : [];
  });
  await deleteUnreferencedBlobFiles(db, dereferenced);
}

export async function upsertPosition(input: PositionInput): Promise<void> {
  await upsertPositionWith(getQueryDb(), input);
}

export type SyncedChange =
  | {
      kind: "delete";
      table:
        | "post"
        | "reaction"
        | "removal"
        | "note_position"
        | "private_follow";
      uri: string;
      spaceUri: string;
      authorDid: string;
    }
  | { kind: "post"; value: PostInput }
  | { kind: "reaction"; value: ReactionInput }
  | { kind: "privateFollow"; value: PrivateFollowInput }
  | { kind: "removal"; value: RemovalInput }
  | { kind: "position"; value: PositionInput };

type SyncedDeleteTable = Extract<
  SyncedChange,
  { kind: "delete" }
>["table"];

export async function applySyncedChanges(
  changes: SyncedChange[],
  blobs: SpaceBlob[] = [],
): Promise<void> {
  const db = getQueryDb();
  const dereferenced = await writeTransaction(db, async (trx) => {
    for (const blob of blobs) await insertSpaceBlob(trx, blob);
    for (const change of changes) {
      if (change.kind === "delete") {
        await deleteSyncedRecord(trx, change.table, change.uri);
      } else if (change.kind === "post") {
        await upsertPostWith(trx, change.value);
      } else if (change.kind === "removal") {
        await upsertRemovalWith(trx, change.value);
      } else if (change.kind === "reaction") {
        await upsertReactionWith(trx, change.value);
      } else if (change.kind === "privateFollow") {
        await upsertPrivateFollowWith(trx, change.value);
      } else {
        await upsertPositionWith(trx, change.value);
      }
    }

    const affected = new Map<string, { spaceUri: string; authorDid: string }>();
    for (const blob of blobs) {
      affected.set(`${blob.spaceUri}\u0000${blob.repoDid}`, {
        spaceUri: blob.spaceUri,
        authorDid: blob.repoDid,
      });
    }
    for (const change of changes) {
      if (
        change.kind === "post" ||
        (change.kind === "delete" && change.table === "post")
      ) {
        const value = change.kind === "post" ? change.value : change;
        affected.set(`${value.spaceUri}\u0000${value.authorDid}`, value);
      }
    }

    const cids: string[] = [];
    for (const { spaceUri, authorDid } of affected.values()) {
      cids.push(...(await pruneSpaceBlobs(trx, spaceUri, authorDid)));
    }
    return cids;
  });
  await deleteUnreferencedBlobFiles(db, dereferenced);
}

export async function upsertRemoval(input: RemovalInput): Promise<void> {
  await upsertRemovalWith(getQueryDb(), input);
}

export async function upsertReaction(input: ReactionInput): Promise<void> {
  await upsertReactionWith(getQueryDb(), input);
}

export async function deleteStoredReaction(uri: string): Promise<void> {
  await getQueryDb().deleteFrom("reaction").where("uri", "=", uri).execute();
}

export async function upsertPrivateFollow(
  input: PrivateFollowInput,
): Promise<void> {
  await upsertPrivateFollowWith(getQueryDb(), input);
}

export async function deleteStoredPrivateFollow(uri: string): Promise<void> {
  await getQueryDb().deleteFrom("privateFollow").where("uri", "=", uri).execute();
}

export type FeedPost = {
  uri: string;
  cid: string;
  authorDid: string;
  authorHandle: string | null;
  text: string;
  replyParentUri: string | null;
  replyParentCid: string | null;
  createdAt: string;
  reactionCount: number;
  viewerReactionUri: string | null;
  viewerReactionEmoji: string | null;
  reactionEmojiCounts: Array<{
    emoji: string;
    count: number;
    actors: Array<{ did: string; handle: string | null }>;
  }>;
  hidden: boolean;
};

export type ReplyNotification = {
  uri: string;
  cid: string;
  ownerDid: string;
  authorDid: string;
  authorHandle: string | null;
  text: string;
  createdAt: string;
  parentUri: string;
  parentCid: string;
  parentText: string;
};

export type ReactionNotification = {
  uri: string;
  ownerDid: string;
  authorDid: string;
  authorHandle: string | null;
  emoji: string;
  createdAt: string;
  postUri: string;
  postText: string;
};

export async function listReplyNotifications(
  viewerDid: string,
): Promise<ReplyNotification[]> {
  const result = await sql<ReplyNotification>`
    SELECT
      reply.uri,
      reply.cid,
      board.owner_did AS ownerDid,
      reply.author_did AS authorDid,
      account.handle AS authorHandle,
      reply.text,
      reply.created_at AS createdAt,
      parent.uri AS parentUri,
      parent.cid AS parentCid,
      parent.text AS parentText
    FROM post reply
    INNER JOIN post parent
      ON parent.uri = reply.reply_parent_uri
    INNER JOIN board
      ON board.space_uri = reply.space_uri
    LEFT JOIN account
      ON account.did = reply.author_did
    WHERE parent.author_did = ${viewerDid}
      AND reply.author_did != ${viewerDid}
    ORDER BY reply.created_at DESC
  `.execute(getQueryDb());
  return result.rows;
}

export async function listReactionNotifications(
  viewerDid: string,
): Promise<ReactionNotification[]> {
  const result = await sql<ReactionNotification>`
    SELECT
      reaction.uri,
      board.owner_did AS ownerDid,
      reaction.author_did AS authorDid,
      account.handle AS authorHandle,
      reaction.emoji,
      reaction.created_at AS createdAt,
      post.uri AS postUri,
      post.text AS postText
    FROM reaction
    INNER JOIN post
      ON post.space_uri = reaction.space_uri
      AND post.uri = reaction.subject_uri
      AND post.cid = reaction.subject_cid
    INNER JOIN board
      ON board.space_uri = reaction.space_uri
    LEFT JOIN account
      ON account.did = reaction.author_did
    WHERE post.author_did = ${viewerDid}
      AND reaction.author_did != ${viewerDid}
    ORDER BY reaction.created_at DESC
  `.execute(getQueryDb());
  return result.rows;
}

export async function listFeedPosts(
  spaceUri: string,
  authorityDid: string,
  viewerDid: string,
): Promise<FeedPost[]> {
  const result = await sql<
    Omit<FeedPost, "hidden" | "reactionEmojiCounts"> & { hidden: number }
  >`
    SELECT
      p.uri,
      p.cid,
      p.author_did AS authorDid,
      a.handle AS authorHandle,
      p.text,
      p.reply_parent_uri AS replyParentUri,
      p.reply_parent_cid AS replyParentCid,
      p.created_at AS createdAt,
      COUNT(DISTINCT reaction.uri) AS reactionCount,
      MAX(CASE WHEN reaction.author_did = ${viewerDid} THEN reaction.uri END) AS viewerReactionUri,
      MAX(CASE WHEN reaction.author_did = ${viewerDid} THEN reaction.emoji END) AS viewerReactionEmoji,
      EXISTS (
        SELECT 1 FROM removal
        WHERE removal.space_uri = p.space_uri
          AND removal.author_did = ${authorityDid}
          AND removal.subject_uri = p.uri
      ) AS hidden
    FROM post p
    LEFT JOIN account a ON a.did = p.author_did
    LEFT JOIN reaction
      ON reaction.space_uri = p.space_uri
      AND reaction.subject_uri = p.uri
      AND reaction.subject_cid = p.cid
    WHERE p.space_uri = ${spaceUri}
    GROUP BY p.uri
    ORDER BY p.created_at DESC
  `.execute(getQueryDb());
  const reactions = await getQueryDb()
    .selectFrom("reaction")
    .innerJoin("post", (join) =>
      join
        .onRef("post.spaceUri", "=", "reaction.spaceUri")
        .onRef("post.uri", "=", "reaction.subjectUri")
        .onRef("post.cid", "=", "reaction.subjectCid"),
    )
    .leftJoin("account", "account.did", "reaction.authorDid")
    .select([
      "reaction.subjectUri",
      "reaction.emoji",
      "reaction.authorDid",
      "account.handle as authorHandle",
    ])
    .where("reaction.spaceUri", "=", spaceUri)
    .orderBy("reaction.createdAt", "asc")
    .execute();
  const countsByPost = new Map<
    string,
    Map<
      string,
      {
        emoji: string;
        count: number;
        actors: Array<{ did: string; handle: string | null }>;
      }
    >
  >();
  for (const reaction of reactions) {
    const postCounts = countsByPost.get(reaction.subjectUri) ?? new Map();
    const summary = postCounts.get(reaction.emoji) ?? {
      emoji: reaction.emoji,
      count: 0,
      actors: [],
    };
    summary.count += 1;
    summary.actors.push({
      did: reaction.authorDid,
      handle: reaction.authorHandle,
    });
    postCounts.set(reaction.emoji, summary);
    countsByPost.set(reaction.subjectUri, postCounts);
  }
  return result.rows.map((row) => ({
    ...row,
    reactionCount: Number(row.reactionCount),
    reactionEmojiCounts: [...(countsByPost.get(row.uri)?.values() ?? [])]
      .sort(
        (left, right) =>
          right.count - left.count || left.emoji.localeCompare(right.emoji),
      ),
    hidden: row.hidden === 1,
  }));
}

type BoardPostRow = Omit<BoardPost, "hidden" | "color" | "rotation"> & {
  x: number | null;
  y: number | null;
  color: NoteColor | null;
  rotation: number | null;
  hidden: number;
};

export async function listBoardPosts(
  spaceUri: string,
  authorityDid: string,
): Promise<BoardPost[]> {
  const result = await sql<BoardPostRow>`
    SELECT
      p.uri,
      p.cid,
      p.space_uri AS spaceUri,
      p.author_did AS authorDid,
      a.handle AS authorHandle,
      p.text,
      p.image_cid AS imageCid,
      p.image_mime AS imageMime,
      p.image_size AS imageSize,
      p.image_alt AS imageAlt,
      p.reply_parent_uri AS replyParentUri,
      p.reply_parent_cid AS replyParentCid,
      p.color,
      p.rotation,
      COALESCE(np.x, p.x) AS x,
      COALESCE(np.y, p.y) AS y,
      p.created_at AS createdAt,
      EXISTS (
        SELECT 1
        FROM removal r
        WHERE r.space_uri = p.space_uri
          AND r.author_did = ${authorityDid}
          AND r.subject_uri = p.uri
      ) AS hidden
    FROM post p
    LEFT JOIN account a ON a.did = p.author_did
    LEFT JOIN note_position np ON np.uri = (
      SELECT position.uri
      FROM note_position position
      WHERE position.space_uri = p.space_uri
        AND position.author_did = ${authorityDid}
        AND position.subject_uri = p.uri
        AND position.subject_cid = p.cid
      ORDER BY position.created_at DESC, position.uri DESC
      LIMIT 1
    )
    WHERE p.space_uri = ${spaceUri}
    ORDER BY p.created_at DESC
  `.execute(getQueryDb());

  return result.rows.map((row) => {
    const fallback = fallbackPosition(row.uri);
    const style = fallbackNoteStyle(row.uri);
    return {
      ...row,
      x: row.x ?? fallback.x,
      y: row.y ?? fallback.y,
      color: row.color ?? style.color,
      rotation: row.rotation ?? style.rotation,
      hidden: row.hidden === 1,
    };
  });
}

export async function getSpaceBlob(
  spaceUri: string,
  repoDid: string,
  cid: string,
): Promise<SpaceBlob | null> {
  const row = await getQueryDb()
    .selectFrom("spaceBlob")
    .select(["spaceUri", "repoDid", "cid", "mimeType", "size"])
    .where("spaceUri", "=", spaceUri)
    .where("repoDid", "=", repoDid)
    .where("cid", "=", cid)
    .executeTakeFirst();
  return row ?? null;
}

export async function getReferencedSpaceBlob(
  spaceUri: string,
  repoDid: string,
  cid: string,
): Promise<SpaceBlob | null> {
  const blob = await getSpaceBlob(spaceUri, repoDid, cid);
  if (!blob) return null;
  const referenced = await getQueryDb()
    .selectFrom("post")
    .select("uri")
    .where("spaceUri", "=", spaceUri)
    .where("authorDid", "=", repoDid)
    .where("imageCid", "=", cid)
    .executeTakeFirst();
  return referenced ? blob : null;
}

async function upsertPostWith(
  db: DatabaseConnection,
  input: PostInput,
): Promise<void> {
  await db
    .insertInto("post")
    .values(postValues(input))
    .onConflict((conflict) =>
      conflict.column("uri").doUpdateSet((eb) => ({
        cid: eb.ref("excluded.cid"),
        text: eb.ref("excluded.text"),
        imageCid: eb.ref("excluded.imageCid"),
        imageMime: eb.ref("excluded.imageMime"),
        imageSize: eb.ref("excluded.imageSize"),
        imageAlt: eb.ref("excluded.imageAlt"),
        replyParentUri: eb.ref("excluded.replyParentUri"),
        replyParentCid: eb.ref("excluded.replyParentCid"),
        color: eb.ref("excluded.color"),
        rotation: eb.ref("excluded.rotation"),
        x: eb.ref("excluded.x"),
        y: eb.ref("excluded.y"),
        createdAt: eb.ref("excluded.createdAt"),
        indexedAt: eb.ref("excluded.indexedAt"),
      })),
    )
    .execute();
}

async function upsertPositionWith(
  db: DatabaseConnection,
  input: PositionInput,
): Promise<void> {
  await db
    .insertInto("notePosition")
    .values({ ...input, indexedAt: new Date().toISOString() })
    .onConflict((conflict) =>
      conflict.column("uri").doUpdateSet((eb) => ({
        cid: eb.ref("excluded.cid"),
        subjectCid: eb.ref("excluded.subjectCid"),
        x: eb.ref("excluded.x"),
        y: eb.ref("excluded.y"),
        createdAt: eb.ref("excluded.createdAt"),
        indexedAt: eb.ref("excluded.indexedAt"),
      })),
    )
    .execute();
}

async function upsertRemovalWith(
  db: DatabaseConnection,
  input: RemovalInput,
): Promise<void> {
  await db
    .insertInto("removal")
    .values(removalValues(input))
    .onConflict((conflict) =>
      conflict.column("uri").doUpdateSet((eb) => ({
        cid: eb.ref("excluded.cid"),
        subjectUri: eb.ref("excluded.subjectUri"),
        subjectCid: eb.ref("excluded.subjectCid"),
        createdAt: eb.ref("excluded.createdAt"),
        indexedAt: eb.ref("excluded.indexedAt"),
      })),
    )
    .execute();
}

async function upsertReactionWith(
  db: DatabaseConnection,
  input: ReactionInput,
): Promise<void> {
  await db.deleteFrom("reaction").where("uri", "=", input.uri).execute();
  await db
    .insertInto("reaction")
    .values({ ...input, indexedAt: new Date().toISOString() })
    .onConflict((conflict) =>
      conflict.columns(["spaceUri", "authorDid", "subjectUri"]).doUpdateSet((eb) => ({
        uri: eb.ref("excluded.uri"),
        cid: eb.ref("excluded.cid"),
        subjectCid: eb.ref("excluded.subjectCid"),
        emoji: eb.ref("excluded.emoji"),
        createdAt: eb.ref("excluded.createdAt"),
        indexedAt: eb.ref("excluded.indexedAt"),
      })),
    )
    .execute();
}

function latestReactionsBySubject<T extends {
  uri: string;
  subjectUri: string;
  createdAt: string;
}>(reactions: T[]): T[] {
  const latest = new Map<string, T>();
  for (const reaction of reactions) {
    const current = latest.get(reaction.subjectUri);
    if (
      !current ||
      reaction.createdAt > current.createdAt ||
      (
        reaction.createdAt === current.createdAt &&
        reaction.uri > current.uri
      )
    ) {
      latest.set(reaction.subjectUri, reaction);
    }
  }
  return [...latest.values()];
}

async function upsertPrivateFollowWith(
  db: DatabaseConnection,
  input: PrivateFollowInput,
): Promise<void> {
  await db
    .insertInto("privateFollow")
    .values({ ...input, indexedAt: new Date().toISOString() })
    .onConflict((conflict) =>
      conflict.columns(["authorDid", "subjectDid"]).doUpdateSet((eb) => ({
        uri: eb.ref("excluded.uri"),
        cid: eb.ref("excluded.cid"),
        spaceUri: eb.ref("excluded.spaceUri"),
        createdAt: eb.ref("excluded.createdAt"),
        indexedAt: eb.ref("excluded.indexedAt"),
      })),
    )
    .execute();
}

async function deleteSyncedRecord(
  db: DatabaseConnection,
  table: SyncedDeleteTable,
  uri: string,
): Promise<void> {
  if (table === "post") {
    await db.deleteFrom("post").where("uri", "=", uri).execute();
  } else if (table === "removal") {
    await db.deleteFrom("removal").where("uri", "=", uri).execute();
  } else if (table === "reaction") {
    await db.deleteFrom("reaction").where("uri", "=", uri).execute();
  } else if (table === "private_follow") {
    await db.deleteFrom("privateFollow").where("uri", "=", uri).execute();
  } else {
    await db.deleteFrom("notePosition").where("uri", "=", uri).execute();
  }
}

async function insertSpaceBlob(
  db: DatabaseConnection,
  blob: SpaceBlob,
  updatedAt = new Date().toISOString(),
): Promise<void> {
  await db
    .insertInto("spaceBlob")
    .values({ ...blob, updatedAt })
    .onConflict((conflict) =>
      conflict.columns(["spaceUri", "repoDid", "cid"]).doUpdateSet((eb) => ({
        mimeType: eb.ref("excluded.mimeType"),
        size: eb.ref("excluded.size"),
        updatedAt: eb.ref("excluded.updatedAt"),
      })),
    )
    .execute();
}

async function pruneSpaceBlobs(
  db: DatabaseConnection,
  spaceUri: string,
  repoDid: string,
): Promise<string[]> {
  const unreferenced = sql<boolean>`NOT EXISTS (
    SELECT 1 FROM post
    WHERE post.space_uri = space_blob.space_uri
      AND post.author_did = space_blob.repo_did
      AND post.image_cid = space_blob.cid
  )`;
  const blobs = await db
    .selectFrom("spaceBlob")
    .select("cid")
    .where("spaceUri", "=", spaceUri)
    .where("repoDid", "=", repoDid)
    .where(unreferenced)
    .execute();
  await db
    .deleteFrom("spaceBlob")
    .where("spaceUri", "=", spaceUri)
    .where("repoDid", "=", repoDid)
    .where(unreferenced)
    .execute();
  return blobs.map(({ cid }) => cid);
}

async function deleteUnreferencedBlobFiles(
  db: DatabaseConnection,
  cids: string[],
): Promise<void> {
  const uniqueCids = [...new Set(cids)];
  if (uniqueCids.length === 0) return;
  const referenced = await db
    .selectFrom("spaceBlob")
    .select("cid")
    .where("cid", "in", uniqueCids)
    .execute();
  const referencedCids = new Set(referenced.map(({ cid }) => cid));
  for (const cid of uniqueCids) {
    if (referencedCids.has(cid)) continue;
    try {
      deleteBlobFile(cid);
    } catch (error) {
      console.error(`Could not delete dereferenced image ${cid}`, error);
    }
  }
}

function postValues(input: PostInput, indexedAt = new Date().toISOString()) {
  return {
    uri: input.uri,
    cid: input.cid,
    spaceUri: input.spaceUri,
    authorDid: input.authorDid,
    text: input.text,
    imageCid: input.image?.cid ?? null,
    imageMime: input.image?.mimeType ?? null,
    imageSize: input.image?.size ?? null,
    imageAlt: input.image?.alt ?? null,
    replyParentUri: input.replyParentUri ?? null,
    replyParentCid: input.replyParentCid ?? null,
    color: input.color ?? null,
    rotation: input.rotation ?? null,
    x: input.x ?? null,
    y: input.y ?? null,
    createdAt: input.createdAt,
    indexedAt,
  };
}

function removalValues(
  input: RemovalInput,
  indexedAt = new Date().toISOString(),
) {
  return {
    uri: input.uri,
    cid: input.cid,
    spaceUri: input.spaceUri,
    authorDid: input.authorDid,
    subjectUri: input.subjectUri,
    subjectCid: input.subjectCid,
    createdAt: input.createdAt,
    indexedAt,
  };
}

function fallbackPosition(uri: string): { x: number; y: number } {
  let hash = 2166136261;
  for (const char of uri) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  const value = hash >>> 0;
  return {
    x: 40 + (value % 720),
    y: 35 + (Math.floor(value / 997) % 780),
  };
}
