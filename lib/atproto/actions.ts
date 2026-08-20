import { Client } from "@atproto/lex-client";
import { asStringFormat } from "@atproto/lex-schema";
import type { OAuthSession } from "@atproto/oauth-client-node";
import {
  CONNECTIONS_SPACE_TYPE,
  FOLLOW_COLLECTION,
  POST_COLLECTION,
  REACTION_COLLECTION,
  REMOVAL_COLLECTION,
  SPACE_TYPE,
  boardUri,
  connectionsUri,
  getConfig,
} from "../config";
import {
  applySyncedChanges,
  deleteStoredPost,
  deleteStoredPrivateFollow,
  deleteStoredReaction,
  getPost,
  hasBoard,
  hasSpaceWatch,
  saveBoard,
  upsertReaction,
  upsertPrivateFollow,
  upsertRemoval,
} from "../db/queries";
import {
  canAccessFeed,
  getPrivateFollowRecord,
} from "../follows";
import { com } from "../lexicons";
import { reactionEmoji } from "../reaction-emoji";
import { discoverSpace } from "../sync/client";

export type FeedSpaceDependencies = {
  ensureConnectionsSpace(session: OAuthSession): Promise<string>;
  hasBoard(ownerDid: string): Promise<boolean>;
  discoverSpace(space: string): Promise<boolean>;
  createSpace(session: OAuthSession): Promise<string>;
  saveBoard(space: string, ownerDid: string): Promise<void>;
};

const feedSpaceDependencies: FeedSpaceDependencies = {
  ensureConnectionsSpace,
  hasBoard,
  discoverSpace,
  createSpace: createFeedSpace,
  saveBoard,
};

export async function createBoard(
  session: OAuthSession,
  dependencies: FeedSpaceDependencies = feedSpaceDependencies,
): Promise<string> {
  await dependencies.ensureConnectionsSpace(session);
  const space = boardUri(session.did);
  if (await dependencies.hasBoard(session.did)) return space;
  if (await dependencies.discoverSpace(space)) {
    await dependencies.saveBoard(space, session.did);
    return space;
  }
  try {
    const createdSpace = await dependencies.createSpace(session);
    await dependencies.saveBoard(createdSpace, session.did);
    return createdSpace;
  } catch (error) {
    if (await dependencies.discoverSpace(space)) {
      await dependencies.saveBoard(space, session.did);
      return space;
    }
    throw error;
  }
}

async function createFeedSpace(session: OAuthSession): Promise<string> {
  const result = await new Client(session).call(
    com.atproto.simplespace.createSpace,
    {
      type: SPACE_TYPE,
      skey: "self",
      policy: {
        $type: "com.atproto.simplespace.defs#managingAppPolicy",
        managingApp: getConfig().managingAppService,
      },
      appAccess: { $type: "com.atproto.simplespace.defs#open" },
    },
  );
  return result.uri;
}

export async function createPrivateFollow(
  session: OAuthSession,
  subjectDid: string,
): Promise<string> {
  if (subjectDid === session.did) throw new Error("You already own this account");
  await ensureConnectionsSpace(session);
  const existing = await getPrivateFollowRecord(session.did, subjectDid);
  if (existing) return existing.uri;
  const space = connectionsUri(session.did);
  const createdAt = new Date().toISOString();
  const result = await new Client(session).call(com.atproto.space.createRecord, {
    space: asStringFormat(space, "space-ref"),
    repo: session.did,
    collection: FOLLOW_COLLECTION,
    validate: false,
    record: {
      $type: FOLLOW_COLLECTION,
      subject: subjectDid,
      createdAt,
    },
  });
  await upsertPrivateFollow({
    uri: result.uri,
    cid: result.cid,
    spaceUri: space,
    authorDid: session.did,
    subjectDid,
    createdAt,
  });
  return result.uri;
}

export async function deletePrivateFollow(
  session: OAuthSession,
  subjectDid: string,
): Promise<void> {
  const follow = await getPrivateFollowRecord(session.did, subjectDid);
  if (!follow) return;
  const space = connectionsUri(session.did);
  await new Client(session).call(com.atproto.space.deleteRecord, {
    space: asStringFormat(space, "space-ref"),
    repo: session.did,
    collection: FOLLOW_COLLECTION,
    rkey: recordKey(follow.uri, space, session.did, FOLLOW_COLLECTION),
  });
  await deleteStoredPrivateFollow(follow.uri);
}

export async function createPost(
  session: OAuthSession,
  ownerDid: string,
  text: string,
  reply?: { uri: string; cid: string },
): Promise<string> {
  await assertCanInteract(session.did, ownerDid);
  if (reply) await assertPostTarget(ownerDid, reply.uri, reply.cid);
  const space = asStringFormat(boardUri(ownerDid), "space-ref");
  const createdAt = new Date().toISOString();
  const result = await new Client(session).call(com.atproto.space.createRecord, {
    space,
    repo: session.did,
    collection: POST_COLLECTION,
    validate: false,
    record: {
      $type: POST_COLLECTION,
      text,
      ...(reply ? { reply: { parent: reply } } : {}),
      createdAt,
    },
  });
  await applySyncedChanges([{
    kind: "post",
    value: {
      uri: result.uri,
      cid: result.cid,
      spaceUri: space,
      authorDid: session.did,
      text,
      replyParentUri: reply?.uri,
      replyParentCid: reply?.cid,
      createdAt,
    },
  }]);
  return result.uri;
}

