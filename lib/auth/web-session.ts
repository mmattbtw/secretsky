import { createHash, randomBytes } from "node:crypto";
import { getConfig } from "../config";
import { getQueryDb } from "../db";

export const WEB_SESSION_COOKIE_NAME = "secretsky-session";
export const LEGACY_SESSION_COOKIE_NAME = "bulletin-session";
export const WEB_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function createWebSession(did: string): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + WEB_SESSION_MAX_AGE_SECONDS * 1000,
  );
  const db = getQueryDb();

  await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom("webSession")
      .where("expiresAt", "<=", now.toISOString())
      .execute();
    await trx
      .insertInto("webSession")
      .values({
        tokenHash: hashToken(token),
        did,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      })
      .execute();
  });

  return token;
}

export async function resolveWebSession(token: string): Promise<string | null> {
  if (!validToken(token)) return null;
  const row = await getQueryDb()
    .selectFrom("webSession")
    .select("did")
    .where("tokenHash", "=", hashToken(token))
    .where("expiresAt", ">", new Date().toISOString())
    .executeTakeFirst();
  return row?.did ?? null;
}

export async function deleteWebSession(token: string): Promise<string | null> {
  if (!validToken(token)) return null;
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  const db = getQueryDb();
  return db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("webSession")
      .select("did")
      .where("tokenHash", "=", tokenHash)
      .where("expiresAt", ">", now)
      .executeTakeFirst();
    await trx
      .deleteFrom("webSession")
      .where("tokenHash", "=", tokenHash)
      .execute();
    return row?.did ?? null;
  });
}

export async function deleteWebSessionsForDid(did: string): Promise<void> {
  await getQueryDb().deleteFrom("webSession").where("did", "=", did).execute();
}

export function webSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(getConfig().uiPublicUrl).protocol === "https:",
    path: "/",
    maxAge: WEB_SESSION_MAX_AGE_SECONDS,
  };
}

function validToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}
