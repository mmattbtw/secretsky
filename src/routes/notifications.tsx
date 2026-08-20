import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { LoginForm } from "~/components/LoginForm";
import { IncomingFollows } from "~/components/ProfileActions";
import { SiteHeader } from "~/components/SiteHeader";
import { submitPostShortcut } from "~/components/form-shortcuts";
import { postPermalink } from "@/lib/post-route";
import { getNotificationsData } from "~/server/page-data.functions";

export const Route = createFileRoute("/notifications")({
  loader: () => getNotificationsData(),
  component: NotificationsPage,
});

function NotificationsPage() {
  const data = Route.useLoaderData();
  if (!data.viewer) {
    return (
      <main className="page">
        <SiteHeader />
        <h1>Notifications</h1>
        <p>Sign in to see notifications.</p>
        <LoginForm />
      </main>
    );
  }

  return (
    <main className="page">
      <SiteHeader viewer={data.viewer} />
      <h1>Notifications</h1>
      <IncomingFollows
        follows={data.incoming}
        canManageFollows={data.canManageFollows}
      />

      <section className="notification-section">
        <h2>Replies</h2>
        {data.replies.length === 0 ? (
          <p className="empty">No replies.</p>
        ) : (
          <ul className="notification-list">
            {data.replies.map((reply) => (
              <ReplyNotification
                key={reply.uri}
                reply={reply}
                canWrite={data.canWrite}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="notification-section">
        <h2>Reactions</h2>
        {data.reactions.length === 0 ? (
          <p className="empty">No reactions.</p>
        ) : (
          <ul className="notification-list">
            {data.reactions.map((reaction) => {
              const handle = reaction.author?.handle ?? reaction.authorHandle ?? reaction.authorDid;
              return (
                <li key={reaction.uri}>
                  <p>
                    <Link to="/$handle" params={{ handle }}>@{handle}</Link>
                    {" reacted "}{reaction.emoji}{" to your post."}
                  </p>
                  <blockquote>{reaction.postText}</blockquote>
                  <small>
                    {formatDate(reaction.createdAt)}{" · "}
                    <a href={postPermalink(reaction.postUri)}>view post</a>
                  </small>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function ReplyNotification({
  reply,
  canWrite,
}: {
  reply: {
    uri: string;
    cid: string;
    ownerDid: string;
    authorDid: string;
    authorHandle: string | null;
    author: { handle: string; displayName: string | null } | null;
    text: string;
    parentUri: string;
    parentText: string;
    createdAt: string;
  };
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const handle = reply.author?.handle ?? reply.authorHandle ?? reply.authorDid;

  return (
    <li>
      <p>
        <Link to="/$handle" params={{ handle }}>@{handle}</Link>{" replied:"}
      </p>
      <blockquote>{reply.text}</blockquote>
      <small>
        {formatDate(reply.createdAt)}{" · "}
        <a href={postPermalink(reply.uri)}>view post</a>
      </small>
      <div><button disabled={!canWrite} onClick={() => setOpen((value) => !value)}>reply</button></div>
      {open && (
        <form
          className="reply-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!text.trim() || busy) return;
            setBusy(true);
            setError(undefined);
            const response = await fetch("/api/posts", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                ownerDid: reply.ownerDid,
                text,
                replyUri: reply.uri,
                replyCid: reply.cid,
              }),
            });
            const body = await response.json() as { error?: string };
            if (!response.ok) setError(body.error ?? "Could not reply");
            else {
              setText("");
              setOpen(false);
              await router.invalidate();
            }
            setBusy(false);
          }}
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value.slice(0, 500))}
            onKeyDown={submitPostShortcut}
            placeholder={`Reply to @${handle}`}
            autoFocus
          />
          <button disabled={!text.trim() || busy}>{busy ? "Posting..." : "Reply"}</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </li>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
