import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "~/components/SiteHeader";

export const Route = createFileRoute("/about")({ component: AboutPage });

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
