import { createFileRoute } from "@tanstack/react-router";
import { getSessionFromRequest } from "@/lib/auth/session";
import { boardUri, getConfig } from "@/lib/config";
import { canAccessFeed } from "@/lib/follows";

export const Route = createFileRoute("/api/events")({
  server: { handlers: { GET: async ({ request }) => {
    const session = await getSessionFromRequest(request);
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const ownerDid = new URL(request.url).searchParams.get("ownerDid");
    if (!ownerDid?.startsWith("did:") || !(await canAccessFeed(session.did, ownerDid))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const upstream = await fetch(
      `${getConfig().syncInternalUrl}/events?space=${encodeURIComponent(boardUri(ownerDid))}`,
      { cache: "no-store", signal: request.signal },
    );
    if (!upstream.ok || !upstream.body) return Response.json({ error: "Live updates unavailable" }, { status: 502 });
    return new Response(upstream.body, { headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    } });
  } } },
});
