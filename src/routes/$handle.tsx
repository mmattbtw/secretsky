import { createFileRoute } from "@tanstack/react-router";
import { LoginForm } from "~/components/LoginForm";
import { PrivateFeed } from "~/components/PrivateFeed";
import { CreateFeedButton, FollowGate } from "~/components/ProfileActions";
import { SiteHeader } from "~/components/SiteHeader";
import { getProfilePageData } from "~/server/page-data.functions";
import { pageHead } from "~/site-meta";

export const Route = createFileRoute("/$handle")({
  loader: ({ params }) => getProfilePageData({ data: { handle: params.handle } }),
  head: ({ loaderData, params }) => {
    const handle =
      loaderData && "owner" in loaderData && loaderData.owner
        ? loaderData.owner.handle
        : params.handle.replace(/^@/, "");
    return pageHead({
      title: `@${handle}`,
      description: `Follow @${handle} on secretsky to open their private feed when they follow you back.`,
      path: `/${encodeURIComponent(handle)}`,
      type: "profile",
    });
  },
  component: ProfilePage,
});

function ProfilePage() {
  const data = Route.useLoaderData();
  if (data.kind === "missing") {
    return (
      <main className="page">
        <SiteHeader />
        <h1>User not found</h1>
      </main>
    );
  }

  const viewer = "viewerHandle" in data ? { handle: data.viewerHandle ?? null } : null;
  if (data.kind === "signedOut") {
    return (
      <main className="page">
        <SiteHeader />
        <ProfileHeader owner={data.owner} />
        <p>Sign in to follow this user and see their posts.</p>
        <LoginForm />
      </main>
    );
  }

  if (data.kind === "locked") {
    return (
      <main className="page">
        <SiteHeader viewer={viewer} />
        <ProfileHeader owner={data.owner} />
        <FollowGate
          ownerDid={data.owner.did}
          displayName={`@${data.owner.handle}`}
          relationship={data.relationship}
          canManageFollows={data.canManageFollows}
        />
        <p className="empty">Posts are private until you follow each other.</p>
      </main>
    );
  }

  if (data.kind === "setup") {
    return (
      <main className="page">
        <SiteHeader viewer={viewer} />
        <ProfileHeader owner={data.owner} />
        <CreateFeedButton incompatible={data.incompatiblePds} />
      </main>
    );
  }

  if (data.kind !== "feed") {
    return (
      <main className="page">
        <SiteHeader viewer={viewer} />
        <p>This feed is unavailable.</p>
      </main>
    );
  }

  return (
    <main className="page">
      <SiteHeader viewer={viewer} />
      <ProfileHeader owner={data.owner} />
      {!data.ownFeed && (
        <FollowGate
          ownerDid={data.owner.did}
          displayName={`@${data.owner.handle}`}
          relationship={data.relationship}
          canManageFollows={Boolean(data.canManageFollows)}
        />
      )}
      <PrivateFeed
        posts={data.posts ?? []}
        ownerDid={data.owner.did}
        viewerDid={data.viewerDid}
        canWrite={Boolean(data.canWrite)}
        ownFeed={Boolean(data.ownFeed)}
      />
    </main>
  );
}

function ProfileHeader({
  owner,
}: {
  owner: {
    did: string;
    handle: string;
    displayName: string | null;
    avatar: string | null;
  };
}) {
  return (
    <header className="profile-header">
      <h1>@{owner.handle}</h1>
      {owner.displayName && <p>{owner.displayName}</p>}
    </header>
  );
}
