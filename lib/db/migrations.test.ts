import assert from "node:assert/strict";
import { test } from "bun:test";
import { CamelCasePlugin, Kysely, sql } from "kysely";
import { BunSqliteDialect } from "kysely-bun-worker/normal";
import type { DatabaseSchema } from "./schema";
import {
  INITIAL_MIGRATION_NAME,
  OAUTH_LOCK_MIGRATION_NAME,
  PRIVATE_FOLLOWS_MIGRATION_NAME,
  REACTION_EMOJI_MIGRATION_NAME,
  migrateDatabase,
} from "./migrations";

test("a fresh database includes emoji reactions", async () => {
  const db = createDatabase();
  try {
    await migrateDatabase(db);

    assert.deepEqual(await migrationNames(db), [
      INITIAL_MIGRATION_NAME,
      REACTION_EMOJI_MIGRATION_NAME,
      PRIVATE_FOLLOWS_MIGRATION_NAME,
      OAUTH_LOCK_MIGRATION_NAME,
    ]);
    const tables = (await db.introspection.getTables()).map(({ name }) => name);
    assert.equal(tables.includes("removal"), true);
    const reaction = (await db.introspection.getTables()).find(
      ({ name }) => name === "reaction",
    );
    assert.equal(reaction?.columns.some(({ name }) => name === "emoji"), true);
    await sql`
      INSERT INTO reaction (
        uri, cid, space_uri, author_did, subject_uri, subject_cid,
        created_at, indexed_at
      ) VALUES (
        'at://reaction', 'reaction-cid', 'at://space', 'did:plc:author',
        'at://post', 'post-cid', '2026-01-01', '2026-01-01'
      )
    `.execute(db);
    const storedReaction = await sql<{ emoji: string }>`
      SELECT emoji FROM reaction WHERE uri = 'at://reaction'
    `.execute(db);
    assert.equal(storedReaction.rows[0]?.emoji, "⭐");
    assert.equal(tables.includes("private_follow"), true);
    assert.equal(tables.includes("follow_request"), false);
    assert.equal(tables.includes("auth_lock"), true);
    assert.equal(
      (await db.introspection.getTables()).some(
        ({ name }) => name === "migration",
      ),
      false,
    );
  } finally {
    await db.destroy();
  }
});

function createDatabase(): Kysely<DatabaseSchema> {
  return new Kysely<DatabaseSchema>({
    dialect: new BunSqliteDialect({ url: ":memory:" }),
    plugins: [new CamelCasePlugin()],
  });
}

async function migrationNames(
  db: Kysely<DatabaseSchema>,
): Promise<string[]> {
  const result = await sql<{ name: string }>`
    SELECT name FROM kysely_migration ORDER BY name
  `.execute(db);
  return result.rows.map(({ name }) => name);
}
