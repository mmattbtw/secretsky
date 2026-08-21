import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "~/components/SiteHeader";
import { pageHead } from "~/site-meta";

export const Route = createFileRoute("/about")({
  head: () =>
    pageHead({
      title: "about",
      description:
        "How secretsky uses ATProto Spaces for private feeds, mutual follows, replies, and reactions.",
      path: "/about",
    }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="page">
      <SiteHeader />
      <article className="prose">
        <h1>about secretsky</h1>
        <p>secretsky is a private microblog built with ATProto Spaces.</p>
        <p>A follow is private. Two people must follow each other before either private feed opens.</p>
        <p>Posts, replies, reactions, and follows are protocol records on each user&apos;s PDS. The local database is a synchronized index.</p>
        <p>Spaces provide access control, not end-to-end encryption. This is alpha software. Do not use it for sensitive information.</p>
      </article>
    </main>
  );
}
