import type { OAuthSession } from "@atproto/oauth-client-node";
import { getOAuthClient } from "./client";
import {
  deleteWebSession,
  resolveWebSession,
  WEB_SESSION_COOKIE_NAME,
} from "./web-session";

export async function getSessionFromToken(token?: string | null): Promise<OAuthSession | null> {
  if (!token) return null;
  const did = await resolveWebSession(token);
  if (!did) return null;
  try {
    const session = await (await getOAuthClient()).restore(did);
    if (session.did !== did) throw new Error("OAuth session subject mismatch");
    return session;
  } catch {
    await deleteWebSession(token);
    return null;
  }
}

export function sessionTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(/;\s*/)) {
    const equals = part.indexOf("=");
    if (equals > 0 && part.slice(0, equals) === WEB_SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(equals + 1));
    }
  }
  return null;
}

export function getSessionFromRequest(request: Request) {
  return getSessionFromToken(sessionTokenFromRequest(request));
}

export async function requireSessionFromRequest(request: Request): Promise<OAuthSession> {
  const session = await getSessionFromRequest(request);
  if (!session) throw new Error("Unauthorized");
  return session;
}
