import { createFileRoute } from "@tanstack/react-router";
import { LoginForm } from "~/components/LoginForm";
import { PostThread } from "~/components/PrivateFeed";
import { SiteHeader } from "~/components/SiteHeader";
import { getPostPageData } from "~/server/page-data.functions";

export const Route = createFileRoute("/post/$postId")({
  loader: ({ params }) => getPostPageData({ data: { postId: params.postId } }),
  component: PostPage,
});

function PostPage() {
  const data = Route.useLoaderData();
  if (data.kind === "signedOut") {
    return (
      <main className="page">
        <SiteHeader />
        <h1>Post</h1>
        <p>Sign in to view this private post.</p>
        <LoginForm />
      </main>
    );
  }
  if (data.kind === "unavailable") {
    return (
      <main className="page">
        <SiteHeader viewer={{ handle: data.viewerHandle }} />
        <h1>Post unavailable</h1>
        <p>This post does not exist or you do not have access to it.</p>
      </main>
    );
  }
  return (
    <main className="page">
      <SiteHeader viewer={data.viewer} />
      <PostThread
        posts={data.posts}
        targetUri={data.targetUri}
        ownerDid={data.ownerDid}
        viewerDid={data.viewer.did}
        canWrite={data.canWrite}
      />
    </main>
  );
}
