import assert from "node:assert/strict";
import { test } from "bun:test";
import { CamelCasePlugin, Kysely, sql } from "kysely";
import { BunSqliteDialect } from "kysely-bun-worker/normal";
import type { DatabaseSchema } from "./schema";
import {
  NOTIFY_TOKEN_MIGRATION_NAME,
  SPACE_CHECKPOINT_MIGRATION_NAME,
  INITIAL_MIGRATION_NAME,
  OAUTH_LOCK_MIGRATION_NAME,
  POST_VERSIONS_MIGRATION_NAME,
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
      POST_VERSIONS_MIGRATION_NAME,
      SPACE_CHECKPOINT_MIGRATION_NAME,
      NOTIFY_TOKEN_MIGRATION_NAME,
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
    assert.equal(tables.includes("post_version"), true);
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


test("the checkpoint migration upgrades existing watches without deleting their state", async () => {
  const db = createDatabase();
  try {
    await migrateDatabase(db);
    // Reconstruct the already-applied 005 schema and migration ledger.
    await sql`ALTER TABLE sync_space DROP COLUMN space_rev`.execute(db);
    await sql`ALTER TABLE sync_space DROP COLUMN notify_token`.execute(db);
    await sql`ALTER TABLE sync_space ADD COLUMN registration_expires_at text`.execute(db);
    await sql`DELETE FROM kysely_migration WHERE name IN (${SPACE_CHECKPOINT_MIGRATION_NAME}, ${NOTIFY_TOKEN_MIGRATION_NAME})`.execute(db);
    await sql`INSERT INTO sync_space (space_uri, authority_did, registration_expires_at, updated_at)
      VALUES ('at://space', 'did:plc:owner', '2026-10-02', '2026-10-01')`.execute(db);
    await migrateDatabase(db);
    await migrateDatabase(db);
    const result = await sql<{ spaceRev: string | null; notifyToken: string | null; authorityDid: string }>`
      SELECT space_rev, notify_token, authority_did FROM sync_space WHERE space_uri = 'at://space'
    `.execute(db);
    // registerNotify registrations are replaced by a token issued on the next authorization.
    assert.deepEqual(result.rows, [{ spaceRev: null, notifyToken: null, authorityDid: "did:plc:owner" }]);
    const columns = (await db.introspection.getTables())
      .find(({ name }) => name === "sync_space")?.columns.map(({ name }) => name);
    assert.equal(columns?.includes("registration_expires_at"), false);
  } finally {
    await db.destroy();
  }
});