export async function deleteOwnPost(
  session: OAuthSession,
  input: { ownerDid: string; postUri: string; postCid: string },
): Promise<void> {
  const post = await getPost(input.postUri);
  const space = boardUri(input.ownerDid);
  if (!post || post.spaceUri !== space || post.cid !== input.postCid) {
    throw new Error("That post has changed");
  }
  if (session.did !== post.authorDid) throw new Error("You can only delete your own posts");
  await new Client(session).call(com.atproto.space.deleteRecord, {
    space: asStringFormat(space, "space-ref"),
    repo: session.did,
    collection: POST_COLLECTION,
    rkey: recordKey(input.postUri, space, session.did, POST_COLLECTION),
  });
  await deleteStoredPost(input.postUri);
}

export async function createReaction(
  session: OAuthSession,
  input: {
    ownerDid: string;
    postUri: string;
    postCid: string;
    emoji?: unknown;
  },
): Promise<string> {
  await assertCanInteract(session.did, input.ownerDid);
  await assertPostTarget(input.ownerDid, input.postUri, input.postCid);
  const space = asStringFormat(boardUri(input.ownerDid), "space-ref");
  const createdAt = new Date().toISOString();
  const emoji = reactionEmoji(input.emoji);
  const result = await new Client(session).call(com.atproto.space.createRecord, {
    space,
    repo: session.did,
    collection: REACTION_COLLECTION,
    validate: false,
    record: {
      $type: REACTION_COLLECTION,
      subject: { uri: input.postUri, cid: input.postCid },
      emoji,
      createdAt,
    },
  });
  await upsertReaction({
    uri: result.uri,
    cid: result.cid,
    spaceUri: space,
    authorDid: session.did,
    subjectUri: input.postUri,
    subjectCid: input.postCid,
    emoji,
    createdAt,
  });
  return result.uri;
}

export async function deleteReaction(
  session: OAuthSession,
  input: { ownerDid: string; reactionUri: string },
): Promise<void> {
  const space = boardUri(input.ownerDid);
  await new Client(session).call(com.atproto.space.deleteRecord, {
    space: asStringFormat(space, "space-ref"),
    repo: session.did,
    collection: REACTION_COLLECTION,
    rkey: recordKey(input.reactionUri, space, session.did, REACTION_COLLECTION),
  });
  await deleteStoredReaction(input.reactionUri);
}

export async function removePostFromBoard(
  session: OAuthSession,
  input: { ownerDid: string; postUri: string; postCid: string },
): Promise<string> {
  if (session.did !== input.ownerDid) throw new Error("Only the feed owner can moderate");
  const space = asStringFormat(boardUri(input.ownerDid), "space-ref");
  const createdAt = new Date().toISOString();
  const result = await new Client(session).call(com.atproto.space.createRecord, {
    space,
    repo: session.did,
    collection: REMOVAL_COLLECTION,
    validate: false,
    record: {
      $type: REMOVAL_COLLECTION,
      subject: { uri: input.postUri, cid: input.postCid },
      createdAt,
    },
  });
  await upsertRemoval({
    uri: result.uri,
    cid: result.cid,
    spaceUri: space,
    authorDid: session.did,
    subjectUri: input.postUri,
    subjectCid: input.postCid,
    createdAt,
  });
  return result.uri;
}

async function assertCanInteract(userDid: string, ownerDid: string): Promise<void> {
  if (!(await hasBoard(ownerDid))) throw new Error("Feed does not exist");
  if (!(await canAccessFeed(userDid, ownerDid))) throw new Error("A mutual private follow is required");
}

async function ensureConnectionsSpace(session: OAuthSession): Promise<string> {
  const space = connectionsUri(session.did);
  if (await hasSpaceWatch(space)) return space;
  if (await discoverSpace(space)) return space;
  const result = await new Client(session).call(
    com.atproto.simplespace.createSpace,
    {
      type: CONNECTIONS_SPACE_TYPE,
      skey: "self",
      policy: {
        $type: "com.atproto.simplespace.defs#managingAppPolicy",
        managingApp: getConfig().managingAppService,
      },
      appAccess: { $type: "com.atproto.simplespace.defs#open" },
    },
  );
  await discoverSpace(result.uri);
  return result.uri;
}

async function assertPostTarget(
  ownerDid: string,
  postUri: string,
  postCid: string,
): Promise<void> {
  const post = await getPost(postUri);
  if (
    !post ||
    post.spaceUri !== boardUri(ownerDid) ||
    post.cid !== postCid
  ) {
    throw new Error("That post is not available in this feed");
  }
}

function recordKey(uri: string, space: string, authorDid: string, collection: string) {
  const prefix = `${space}/${authorDid}/${collection}/`;
  if (!uri.startsWith(prefix)) throw new Error("Invalid record reference");
  const rkey = uri.slice(prefix.length);
  if (!rkey || rkey.includes("/")) throw new Error("Invalid record reference");
  return rkey;
}
