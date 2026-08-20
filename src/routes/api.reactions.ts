import { createFileRoute } from "@tanstack/react-router";
import { createReaction, deleteReaction } from "@/lib/atproto/actions";
import { requireSessionFromRequest } from "@/lib/auth/session";
import {
  assertSameOrigin,
  errorResponse,
  json,
  methodNotAllowed,
} from "~/server/http";

export const Route = createFileRoute("/api/reactions")({
  server: { handlers: {
    GET: () => methodNotAllowed(["POST", "DELETE"]),
    POST: async ({ request }) => {
      try {
        assertSameOrigin(request);
        const session = await requireSessionFromRequest(request);
        const body = await request.json() as Record<string, unknown>;
        if (
          typeof body.ownerDid !== "string" ||
          typeof body.postUri !== "string" ||
          typeof body.postCid !== "string"
        ) throw new Error("Invalid reaction target");
        return json({ uri: await createReaction(session, {
          ownerDid: body.ownerDid,
          postUri: body.postUri,
          postCid: body.postCid,
          emoji: body.emoji,
        }) });
      } catch (error) {
        return errorResponse(error, "Could not react");
      }
    },
    DELETE: async ({ request }) => {
      try {
        assertSameOrigin(request);
        const session = await requireSessionFromRequest(request);
        const body = await request.json() as Record<string, unknown>;
        if (typeof body.ownerDid !== "string" || typeof body.reactionUri !== "string") {
          throw new Error("Invalid reaction");
        }
        await deleteReaction(session, { ownerDid: body.ownerDid, reactionUri: body.reactionUri });
        return json({ deleted: true });
      } catch (error) {
        return errorResponse(error, "Could not remove reaction");
      }
    },
  } },
});
