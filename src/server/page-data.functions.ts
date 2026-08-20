import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { cacheIdentity, resolveHandle } from "@/lib/atproto/identity";
import { getProfile, type Profile } from "@/lib/atproto/profile";
import { getSessionFromToken } from "@/lib/auth/session";
import { WEB_SESSION_COOKIE_NAME } from "@/lib/auth/web-session";
import { getBulletinCapabilities } from "@/lib/auth/bulletin-capabilities";
import { discoverBoardForDid } from "@/lib/board-discovery";
import { boardUri } from "@/lib/config";
import { paginateFeedThreads } from "@/lib/feed-pagination";
import {
  getAccount,
  getPost,
  hasBoard,
  hasSpaceWatch,
  listFeedPosts,
  listReactionNotifications,
  listReplyNotifications,
} from "@/lib/db/queries";
import {
  postOwnerDid,
  postUriFromPath,
  postUriFromRouteId,
} from "@/lib/post-route";
import {
  canAccessFeed,
  getPrivateFollowRelationship,
  listIncomingFollows,
  listPrivateFollowers,
  listPrivateFollowing,
} from "@/lib/follows";

const currentSession = createServerOnlyFn(async () => {
  return getSessionFromToken(getCookie(WEB_SESSION_COOKIE_NAME));
});

export const getHomeData = createServerFn({ method: "GET" }).handler(async () => {
  const session = await currentSession();
  if (!session) return { viewer: null };
  await cacheIdentity(session.did).catch(() => undefined);
  const [account, capabilities, page] = await Promise.all([
    getAccount(session.did),
    getBulletinCapabilities(session, session.did).catch(() => null),
    homeFeedPage(session, null),
  ]);
  return {
    viewer: { did: session.did, handle: account?.handle ?? null },
    canCreateFeed: capabilities?.canCreateBoard === true,
    canWrite: capabilities?.canCreateNote === true,
    ...page,
  };
});

export const getHomeFeedPage = createServerFn({ method: "GET" })
  .validator((input: { cursor: string }) => input)
  .handler(async ({ data }) => {
    const session = await currentSession();
    if (!session) {
      return {
        posts: [],
        nextCursor: null,
        feedOwnerDids: [],
        ownFeedExists: false,
      };
    }
    return homeFeedPage(session, data.cursor);
  });

type CurrentSession = NonNullable<Awaited<ReturnType<typeof currentSession>>>;

async function homeFeedPage(
  session: CurrentSession,
  cursor: string | null,
) {
  const following = await listPrivateFollowing(session.did);
  const mutualDids = following
    .filter(({ mutual }) => mutual)
    .map(({ ownerDid }) => ownerDid);
  const feedOwners = [session.did, ...mutualDids];
  const availableOwners = (
    await Promise.all(
      feedOwners.map(async (ownerDid) =>
        (await ensureBoardKnown(ownerDid)) ? ownerDid : null,
      ),
    )
  ).filter((ownerDid): ownerDid is string => ownerDid !== null);
  const feedRows = (
    await Promise.all(
      availableOwners.map(async (ownerDid) =>
        (await listFeedPosts(boardUri(ownerDid), ownerDid, session.did))
          .filter((post) => !post.hidden || post.authorDid === session.did)
          .filter((post) => post.replyParentUri || post.authorDid === ownerDid)
          .map((post) => ({ ...post, feedOwnerDid: ownerDid })),
      ),
    )
  ).flat();
  const page = paginateFeedThreads(feedRows, cursor);
  const authorProfiles = await profileMap(
    page.posts.map(({ authorDid }) => authorDid),
  );
  return {
    ownFeedExists: availableOwners.includes(session.did),
    feedOwnerDids: availableOwners,
    nextCursor: page.nextCursor,
    posts: page.posts.map((post) => ({
      ...post,
      author: authorProfiles.get(post.authorDid) ?? null,
    })),
  };
}

export const getNotificationsData = createServerFn({ method: "GET" })
  .handler(async () => {
    const session = await currentSession();
    if (!session) return { viewer: null };
    await cacheIdentity(session.did).catch(() => undefined);
    const [account, incoming, replies, reactions, capabilities] = await Promise.all([
      getAccount(session.did),
      listIncomingFollows(session.did),
      listReplyNotifications(session.did),
      listReactionNotifications(session.did),
      getBulletinCapabilities(session, session.did).catch(() => null),
    ]);
    const profiles = await profileMap([
      ...incoming.map(({ requesterDid }) => requesterDid),
      ...replies.map(({ authorDid }) => authorDid),
      ...reactions.map(({ authorDid }) => authorDid),
    ]);
    return {
      viewer: { did: session.did, handle: account?.handle ?? null },
      canManageFollows: capabilities?.canManageFollows === true,
      canWrite: capabilities?.canCreateNote === true,
      incoming: incoming.map((follow) => ({
        ...follow,
        profile: profiles.get(follow.requesterDid) ?? null,
      })),
      replies: replies.map((reply) => ({
        ...reply,
        author: profiles.get(reply.authorDid) ?? null,
      })),
      reactions: reactions.map((reaction) => ({
        ...reaction,
        author: profiles.get(reaction.authorDid) ?? null,
      })),
    };
  });

