import type { Kysely } from "kysely";
import {
  Migrator,
  type Migration,
  type MigrationProvider,
} from "kysely/migration";
import { getQueryDb } from "./index";
import type { DatabaseSchema } from "./schema";

export const INITIAL_MIGRATION_NAME = "001_initial";
export const REACTION_EMOJI_MIGRATION_NAME = "002_reaction_emoji";
export const PRIVATE_FOLLOWS_MIGRATION_NAME = "003_private_follows";
export const OAUTH_LOCK_MIGRATION_NAME = "004_oauth_lock";

const APPLICATION_TABLES = [
  "account",
  "auth_session",
  "auth_state",
  "auth_lock",
  "board",
  "follow_request",
  "private_follow",
  "reaction",
  "removal",
  "note_position",
  "post",
  "space_blob",
  "sync_repo",
  "sync_space",
  "web_session",
] as const;

const initialMigration: Migration = {
  async up(db) {
    const tables = new Set(
      (await db.introspection.getTables()).map(({ name }) => name),
    );

    const existingTables = APPLICATION_TABLES.filter((table) =>
      tables.has(table),
    );
    if (existingTables.length > 0) {
      throw new Error(
        `Cannot initialize over an unversioned schema: ${existingTables.join(", ")}`,
      );
    }

    await createInitialSchema(db);
  },

  async down(db) {
    for (const table of [...APPLICATION_TABLES].reverse()) {
      await db.schema.dropTable(table).ifExists().execute();
    }
  },
};

const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return {
      [INITIAL_MIGRATION_NAME]: initialMigration,
      [REACTION_EMOJI_MIGRATION_NAME]: {
        async up(db) {
          await db.schema
            .alterTable("reaction")
            .addColumn("emoji", "text", (column) =>
              column.notNull().defaultTo("⭐"),
            )
            .execute();
        },
        async down(db) {
          await db.schema.alterTable("reaction").dropColumn("emoji").execute();
        },
      },
      [PRIVATE_FOLLOWS_MIGRATION_NAME]: {
        async up(db) {
          await db.schema
            .createTable("privateFollow")
            .addColumn("uri", "text", (column) => column.primaryKey())
            .addColumn("cid", "text", (column) => column.notNull())
            .addColumn("spaceUri", "text", (column) => column.notNull())
            .addColumn("authorDid", "text", (column) => column.notNull())
            .addColumn("subjectDid", "text", (column) => column.notNull())
            .addColumn("createdAt", "text", (column) => column.notNull())
            .addColumn("indexedAt", "text", (column) => column.notNull())
            .execute();
          await db.schema
            .createIndex("privateFollowAuthorSubjectIdx")
            .unique()
            .on("privateFollow")
            .columns(["authorDid", "subjectDid"])
            .execute();
          await db.schema
            .createIndex("privateFollowSubjectIdx")
            .on("privateFollow")
            .columns(["subjectDid", "createdAt"])
            .execute();
          await db.schema.dropTable("followRequest").ifExists().execute();
        },
        async down(db) {
          await db.schema.dropTable("privateFollow").ifExists().execute();
          await db.schema
            .createTable("followRequest")
            .addColumn("requesterDid", "text", (column) => column.notNull())
            .addColumn("ownerDid", "text", (column) => column.notNull())
            .addColumn("status", "text", (column) => column.notNull())
            .addColumn("createdAt", "text", (column) => column.notNull())
            .addColumn("updatedAt", "text", (column) => column.notNull())
            .addPrimaryKeyConstraint("followRequestPrimaryKey", [
              "requesterDid",
              "ownerDid",
            ])
            .execute();
          await db.schema
            .createIndex("followRequestOwnerStatusIdx")
            .on("followRequest")
            .columns(["ownerDid", "status", "createdAt"])
            .execute();
        },
      },
      [OAUTH_LOCK_MIGRATION_NAME]: {
        async up(db) {
          await db.schema
            .createTable("authLock")
            .addColumn("key", "text", (column) => column.primaryKey())
            .addColumn("owner", "text", (column) => column.notNull())
            .addColumn("expiresAt", "integer", (column) => column.notNull())
            .execute();
        },
        async down(db) {
          await db.schema.dropTable("authLock").ifExists().execute();
        },
      },
    };
  },
};

export async function migrate(): Promise<void> {
  await migrateDatabase(getQueryDb());
}

export async function migrateDatabase(
  db: Kysely<DatabaseSchema>,
): Promise<void> {
  const migrator = new Migrator({ db, provider: migrationProvider });
  const { error } = await migrator.migrateToLatest();
  if (error) throw new Error("Database migration failed", { cause: error });
}

