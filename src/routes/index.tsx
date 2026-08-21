import { createFileRoute } from "@tanstack/react-router";
import { HomeFeed } from "~/components/PrivateFeed";
import { LoginForm } from "~/components/LoginForm";
import { SiteHeader } from "~/components/SiteHeader";
import { getHomeData } from "~/server/page-data.functions";
import { pageHead } from "~/site-meta";

export const Route = createFileRoute("/")({
  head: () => pageHead(),
  loader: () => getHomeData(),
  component: HomePage,
});

function HomePage() {
  const data = Route.useLoaderData();
  if (!data.viewer) {
    return (
      <main className="page">
        <SiteHeader />
        <section className="login-page">
          <h1>secretsky</h1>
          <p>A private microblog for mutual follows.</p>
          <LoginForm />
          <small>ATProto Spaces alpha. Use test data.</small>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <SiteHeader viewer={data.viewer} />
      <HomeFeed
        posts={data.posts}
        viewerDid={data.viewer.did}
        ownFeedExists={data.ownFeedExists}
        canCreateFeed={data.canCreateFeed}
        canWrite={data.canWrite}
        nextCursor={data.nextCursor}
        feedOwnerDids={data.feedOwnerDids}
      />
    </main>
  );
}
