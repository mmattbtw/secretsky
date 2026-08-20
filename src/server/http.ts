import { getConfig } from "@/lib/config";
import { isAllowedRequestOrigin } from "@/lib/http-origin";

export function json(body: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(body, { status, headers });
}

export function errorResponse(error: unknown, fallback: string, status = 400) {
  const message = error instanceof Error ? error.message : fallback;
  return json({ error: message }, status);
}

export function methodNotAllowed(allowed: readonly string[]) {
  return json(
    { error: "Method Not Allowed" },
    405,
    { allow: allowed.join(", ") },
  );
}

export function apiNotFound() {
  return json({ error: "Not Found" }, 404);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const { development, uiPublicUrl } = getConfig();
  if (!isAllowedRequestOrigin(origin, uiPublicUrl, development)) {
    throw new Error("Cross-origin request rejected");
  }
}

export function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(/;\s*/)) {
    const equals = part.indexOf("=");
    if (equals > 0 && part.slice(0, equals) === name) {
      return decodeURIComponent(part.slice(equals + 1));
    }
  }
  return undefined;
}

export function sessionCookie(name: string, value: string, maxAge: number) {
  const secure = new URL(getConfig().uiPublicUrl).protocol === "https:";
  return [
    `${name}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function clearCookie(name: string) {
  return `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}
