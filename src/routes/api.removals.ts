import { createFileRoute } from "@tanstack/react-router";
import { removePostFromBoard } from "@/lib/atproto/actions";
import { requireSessionFromRequest } from "@/lib/auth/session";
import {
  assertSameOrigin,
  errorResponse,
  json,
  methodNotAllowed,
} from "~/server/http";

export const Route = createFileRoute("/api/removals")({
  server: { handlers: {
    GET: () => methodNotAllowed(["POST"]),
    POST: async ({ request }) => {
      try {
        assertSameOrigin(request);
        const session = await requireSessionFromRequest(request);
        const body = await request.json() as Record<string, unknown>;
        if (
          typeof body.ownerDid !== "string" ||
          typeof body.postUri !== "string" ||
          typeof body.postCid !== "string"
        ) throw new Error("Invalid moderation target");
        return json({ uri: await removePostFromBoard(session, {
          ownerDid: body.ownerDid,
          postUri: body.postUri,
          postCid: body.postCid,
        }) });
      } catch (error) {
        return errorResponse(error, "Could not remove post");
      }
    },
  } },
});
