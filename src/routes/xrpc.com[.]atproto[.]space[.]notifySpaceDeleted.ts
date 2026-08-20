import { createFileRoute } from "@tanstack/react-router";
import { forwardToSync } from "@/lib/sync/forward";

export const Route = createFileRoute("/xrpc/com.atproto.space.notifySpaceDeleted")({
  server: { handlers: { POST: ({ request }) => forwardToSync(
    request,
    "/xrpc/com.atproto.space.notifySpaceDeleted",
  ) } },
});
