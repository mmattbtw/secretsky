import { createFileRoute, redirect } from "@tanstack/react-router";
import { postPermalink, postUriFromRouteId } from "@/lib/post-route";

export const Route = createFileRoute("/post/$postId")({
  loader: ({ params }) => {
    const uri = postUriFromRouteId(params.postId);
    if (!uri) return null;
    throw redirect({ href: postPermalink(uri), statusCode: 308 });
  },
});
