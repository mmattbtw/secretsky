import { createFileRoute } from "@tanstack/react-router";
import { forwardHealthToSync } from "@/lib/sync/forward";

export const Route = createFileRoute("/sync/health")({
  server: { handlers: { GET: ({ request }) => forwardHealthToSync(request) } },
});
