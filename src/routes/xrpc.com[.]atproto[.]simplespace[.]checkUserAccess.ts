import { createFileRoute } from "@tanstack/react-router";
import { verifyManagingAppRequest } from "@/lib/atproto/service-auth";
import { connectionsUri, feedUri } from "@/lib/config";
import { canAccessFeed } from "@/lib/follows";

export const Route = createFileRoute("/xrpc/com.atproto.simplespace.checkUserAccess")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const space = url.searchParams.get("space");
    const user = url.searchParams.get("user");
    const authority = space?.match(/^at:\/\/(did:[^/]+)\/space\//)?.[1];
    if (
      !space ||
      !user ||
      !authority ||
      (space !== feedUri(authority) && space !== connectionsUri(authority))
    ) {
      return Response.json({ error: "InvalidRequest" }, { status: 400 });
    }
    try {
      await verifyManagingAppRequest(request.headers.get("authorization"), authority);
      const authorized =
        space === connectionsUri(authority)
          ? user === authority
          : await canAccessFeed(user, authority);
      return Response.json({ authorized });
    } catch (error) {
      console.error("Managing-app access check failed", error);
      return Response.json({ error: "AuthRequired" }, { status: 401 });
    }
  } } },
});
