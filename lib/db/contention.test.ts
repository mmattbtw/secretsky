import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { sql } from "kysely";
import {
  createQueryDatabase,
  DATABASE_BUSY_TIMEOUT_MS,
} from "./index";
import { writeTransaction } from "./write-transaction";

test("a second process waits for the SQLite writer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "secretsky-contention-"));
  const databasePath = join(directory, "test.db");
  const db = createQueryDatabase(databasePath);
  let holder: ReturnType<typeof spawn> | undefined;

  try {
    await sql`CREATE TABLE writes (source TEXT NOT NULL)`.execute(db);
    const configured = await sql<{ timeout: number }>`PRAGMA busy_timeout`.execute(db);
    assert.equal(configured.rows[0]?.timeout, DATABASE_BUSY_TIMEOUT_MS);

    holder = spawn(process.execPath, ["-e", HOLDER_PROCESS, databasePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exited = new Promise<number | null>((resolve) => {
      holder?.once("exit", resolve);
    });
    const ready = await new Promise<string>((resolve, reject) => {
      holder?.stdout?.once("data", (chunk) => resolve(String(chunk)));
      holder?.once("error", reject);
    });
    assert.match(ready, /locked/);

    const startedAt = Date.now();
    await sql`INSERT INTO writes (source) VALUES ('request')`.execute(db);
    assert.ok(Date.now() - startedAt >= 100);
    assert.equal(await exited, 0);

    const rows = await sql<{ source: string }>`
      SELECT source FROM writes ORDER BY rowid
    `.execute(db);
    assert.deepEqual(rows.rows.map(({ source }) => source), ["holder", "request"]);
  } finally {
    holder?.kill();
    await db.destroy();
    await rm(directory, { recursive: true, force: true });
  }
});

test("write transactions roll back and retry transient lock errors", async () => {
  const db = createQueryDatabase(":memory:");
  try {
    await sql`CREATE TABLE writes (value INTEGER NOT NULL)`.execute(db);
    let attempts = 0;
    await writeTransaction(db, async (transaction) => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("database is locked"), {
          code: "SQLITE_BUSY",
        });
      }
      await sql`INSERT INTO writes (value) VALUES (1)`.execute(transaction);
    });

    assert.equal(attempts, 2);
    const result = await sql<{ count: number }>`
      SELECT COUNT(*) AS count FROM writes
    `.execute(db);
    assert.equal(result.rows[0]?.count, 1);
  } finally {
    await db.destroy();
  }
});

const HOLDER_PROCESS = `
  import { Database } from "bun:sqlite";
  const database = new Database(process.argv[1]);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("BEGIN IMMEDIATE");
  database.exec("INSERT INTO writes (source) VALUES ('holder')");
  console.log("locked");
  await new Promise((resolve) => setTimeout(resolve, 300));
  database.exec("COMMIT");
  database.close();
`;
