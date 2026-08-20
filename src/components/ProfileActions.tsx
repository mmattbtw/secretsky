import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

export function FollowGate({
  ownerDid,
  relationship,
  canManageFollows,
}: {
  ownerDid: string;
  displayName: string;
  relationship: { follows: boolean; followedBy: boolean };
  canManageFollows: boolean;
}) {
  const router = useRouter();
  const [follows, setFollows] = useState(relationship.follows);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <section className="follow-box">
      <button
        disabled={busy || !canManageFollows}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          try {
            const response = await fetch("/api/follows", {
              method: follows ? "DELETE" : "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ targetDid: ownerDid }),
            });
            const body = await response.json() as { error?: string };
            if (!response.ok) throw new Error(body.error ?? "Could not update follow");
            setFollows(!follows);
            await router.invalidate();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not update follow");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working..." : follows ? "Unfollow" : relationship.followedBy ? "Follow back" : "Follow"}
      </button>
      <span>
        {follows && relationship.followedBy
          ? "You follow each other."
          : follows
          ? "Waiting for a follow back."
          : relationship.followedBy && !follows
            ? "This user follows you."
            : "Posts stay hidden until the follow is mutual."}
      </span>
      {!canManageFollows && <p className="error">Sign in again to manage follows.</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function CreateFeedButton({ incompatible }: { incompatible?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <section className="plain-box">
      <p>
        {incompatible
          ? "This PDS does not support Spaces."
          : "Create your private feed to start posting."}
      </p>
      {!incompatible && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const response = await fetch("/api/boards", { method: "POST" });
            const body = await response.json() as { error?: string };
            if (!response.ok) setError(body.error ?? "Could not create feed");
            else await router.invalidate();
            setBusy(false);
          }}
        >
          {busy ? "Creating..." : "Create my feed"}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

type FollowItem = {
  requesterDid: string;
  handle: string | null;
  createdAt: string;
  followsBack: boolean;
  profile: {
    handle: string;
    displayName: string | null;
    avatar: string | null;
  } | null;
};

export function IncomingFollows({
  follows,
  canManageFollows,
}: {
  follows: FollowItem[];
  canManageFollows: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  return (
    <section className="notification-section">
      <h2>Incoming follows</h2>
      {follows.length === 0 ? (
        <p className="empty">Nobody follows you yet.</p>
      ) : <ul className="notification-list">
        {follows.map((follow) => {
          const handle = follow.profile?.handle ?? follow.handle ?? follow.requesterDid;
          return (
            <li key={follow.requesterDid} className="incoming-follow">
              <p>
                <Link to="/$handle" params={{ handle }}>@{handle}</Link>
                {" follows you."}
              </p>
              {follow.followsBack ? (
                <small>You follow each other.</small>
              ) : (
                <button
                  disabled={Boolean(busy) || !canManageFollows}
                  onClick={async () => {
                    setBusy(follow.requesterDid);
                    setError(undefined);
                    try {
                      const response = await fetch("/api/follows", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ targetDid: follow.requesterDid }),
                      });
                      const body = await response.json() as { error?: string };
                      if (!response.ok) throw new Error(body.error ?? "Could not follow back");
                      await router.invalidate();
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : "Could not follow back");
                    } finally {
                      setBusy(undefined);
                    }
                  }}
                >
                  {busy === follow.requesterDid ? "Following..." : "Follow back"}
                </button>
              )}
            </li>
          );
        })}
      </ul>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
