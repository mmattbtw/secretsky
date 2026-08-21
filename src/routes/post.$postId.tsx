import { createFileRoute, redirect } from "@tanstack/react-router";
import { postPermalink, postUriFromRouteId } from "@/lib/post-route";
import { pageHead } from "~/site-meta";

export const Route = createFileRoute("/post/$postId")({
  loader: ({ params }) => {
    const uri = postUriFromRouteId(params.postId);
    if (!uri) return null;
    throw redirect({ href: postPermalink(uri), statusCode: 308 });
  },
  head: ({ params }) => {
    const uri = postUriFromRouteId(params.postId);
    return pageHead({
      title: "private post",
      description: "A private post shared on secretsky.",
      path: uri
        ? postPermalink(uri)
        : `/post/${encodeURIComponent(params.postId)}`,
      robots: "noindex, nofollow",
      type: "article",
    });
  },
});
