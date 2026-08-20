import { createFileRoute } from "@tanstack/react-router";
import { getOAuthClient } from "@/lib/auth/client";
import {
  deleteWebSession,
  deleteWebSessionsForDid,
  WEB_SESSION_COOKIE_NAME,
} from "@/lib/auth/web-session";
import { assertSameOrigin, clearCookie, json, readCookie } from "~/server/http";

export const Route = createFileRoute("/oauth/logout")({
  server: { handlers: { POST: async ({ request }) => {
    assertSameOrigin(request);
    const token = readCookie(request, WEB_SESSION_COOKIE_NAME);
    const did = token ? await deleteWebSession(token) : null;
    if (did) {
      await (await getOAuthClient()).revoke(did).catch(() => undefined);
      await deleteWebSessionsForDid(did);
    }
    return json({ ok: true }, 200, { "set-cookie": clearCookie(WEB_SESSION_COOKIE_NAME) });
  } } },
});
