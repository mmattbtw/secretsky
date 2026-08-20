import assert from "node:assert/strict";
import { test } from "bun:test";
import { CamelCasePlugin, Kysely } from "kysely";
import { BunSqliteDialect } from "kysely-bun-worker/normal";
import { migrateDatabase } from "../db/migrations";
import type { DatabaseSchema } from "../db/schema";
import { createDatabaseLock } from "./lock";

test("OAuth credential operations with the same key are serialized", async () => {
  const db = new Kysely<DatabaseSchema>({
    dialect: new BunSqliteDialect({ url: ":memory:" }),
    plugins: [new CamelCasePlugin()],
  });
  try {
    await migrateDatabase(db);
    const lock = createDatabaseLock(db);
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = lock("did:plc:test", async () => {
      order.push("first started");
      await firstCanFinish;
      order.push("first finished");
    });
    while (order.length === 0) await sleep(1);

    const second = lock("did:plc:test", async () => {
      order.push("second started");
    });
    await sleep(50);
    assert.deepEqual(order, ["first started"]);

    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(order, [
      "first started",
      "first finished",
      "second started",
    ]);
  } finally {
    await db.destroy();
  }
});

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
