import { createFileRoute } from "@tanstack/react-router";
import { getConfig } from "@/lib/config";

export const Route = createFileRoute("/.well-known/did.json")({
  server: { handlers: { GET: () => {
    const config = getConfig();
    return Response.json({
      "@context": ["https://www.w3.org/ns/did/v1"],
      id: config.managingAppDid,
      service: [{
        id: config.managingAppService,
        type: "AtprotoSpaceService",
        serviceEndpoint: config.managingAppPublicUrl,
      }],
    });
  } } },
});
