import { createFileRoute } from "@tanstack/react-router";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { createBoard } from "@/lib/atproto/actions";
import { cacheIdentity } from "@/lib/atproto/identity";
import { getBulletinCapabilities } from "@/lib/auth/bulletin-capabilities";
import { getOAuthClient } from "@/lib/auth/client";
import {
  isSpacesCompatibilityError,
  supportsSecretskySpaces,
} from "@/lib/auth/spaces-compatibility";
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
    let session: OAuthSession | undefined;
    try {
      const url = new URL(request.url);
      ({ session } = await (await getOAuthClient()).callback(url.searchParams));
      const capabilities = await getBulletinCapabilities(session, session.did);
      if (!supportsSecretskySpaces(capabilities)) {
        await discardSession(session);
        return loginRedirect(uiPublicUrl, "incompatible-pds");
      }
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
      if (isSpacesCompatibilityError(error)) {
        if (session) await discardSession(session);
        console.warn("OAuth rejected a PDS without Spaces support", error);
        return loginRedirect(uiPublicUrl, "incompatible-pds");
      }
      console.error("OAuth callback failed", error);
      return loginRedirect(uiPublicUrl, "login");
    }
  } } },
});

async function discardSession(session: OAuthSession): Promise<void> {
  await session.signOut().catch((error) => {
    console.warn("Could not revoke incompatible OAuth session", error);
  });
}

function loginRedirect(
  uiPublicUrl: string,
  error: "incompatible-pds" | "login",
): Response {
  const url = new URL(uiPublicUrl);
  url.searchParams.set("error", error);
  return Response.redirect(url, 302);
}