async function createInitialSchema(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("authState")
    .addColumn("key", "text", (column) => column.primaryKey())
    .addColumn("value", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("authSession")
    .addColumn("key", "text", (column) => column.primaryKey())
    .addColumn("value", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("account")
    .addColumn("did", "text", (column) => column.primaryKey())
    .addColumn("handle", "text")
    .addColumn("pdsUrl", "text")
    .addColumn("updatedAt", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("board")
    .addColumn("spaceUri", "text", (column) => column.primaryKey())
    .addColumn("ownerDid", "text", (column) => column.notNull().unique())
    .addColumn("createdAt", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("post")
    .addColumn("uri", "text", (column) => column.primaryKey())
    .addColumn("cid", "text", (column) => column.notNull())
    .addColumn("spaceUri", "text", (column) => column.notNull())
    .addColumn("authorDid", "text", (column) => column.notNull())
    .addColumn("text", "text", (column) => column.notNull())
    .addColumn("imageCid", "text")
    .addColumn("imageMime", "text")
    .addColumn("imageSize", "integer")
    .addColumn("imageAlt", "text")
    .addColumn("replyParentUri", "text")
    .addColumn("replyParentCid", "text")
    .addColumn("color", "text")
    .addColumn("rotation", "integer")
    .addColumn("x", "integer")
    .addColumn("y", "integer")
    .addColumn("createdAt", "text", (column) => column.notNull())
    .addColumn("indexedAt", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("reaction")
    .addColumn("uri", "text", (column) => column.primaryKey())
    .addColumn("cid", "text", (column) => column.notNull())
    .addColumn("spaceUri", "text", (column) => column.notNull())
    .addColumn("authorDid", "text", (column) => column.notNull())
    .addColumn("subjectUri", "text", (column) => column.notNull())
    .addColumn("subjectCid", "text", (column) => column.notNull())
    .addColumn("createdAt", "text", (column) => column.notNull())
    .addColumn("indexedAt", "text", (column) => column.notNull())
    .execute();
  await db.schema
    .createIndex("reactionSubjectIdx")
    .on("reaction")
    .columns(["spaceUri", "subjectUri", "createdAt"])
    .execute();
  await db.schema
    .createIndex("reactionActorSubjectIdx")
    .unique()
    .on("reaction")
    .columns(["spaceUri", "authorDid", "subjectUri"])
    .execute();

  await db.schema
    .createTable("followRequest")
    .addColumn("requesterDid", "text", (column) => column.notNull())
    .addColumn("ownerDid", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("createdAt", "text", (column) => column.notNull())
    .addColumn("updatedAt", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("followRequestPrimaryKey", [
      "requesterDid",
      "ownerDid",
    ])
    .execute();
  await db.schema
    .createIndex("followRequestOwnerStatusIdx")
    .on("followRequest")
    .columns(["ownerDid", "status", "createdAt"])
    .execute();
  await db.schema
    .createIndex("postBoardCreatedIdx")
    .on("post")
    .columns(["spaceUri", "createdAt desc"])
    .execute();

  await createRemovalTable(db);

  await db.schema
    .createTable("notePosition")
    .addColumn("uri", "text", (column) => column.primaryKey())
    .addColumn("cid", "text", (column) => column.notNull())
    .addColumn("spaceUri", "text", (column) => column.notNull())
    .addColumn("authorDid", "text", (column) => column.notNull())
    .addColumn("subjectUri", "text", (column) => column.notNull())
    .addColumn("subjectCid", "text", (column) => column.notNull())
    .addColumn("x", "integer", (column) => column.notNull())
    .addColumn("y", "integer", (column) => column.notNull())
    .addColumn("createdAt", "text", (column) => column.notNull())
    .addColumn("indexedAt", "text", (column) => column.notNull())
    .execute();
  await db.schema
    .createIndex("notePositionSubjectCreatedIdx")
    .on("notePosition")
    .columns(["spaceUri", "subjectUri", "subjectCid", "createdAt desc"])
    .execute();

  await db.schema
    .createTable("syncSpace")
    .addColumn("spaceUri", "text", (column) => column.primaryKey())
    .addColumn("authorityDid", "text", (column) => column.notNull())
    .addColumn("registrationExpiresAt", "text")
    .addColumn("lastError", "text")
    .addColumn("updatedAt", "text", (column) => column.notNull())
    .execute();

  await db.schema
    .createTable("syncRepo")
    .addColumn("spaceUri", "text", (column) => column.notNull())
    .addColumn("repoDid", "text", (column) => column.notNull())
    .addColumn("pdsUrl", "text", (column) => column.notNull())
    .addColumn("rev", "text", (column) => column.notNull())
    .addColumn("lthash", "blob", (column) => column.notNull())
    .addColumn("commitHash", "blob", (column) => column.notNull())
    .addColumn("updatedAt", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("syncRepoPrimaryKey", ["spaceUri", "repoDid"])
    .execute();

  await db.schema
    .createTable("spaceBlob")
    .addColumn("spaceUri", "text", (column) => column.notNull())
    .addColumn("repoDid", "text", (column) => column.notNull())
    .addColumn("cid", "text", (column) => column.notNull())
    .addColumn("mimeType", "text", (column) => column.notNull())
    .addColumn("size", "integer", (column) => column.notNull())
    .addColumn("updatedAt", "text", (column) => column.notNull())
    .addPrimaryKeyConstraint("spaceBlobPrimaryKey", [
      "spaceUri",
      "repoDid",
      "cid",
    ])
    .execute();

  await db.schema
    .createTable("webSession")
    .addColumn("tokenHash", "text", (column) => column.primaryKey())
    .addColumn("did", "text", (column) => column.notNull())
    .addColumn("createdAt", "text", (column) => column.notNull())
    .addColumn("expiresAt", "text", (column) => column.notNull())
    .execute();
  await db.schema
    .createIndex("webSessionDidIdx")
    .on("webSession")
    .column("did")
    .execute();
}

async function createRemovalTable(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("removal")
    .addColumn("uri", "text", (column) => column.primaryKey())
    .addColumn("cid", "text", (column) => column.notNull())
    .addColumn("spaceUri", "text", (column) => column.notNull())
    .addColumn("authorDid", "text", (column) => column.notNull())
    .addColumn("subjectUri", "text", (column) => column.notNull())
    .addColumn("subjectCid", "text", (column) => column.notNull())
    .addColumn("createdAt", "text", (column) => column.notNull())
    .addColumn("indexedAt", "text", (column) => column.notNull())
    .execute();
  await db.schema
    .createIndex("removalSubjectCreatedIdx")
    .on("removal")
    .columns(["spaceUri", "subjectUri", "createdAt desc"])
    .execute();
}
