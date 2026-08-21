import { Link, useRouter } from "@tanstack/react-router";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  REACTION_EMOJI_OPTIONS,
  visibleReactionEmojiCounts,
} from "@/lib/reaction-emoji";
import { postRouteId } from "@/lib/post-route";
import { getHomeFeedPage } from "~/server/page-data.functions";
import { submitPostShortcut } from "./form-shortcuts";

export type FeedPost = {
  uri: string;
  cid: string;
  feedOwnerDid: string;
  authorDid: string;
  authorHandle: string | null;
  text: string;
  replyParentUri: string | null;
  createdAt: string;
  viewerReactionUri: string | null;
  viewerReactionEmoji: string | null;
  reactionEmojiCounts: Array<{
    emoji: string;
    count: number;
    actors: Array<{ did: string; handle: string | null }>;
  }>;
  threadActivityAt?: string;
  threadReplyCount?: number;
  author: {
    handle: string;
    displayName: string | null;
    avatar: string | null;
  } | null;
};

export function HomeFeed({
  posts,
  viewerDid,
  ownFeedExists,
  canCreateFeed,
  canWrite,
  nextCursor: initialNextCursor,
  feedOwnerDids,
}: {
  posts: FeedPost[];
  viewerDid: string;
  ownFeedExists: boolean;
  canCreateFeed: boolean;
  canWrite: boolean;
  nextCursor: string | null;
  feedOwnerDids: string[];
}) {
  const [loadedPosts, setLoadedPosts] = useState(posts);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoadedPosts(posts);
    setNextCursor(initialNextCursor);
    setLoadError(undefined);
  }, [posts, initialNextCursor]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(undefined);
    try {
      const page = await getHomeFeedPage({ data: { cursor: nextCursor } });
      setLoadedPosts((current) => appendUniquePosts(current, page.posts));
      setNextCursor(page.nextCursor);
    } catch {
      setLoadError("Could not load more posts.");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  useEffect(() => {
    const target = sentinel.current;
    if (!target || !nextCursor) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, nextCursor]);

  return (
    <>
      <Timeline
        posts={loadedPosts}
        viewerDid={viewerDid}
        canWrite={canWrite}
        composerOwnerDid={ownFeedExists ? viewerDid : undefined}
        canCreateFeed={!ownFeedExists && canCreateFeed}
        watchedOwners={feedOwnerDids}
      />
      <div className="feed-loader" ref={sentinel}>
        {loadingMore && <p>Loading more posts...</p>}
        {loadError && (
          <p className="error">
            {loadError}{" "}
            <button onClick={() => void loadMore()}>Try again</button>
          </p>
        )}
      </div>
    </>
  );
}

export function PrivateFeed({
  posts,
  ownerDid,
  viewerDid,
  canWrite,
}: {
  posts: FeedPost[];
  ownerDid: string;
  viewerDid: string;
  canWrite: boolean;
  ownFeed: boolean;
}) {
  return (
    <Timeline
      posts={posts}
      viewerDid={viewerDid}
      canWrite={canWrite}
      watchedOwners={[ownerDid]}
      title="Posts"
    />
  );
}

export function PostThread({
  posts,
  targetUri,
  ownerDid,
  viewerDid,
  canWrite,
}: {
  posts: FeedPost[];
  targetUri: string;
  ownerDid: string;
  viewerDid: string;
  canWrite: boolean;
}) {
  return (
    <Timeline
      posts={posts}
      viewerDid={viewerDid}
      canWrite={canWrite}
      watchedOwners={[ownerDid]}
      focusedPostUri={targetUri}
      title="Post"
    />
  );
}

