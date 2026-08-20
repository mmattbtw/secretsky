import { createFileRoute } from "@tanstack/react-router";
import { createBoard } from "@/lib/atproto/actions";
import { cacheIdentity } from "@/lib/atproto/identity";
import { getOAuthClient } from "@/lib/auth/client";
import {
  createWebSession,
  deleteWebSession,
  LEGACY_SESSION_COOKIE_NAME,
  WEB_SESSION_COOKIE_NAME,
  WEB_SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/web-session";
import { getConfig } from "@/lib/config";
import { readCookie, sessionCookie, clearCookie } from "~/server/http";

export const Route = createFileRoute("/oauth/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const { uiPublicUrl } = getConfig();
    try {
      const url = new URL(request.url);
      const { session } = await (await getOAuthClient()).callback(url.searchParams);
      await cacheIdentity(session.did);
      await createBoard(session);
      const previous = readCookie(request, WEB_SESSION_COOKIE_NAME);
      if (previous) await deleteWebSession(previous);
      const token = await createWebSession(session.did);
      const response = Response.redirect(uiPublicUrl, 302);
      response.headers.append("set-cookie", sessionCookie(
        WEB_SESSION_COOKIE_NAME,
        token,
        WEB_SESSION_MAX_AGE_SECONDS,
      ));
      response.headers.append("set-cookie", clearCookie(LEGACY_SESSION_COOKIE_NAME));
      return response;
    } catch (error) {
      console.error("OAuth callback failed", error);
      return Response.redirect(`${uiPublicUrl}/?error=login`, 302);
    }
  } } },
});