export const getPostPageData = createServerFn({ method: "GET" })
  .validator((input: { postRef: string }) => input)
  .handler(async ({ data }) => {
    const session = await currentSession();
    if (!session) return { kind: "signedOut" as const };

    const uri =
      postUriFromPath(data.postRef) ?? postUriFromRouteId(data.postRef);
    const ownerDid = uri ? postOwnerDid(uri) : null;
    if (!uri || !ownerDid || !(await canAccessFeed(session.did, ownerDid))) {
      return { kind: "unavailable" as const, viewerHandle: null };
    }

    await Promise.all([
      cacheIdentity(session.did).catch(() => undefined),
      ensureBoardKnown(ownerDid),
    ]);
    const target = await getPost(uri);
    if (!target || target.spaceUri !== boardUri(ownerDid)) {
      return {
        kind: "unavailable" as const,
        viewerHandle: (await getAccount(session.did))?.handle ?? null,
      };
    }

    const [account, capabilities, feedPosts] = await Promise.all([
      getAccount(session.did),
      getBulletinCapabilities(session, ownerDid).catch(() => null),
      listFeedPosts(boardUri(ownerDid), ownerDid, session.did),
    ]);
    const posts = feedPosts.filter(
      (post) => !post.hidden || post.authorDid === session.did,
    );
    const profiles = await profileMap(posts.map(({ authorDid }) => authorDid));
    return {
      kind: "post" as const,
      viewer: { did: session.did, handle: account?.handle ?? null },
      ownerDid,
      targetUri: uri,
      canWrite: capabilities?.canCreateNote === true,
      posts: posts.map((post) => ({
        ...post,
        feedOwnerDid: ownerDid,
        author: profiles.get(post.authorDid) ?? null,
      })),
    };
  });

export const getProfilePageData = createServerFn({ method: "GET" })
  .validator((input: { handle: string }) => input)
  .handler(async ({ data }) => {
    const cleanHandle = data.handle.replace(/^@/, "");
    const ownerDid = await resolveHandle(cleanHandle);
    const session = await currentSession();
    if (!ownerDid) return { kind: "missing" as const, viewerDid: session?.did ?? null };

    await cacheIdentity(ownerDid).catch(() => undefined);
    const [ownerAccount, ownerProfile] = await Promise.all([
      getAccount(ownerDid),
      getProfile(ownerDid),
    ]);
    const owner = {
      did: ownerDid,
      handle: ownerProfile?.handle ?? ownerAccount?.handle ?? cleanHandle,
      displayName: ownerProfile?.displayName ?? null,
      avatar: ownerProfile?.avatar ?? null,
    };
    if (!session) return { kind: "signedOut" as const, owner };

    await cacheIdentity(session.did).catch(() => undefined);
    const viewerHandle = (await getAccount(session.did))?.handle ?? null;
    const ownFeed = session.did === ownerDid;
    const capabilities = await getBulletinCapabilities(session, ownerDid).catch(() => null);
    const relationship = await getPrivateFollowRelationship(session.did, ownerDid);
    if (!ownFeed && !relationship.mutual) {
      return {
        kind: "locked" as const,
        owner,
        viewerDid: session.did,
        viewerHandle,
        relationship,
        canManageFollows: capabilities?.canManageFollows === true,
      };
    }

    const exists = await ensureBoardKnown(ownerDid);
    if (!exists) {
      return {
        kind: ownFeed ? "setup" as const : "missing" as const,
        owner,
        viewerDid: session.did,
        viewerHandle,
        incompatiblePds:
          ownFeed &&
          (capabilities?.canCreateBoard === false ||
            capabilities?.canManageFollows === false),
      };
    }

    const posts = (await listFeedPosts(boardUri(ownerDid), ownerDid, session.did))
      .filter((post) => !post.hidden || post.authorDid === session.did);
    const authorProfiles = new Map<string, Profile | null>();
    await Promise.all(
      [...new Set(posts.map((post) => post.authorDid))].map(async (did) => {
        authorProfiles.set(did, did === ownerDid ? ownerProfile : await getProfile(did));
      }),
    );
    const [incoming, followers, following] = ownFeed
      ? await Promise.all([
          listIncomingFollows(ownerDid),
          listPrivateFollowers(ownerDid),
          listPrivateFollowing(ownerDid),
        ])
      : [[], [], []];
    const incomingWithProfiles = await Promise.all(
      incoming.map(async (request) => ({
        ...request,
        profile: await getProfile(request.requesterDid),
      })),
    );

    return {
      kind: "feed" as const,
      owner,
      viewerDid: session.did,
      viewerHandle,
      ownFeed,
      canWrite: capabilities?.canCreateNote === true,
      canManageFollows: capabilities?.canManageFollows === true,
      relationship,
      posts: posts.map((post) => ({
        ...post,
        feedOwnerDid: ownerDid,
        author: authorProfiles.get(post.authorDid) ?? null,
      })),
      incoming: incomingWithProfiles,
      followerCount: followers.length,
      followingCount: following.length,
    };
  });

async function ensureBoardKnown(ownerDid: string): Promise<boolean> {
  let exists = await hasBoard(ownerDid);
  if (!exists || !(await hasSpaceWatch(boardUri(ownerDid)))) {
    exists = await discoverBoardForDid(ownerDid).catch(() => hasBoard(ownerDid));
  }
  return exists;
}

async function profileMap(dids: readonly string[]): Promise<Map<string, Profile | null>> {
  const profiles = new Map<string, Profile | null>();
  await Promise.all(
    [...new Set(dids)].map(async (did) => {
      profiles.set(did, await getProfile(did));
    }),
  );
  return profiles;
}
