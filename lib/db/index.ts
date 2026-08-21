import { CamelCasePlugin, Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-worker/normal";
import { getConfig } from "../config";
import type { DatabaseSchema } from "./schema";

export const DATABASE_BUSY_TIMEOUT_MS = 5_000;

let queryDatabase: Kysely<DatabaseSchema> | undefined;

export function getQueryDb(): Kysely<DatabaseSchema> {
  if (!queryDatabase) {
    queryDatabase = createQueryDatabase(getConfig().databasePath);
  }
  return queryDatabase;
}

export function createQueryDatabase(databasePath: string): Kysely<DatabaseSchema> {
  return new Kysely<DatabaseSchema>({
    dialect: new BunSqliteDialect({
      url: databasePath,
      onCreateConnection: async (connection) => {
        for (const statement of [
          `PRAGMA busy_timeout = ${DATABASE_BUSY_TIMEOUT_MS}`,
          "PRAGMA journal_mode = WAL",
          "PRAGMA foreign_keys = ON",
        ]) {
          await connection.executeQuery({
            sql: statement,
            parameters: [],
            query: { kind: "RawNode", sqlFragments: [], parameters: [] },
          } as never);
        }
      },
    }),
    plugins: [new CamelCasePlugin()],
  });
}

export async function closeDb(): Promise<void> {
  if (!queryDatabase) return;
  const database = queryDatabase;
  queryDatabase = undefined;
  await database.destroy();
}
