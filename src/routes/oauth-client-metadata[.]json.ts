import { createFileRoute } from "@tanstack/react-router";
import { getClientMetadata } from "@/lib/auth/metadata";

export const Route = createFileRoute("/oauth-client-metadata.json")({
  server: { handlers: { GET: () => Response.json(getClientMetadata()) } },
});
