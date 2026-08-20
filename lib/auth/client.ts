import {
  NodeOAuthClient,
  type AtprotoDid,
  type NodeSavedSession,
  type NodeSavedState,
} from "@atproto/oauth-client-node";
import { sql } from "kysely";
import { isIP } from "node:net";
import { getConfig } from "../config";
import { resolveHandle } from "../atproto/identity";
import { getQueryDb } from "../db";
import { getClientMetadata } from "./metadata";
import { createDatabaseLock } from "./lock";

let oauthClient: NodeOAuthClient | undefined;

export async function getOAuthClient(): Promise<NodeOAuthClient> {
  if (oauthClient) return oauthClient;
  const config = getConfig();

  oauthClient = new NodeOAuthClient({
    clientMetadata: getClientMetadata(),
    allowHttp: isLoopbackApp(config.uiPublicUrl),
    plcDirectoryUrl: config.plcUrl,
    handleResolver: {
      async resolve(handle) {
        return (await resolveHandle(handle)) as AtprotoDid | null;
      },
    },
    stateStore: sqliteStore<NodeSavedState>("authState"),
    sessionStore: sqliteStore<NodeSavedSession>("authSession"),
    requestLock: createDatabaseLock(getQueryDb()),
  });

  return oauthClient;
}

function isLoopbackApp(uiPublicUrl: string): boolean {
  const hostname = new URL(uiPublicUrl).hostname;
  const unwrapped = hostname.replace(/^\[|\]$/g, "");
  return (
    hostname === "localhost" ||
    unwrapped === "::1" ||
    (isIP(unwrapped) === 4 && unwrapped.startsWith("127."))
  );
}

export async function listStoredSessionDids(): Promise<string[]> {
  const rows = await getQueryDb()
    .selectFrom("authSession")
    .select("key")
    .orderBy(sql`rowid`)
    .execute();
  return rows.map(({ key }) => key);
}

function sqliteStore<T>(table: "authState" | "authSession") {
  return {
    async get(key: string): Promise<T | undefined> {
      const result = await sql<{ value: string }>`
        SELECT value FROM ${sql.table(table)} WHERE key = ${key}
      `.execute(getQueryDb());
      const row = result.rows[0];
      return row ? (JSON.parse(row.value) as T) : undefined;
    },
    async set(key: string, value: T): Promise<void> {
      await sql`
        INSERT INTO ${sql.table(table)} (key, value)
        VALUES (${key}, ${JSON.stringify(value)})
        ON CONFLICT (key) DO UPDATE SET value = excluded.value
      `.execute(getQueryDb());
    },
    async del(key: string): Promise<void> {
      await sql`
        DELETE FROM ${sql.table(table)} WHERE key = ${key}
      `.execute(getQueryDb());
    },
  };
}
