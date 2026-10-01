import { createFileRoute } from "@tanstack/react-router";
import { checkUserAccess } from "@/lib/atproto/user-access";

export const Route = createFileRoute("/xrpc/com.atproto.simplespace.checkUserAccess")({
  server: { handlers: { GET: ({ request }) => checkUserAccess(request) } },
});
