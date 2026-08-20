import { CamelCasePlugin, Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-worker/normal";
import { getConfig } from "../config";
import type { DatabaseSchema } from "./schema";

let queryDatabase: Kysely<DatabaseSchema> | undefined;

export function getQueryDb(): Kysely<DatabaseSchema> {
  if (!queryDatabase) {
    queryDatabase = new Kysely<DatabaseSchema>({
      dialect: new BunSqliteDialect({
        url: getConfig().databasePath,
        onCreateConnection: async (connection) => {
          await connection.executeQuery({
            sql: "PRAGMA journal_mode = WAL",
            parameters: [],
            query: { kind: "RawNode", sqlFragments: [], parameters: [] },
          } as never);
          await connection.executeQuery({
            sql: "PRAGMA foreign_keys = ON",
            parameters: [],
            query: { kind: "RawNode", sqlFragments: [], parameters: [] },
          } as never);
        },
      }),
      plugins: [new CamelCasePlugin()],
    });
  }
  return queryDatabase;
}

export async function closeDb(): Promise<void> {
  if (!queryDatabase) return;
  const database = queryDatabase;
  queryDatabase = undefined;
  await database.destroy();
}
