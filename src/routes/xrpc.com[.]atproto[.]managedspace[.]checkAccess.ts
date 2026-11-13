import { createFileRoute } from "@tanstack/react-router";
import { checkAccess } from "@/lib/atproto/check-access";

export const Route = createFileRoute("/xrpc/com.atproto.managedspace.checkAccess")({
  server: { handlers: { GET: ({ request }) => checkAccess(request) } },
});
