import { createFileRoute } from "@tanstack/react-router";
import { getOAuthClient } from "@/lib/auth/client";
import { OAUTH_SCOPE } from "@/lib/config";
import { assertSameOrigin, errorResponse, json } from "~/server/http";

export const Route = createFileRoute("/oauth/login")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      assertSameOrigin(request);
      const { handle } = await request.json() as { handle?: unknown };
      if (typeof handle !== "string" || !handle.trim()) throw new Error("Enter your handle");
      const url = await (await getOAuthClient()).authorize(handle.trim().replace(/^@/, ""), {
        scope: OAUTH_SCOPE,
      });
      return json({ redirectUrl: url.toString() });
    } catch (error) {
      return errorResponse(error, "Could not sign in");
    }
  } } },
});
