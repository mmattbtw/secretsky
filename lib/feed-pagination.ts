export const HOME_FEED_PAGE_SIZE = 50;
export const HOME_FEED_REPLY_PREVIEW_SIZE = 2;

type ThreadPost = {
  uri: string;
  feedOwnerDid: string;
  authorDid: string;
  replyParentUri: string | null;
  createdAt: string;
};

export type FeedPagePost<T extends ThreadPost> = T & {
  threadActivityAt?: string;
  threadReplyCount?: number;
};

export type FeedPage<T extends ThreadPost> = {
  posts: Array<FeedPagePost<T>>;
  nextCursor: string | null;
};

export function paginateFeedThreads<T extends ThreadPost>(
  posts: readonly T[],
  cursor?: string | null,
  pageSize = HOME_FEED_PAGE_SIZE,
  replyPreviewSize = HOME_FEED_REPLY_PREVIEW_SIZE,
): FeedPage<T> {
  const postsByUri = new Map(posts.map((post) => [post.uri, post]));
  const rootsByPost = new Map<string, T | null>();
  const threads = new Map<string, { root: T; replies: T[]; activityAt: string }>();

  for (const post of posts) {
    const root = findRoot(post, postsByUri, rootsByPost);
    if (!root) continue;
    const thread = threads.get(root.uri) ?? {
      root,
      replies: [],
      activityAt: root.createdAt,
    };
    if (post.uri !== root.uri) thread.replies.push(post);
    if (post.createdAt > thread.activityAt) thread.activityAt = post.createdAt;
    threads.set(root.uri, thread);
  }

  const position = decodeCursor(cursor);
  const ordered = [...threads.values()]
    .sort(
      (left, right) =>
        right.activityAt.localeCompare(left.activityAt) ||
        left.root.uri.localeCompare(right.root.uri),
    )
    .filter(
      (thread) =>
        !position ||
        thread.activityAt < position.activityAt ||
        (
          thread.activityAt === position.activityAt &&
          thread.root.uri > position.uri
        ),
    );
  const selected = ordered.slice(0, pageSize);
  const pagePosts: Array<FeedPagePost<T>> = [];

  for (const thread of selected) {
    const directReplies = thread.replies
      .filter(({ replyParentUri }) => replyParentUri === thread.root.uri)
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          left.uri.localeCompare(right.uri),
      )
      .slice(0, replyPreviewSize);
    pagePosts.push({
      ...thread.root,
      threadActivityAt: thread.activityAt,
      threadReplyCount: thread.replies.length,
    });
    pagePosts.push(...directReplies);
  }

  const last = selected.at(-1);
  return {
    posts: pagePosts,
    nextCursor:
      ordered.length > selected.length && last
        ? encodeCursor({ activityAt: last.activityAt, uri: last.root.uri })
        : null,
  };
}

function findRoot<T extends ThreadPost>(
  post: T,
  postsByUri: ReadonlyMap<string, T>,
  cache: Map<string, T | null>,
): T | null {
  const cached = cache.get(post.uri);
  if (cached !== undefined) return cached;

  const path: T[] = [];
  const visited = new Set<string>();
  let current: T | undefined = post;
  while (current?.replyParentUri) {
    if (visited.has(current.uri)) {
      current = undefined;
      break;
    }
    visited.add(current.uri);
    path.push(current);
    current = postsByUri.get(current.replyParentUri);
  }

  const root =
    current &&
    !current.replyParentUri &&
    current.authorDid === current.feedOwnerDid
      ? current
      : null;
  cache.set(post.uri, root);
  for (const item of path) cache.set(item.uri, root);
  return root;
}

type Cursor = { activityAt: string; uri: string };

function encodeCursor(cursor: Cursor): string {
  const binary = String.fromCharCode(
    ...new TextEncoder().encode(JSON.stringify(cursor)),
  );
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeCursor(value?: string | null): Cursor | null {
  if (!value || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0),
    );
    const parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as Partial<Cursor>;
    return typeof parsed.activityAt === "string" && typeof parsed.uri === "string"
      ? { activityAt: parsed.activityAt, uri: parsed.uri }
      : null;
  } catch {
    return null;
  }
}
