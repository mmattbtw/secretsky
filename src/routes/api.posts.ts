import { createFileRoute } from "@tanstack/react-router";
import { createPost, deleteOwnPost } from "@/lib/atproto/actions";
import { requireSessionFromRequest } from "@/lib/auth/session";
import {
  assertSameOrigin,
  errorResponse,
  json,
  methodNotAllowed,
} from "~/server/http";

export const Route = createFileRoute("/api/posts")({
  server: { handlers: {
    GET: () => methodNotAllowed(["POST", "DELETE"]),
    POST: async ({ request }) => {
      try {
        assertSameOrigin(request);
        const session = await requireSessionFromRequest(request);
        const body = await request.json() as Record<string, unknown>;
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (typeof body.ownerDid !== "string" || !text || Array.from(text).length > 500) {
          return json({ error: "Write between 1 and 500 characters" }, 400);
        }
        const reply = typeof body.replyUri === "string" && typeof body.replyCid === "string"
          ? { uri: body.replyUri, cid: body.replyCid }
          : undefined;
        return json({ uri: await createPost(session, body.ownerDid, text, reply) });
      } catch (error) {
        return errorResponse(error, "Could not publish post");
      }
    },
    DELETE: async ({ request }) => {
      try {
        assertSameOrigin(request);
        const session = await requireSessionFromRequest(request);
        const body = await request.json() as Record<string, unknown>;
        if (
          typeof body.ownerDid !== "string" ||
          typeof body.postUri !== "string" ||
          typeof body.postCid !== "string"
        ) throw new Error("Invalid post");
        await deleteOwnPost(session, {
          ownerDid: body.ownerDid,
          postUri: body.postUri,
          postCid: body.postCid,
        });
        return json({ deleted: true });
      } catch (error) {
        return errorResponse(error, "Could not delete post");
      }
    },
  } },
});
