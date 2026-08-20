import { createFileRoute } from "@tanstack/react-router";
import { createBoard } from "@/lib/atproto/actions";
import { getBulletinCapabilities } from "@/lib/auth/bulletin-capabilities";
import { requireSessionFromRequest } from "@/lib/auth/session";
import {
  assertSameOrigin,
  errorResponse,
  json,
  methodNotAllowed,
} from "~/server/http";

export const Route = createFileRoute("/api/boards")({
  server: { handlers: {
    GET: () => methodNotAllowed(["POST"]),
    POST: async ({ request }) => {
      try {
        assertSameOrigin(request);
        const session = await requireSessionFromRequest(request);
        const capabilities = await getBulletinCapabilities(session, session.did);
        if (!capabilities.canCreateBoard || !capabilities.canManageFollows) {
          return json({ error: "Your PDS does not support secretsky's private Spaces yet" }, 403);
        }
        return json({ space: await createBoard(session) });
      } catch (error) {
        return errorResponse(error, "Could not create your feed");
      }
    },
  } },
});