function Timeline({
  posts,
  viewerDid,
  canWrite,
  composerOwnerDid,
  canCreateFeed = false,
  watchedOwners,
  focusedPostUri,
  title = "Home",
}: {
  posts: FeedPost[];
  viewerDid: string;
  canWrite: boolean;
  composerOwnerDid?: string;
  canCreateFeed?: boolean;
  watchedOwners?: string[];
  focusedPostUri?: string;
  title?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const owners = useMemo(
    () => watchedOwners ?? [
      ...new Set([
        ...(composerOwnerDid ? [composerOwnerDid] : []),
        ...posts.map(({ feedOwnerDid }) => feedOwnerDid),
      ]),
    ],
    [composerOwnerDid, posts, watchedOwners],
  );
  const replies = useMemo(() => {
    const map = new Map<string, FeedPost[]>();
    for (const post of posts) {
      if (!post.replyParentUri) continue;
      map.set(post.replyParentUri, [...(map.get(post.replyParentUri) ?? []), post]);
    }
    return map;
  }, [posts]);
  const roots = focusedPostUri
    ? threadRoot(posts, focusedPostUri)
    : posts.filter(
        (post) => !post.replyParentUri && post.authorDid === post.feedOwnerDid,
      );
  const ownerKey = owners.join("\n");

  useEffect(() => {
    const events = owners.map((ownerDid) => {
      const source = new EventSource(
        `/api/events?ownerDid=${encodeURIComponent(ownerDid)}`,
      );
      source.onmessage = () => void router.invalidate();
      return source;
    });
    return () => events.forEach((source) => source.close());
  }, [ownerKey, router]);

  useEffect(() => {
    if (!focusedPostUri) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(postId(focusedPostUri))?.scrollIntoView({
        block: "center",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedPostUri, posts]);

  async function publish(
    ownerDid: string,
    value: string,
    reply?: { uri: string; cid: string },
  ) {
    if (!value.trim() || busy) return false;
    setBusy(true);
    setError(undefined);
    const response = await fetch("/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerDid,
        text: value,
        replyUri: reply?.uri,
        replyCid: reply?.cid,
      }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Could not post");
      setBusy(false);
      return false;
    }
    if (!reply) setText("");
    await router.invalidate();
    setBusy(false);
    return true;
  }

  async function createFeed() {
    setBusy(true);
    setError(undefined);
    const response = await fetch("/api/boards", { method: "POST" });
    const body = await response.json() as { error?: string };
    if (!response.ok) setError(body.error ?? "Could not create your feed");
    else await router.invalidate();
    setBusy(false);
  }

  return (
    <div className="timeline">
      {composerOwnerDid && (
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void publish(composerOwnerDid, text);
          }}
        >
          <label htmlFor="new-post">New post</label>
          <textarea
            id="new-post"
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 500))}
            onKeyDown={submitPostShortcut}
            placeholder="Write something..."
            disabled={!canWrite || busy}
          />
          <div className="form-row">
            <small>{text.length}/500</small>
            <button disabled={!canWrite || busy || !text.trim()}>
              {busy ? "Posting..." : "Post"}
            </button>
          </div>
        </form>
      )}

      {canCreateFeed && (
        <section className="plain-box">
          <p>Create your private feed before posting.</p>
          <button disabled={busy} onClick={() => void createFeed()}>
            {busy ? "Creating..." : "Create my feed"}
          </button>
        </section>
      )}

      {!composerOwnerDid && !canCreateFeed && viewerDid && !canWrite && (
        <p className="error">Sign in again to grant posting access.</p>
      )}
      {error && <p className="error">{error}</p>}

      <h2 className="page-title">{title}</h2>
      {roots.length === 0 ? (
        <p className="empty">No posts yet.</p>
      ) : (
        <div className="post-list">
          {roots.map((post) => (
            <PostItem
              key={post.uri}
              post={post}
              replies={replies}
              viewerDid={viewerDid}
              canWrite={canWrite}
              busy={busy}
              onReply={publish}
              onRefresh={() => router.invalidate()}
              focusedPostUri={focusedPostUri}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PostItem({
  post,
  replies,
  viewerDid,
  canWrite,
  busy,
  onReply,
  onRefresh,
  focusedPostUri,
  nested = false,
}: {
  post: FeedPost;
  replies: Map<string, FeedPost[]>;
  viewerDid: string;
  canWrite: boolean;
  busy: boolean;
  onReply: (
    ownerDid: string,
    text: string,
    reply: { uri: string; cid: string },
  ) => Promise<boolean>;
  onRefresh: () => Promise<unknown>;
  focusedPostUri?: string;
  nested?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [reactionOpen, setReactionOpen] = useState(false);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [error, setError] = useState<string>();
  const handle = post.author?.handle ?? post.authorHandle ?? post.authorDid;
  const children = replies.get(post.uri) ?? [];
  const visibleReactions = visibleReactionEmojiCounts(post.reactionEmojiCounts);

  async function react(emoji: string) {
    if (!canWrite || reactionBusy) return;
    setReactionBusy(true);
    setError(undefined);
    try {
      if (post.viewerReactionUri) {
        const response = await fetch("/api/reactions", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ownerDid: post.feedOwnerDid,
            reactionUri: post.viewerReactionUri,
          }),
        });
        if (!response.ok) throw new Error("Could not remove reaction");
      }
      if (post.viewerReactionEmoji !== emoji) {
        const response = await fetch("/api/reactions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ownerDid: post.feedOwnerDid,
            postUri: post.uri,
            postCid: post.cid,
            emoji,
          }),
        });
        if (!response.ok) throw new Error("Could not add reaction");
      }
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not react");
    } finally {
      setReactionBusy(false);
      setReactionOpen(false);
    }
  }

  return (
    <article
      className={[
        "post",
        nested ? "reply" : "",
        post.uri === focusedPostUri ? "focused-post" : "",
      ].filter(Boolean).join(" ")}
      id={postId(post.uri)}
    >
      <header>
        <Link to="/$handle" params={{ handle }}>@{handle}</Link>
        <Link to="/post/$postId" params={{ postId: postRouteId(post.uri) }}>
          <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
        </Link>
      </header>
      <p>{post.text}</p>
      <Tooltip.Provider delayDuration={250} skipDelayDuration={100}>
        <div className="post-actions">
          {visibleReactions.map(({ emoji, count, actors = [] }) => {
            const people = actors.map(({ did, handle }) => ({
              did,
              name: handle
                ? `@${handle}${did === viewerDid ? " (you)" : ""}`
                : did === viewerDid ? "You" : did,
            }));
            const attribution = people.map(({ name }) => name).join(", ");
            const label = count
              ? `${emoji}, reacted by ${attribution}`
              : `React with ${emoji}`;

            return (
              <Tooltip.Root key={emoji}>
                <Tooltip.Trigger asChild>
                  <button
                    aria-disabled={!canWrite || reactionBusy}
                    aria-label={label}
                    aria-pressed={post.viewerReactionEmoji === emoji}
                    onClick={() => void react(emoji)}
                  >
                    {emoji}{count || ""}
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="reaction-tooltip"
                    side="top"
                    sideOffset={7}
                    collisionPadding={10}
                  >
                    {count ? (
                      <>
                        <span className="reaction-tooltip-summary">
                          {emoji} {count} {count === 1 ? "reaction" : "reactions"}
                        </span>
                        <ul>
                          {people.map(({ did, name }) => <li key={did}>{name}</li>)}
                        </ul>
                      </>
                    ) : (
                      <span>React with {emoji}</span>
                    )}
                    <Tooltip.Arrow className="reaction-tooltip-arrow" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          })}
          <button disabled={!canWrite || busy} onClick={() => setReplying((value) => !value)}>reply</button>
          <button disabled={!canWrite || reactionBusy} onClick={() => setReactionOpen((value) => !value)}>emoji</button>
          {post.authorDid === viewerDid && (
            <button
              onClick={async () => {
                await fetch("/api/posts", {
                  method: "DELETE",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    ownerDid: post.feedOwnerDid,
                    postUri: post.uri,
                    postCid: post.cid,
                  }),
                });
                await onRefresh();
              }}
            >delete</button>
          )}
        </div>
      </Tooltip.Provider>

      {reactionOpen && (
        <div className="emoji-list" aria-label="Choose an emoji">
          {REACTION_EMOJI_OPTIONS.map((emoji) => (
            <button key={emoji} onClick={() => void react(emoji)}>{emoji}</button>
          ))}
        </div>
      )}

      {replying && (
        <form
          className="reply-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const posted = await onReply(
              post.feedOwnerDid,
              reply,
              { uri: post.uri, cid: post.cid },
            );
            if (posted) {
              setReply("");
              setReplying(false);
            }
          }}
        >
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value.slice(0, 500))}
            onKeyDown={submitPostShortcut}
            placeholder={`Reply to @${handle}`}
            autoFocus
          />
          <button disabled={!reply.trim() || busy}>Reply</button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
      {children.length > 0 && (
        <div className="replies">
          {children.map((child) => (
            <PostItem
              key={child.uri}
              post={child}
              replies={replies}
              viewerDid={viewerDid}
              canWrite={canWrite}
              busy={busy}
              onReply={onReply}
              onRefresh={onRefresh}
              focusedPostUri={focusedPostUri}
              nested
            />
          ))}
        </div>
      )}
      {!nested &&
        post.threadReplyCount !== undefined &&
        post.threadReplyCount > children.length && (
          <p className="thread-link">
            <Link
              to="/post/$postId"
              params={{ postId: postRouteId(post.uri) }}
            >
              view all {post.threadReplyCount}{" "}
              {post.threadReplyCount === 1 ? "reply" : "replies"}
            </Link>
          </p>
        )}
    </article>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function postId(uri: string): string {
  return `post-${encodeURIComponent(uri)}`;
}

function threadRoot(posts: FeedPost[], targetUri: string): FeedPost[] {
  const postsByUri = new Map(posts.map((post) => [post.uri, post]));
  let root = postsByUri.get(targetUri);
  const visited = new Set<string>();
  while (
    root?.replyParentUri &&
    !visited.has(root.uri) &&
    postsByUri.has(root.replyParentUri)
  ) {
    visited.add(root.uri);
    root = postsByUri.get(root.replyParentUri);
  }
  return root ? [root] : [];
}

function appendUniquePosts(
  current: FeedPost[],
  incoming: FeedPost[],
): FeedPost[] {
  const seen = new Set(current.map(({ uri }) => uri));
  return [
    ...current,
    ...incoming.filter(({ uri }) => !seen.has(uri)),
  ];
}
