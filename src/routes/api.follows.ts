import { createFileRoute } from "@tanstack/react-router";
import {
  createPrivateFollow,
  deletePrivateFollow,
} from "@/lib/atproto/actions";
import { cacheIdentity } from "@/lib/atproto/identity";
import { requireSessionFromRequest } from "@/lib/auth/session";
import {
  assertSameOrigin,
  errorResponse,
  json,
  methodNotAllowed,
} from "~/server/http";

export const Route = createFileRoute("/api/follows")({
  server: { handlers: {
    GET: () => methodNotAllowed(["POST", "DELETE"]),
    POST: async ({ request }) => {
      try {
        assertSameOrigin(request);
        const session = await requireSessionFromRequest(request);
        const { targetDid } = await request.json() as { targetDid?: unknown };
        if (typeof targetDid !== "string" || !targetDid.startsWith("did:")) throw new Error("Invalid account");
        await Promise.all([
          cacheIdentity(session.did).catch(() => undefined),
          cacheIdentity(targetDid).catch(() => undefined),
        ]);
        await createPrivateFollow(session, targetDid);
        return json({ status: "following" });
      } catch (error) {
        return errorResponse(error, "Could not follow account");
      }
    },
    DELETE: async ({ request }) => {
      try {
        assertSameOrigin(request);
        const session = await requireSessionFromRequest(request);
        const { targetDid } = await request.json() as { targetDid?: unknown };
        if (typeof targetDid !== "string") throw new Error("Invalid account");
        await deletePrivateFollow(session, targetDid);
        return json({ status: "none" });
      } catch (error) {
        return errorResponse(error, "Could not unfollow account");
      }
    },
  } },
});
