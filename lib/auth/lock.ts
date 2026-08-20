import { randomUUID } from "node:crypto";
import type { RuntimeLock } from "@atproto/oauth-client-node";
import type { Kysely } from "kysely";
import type { DatabaseSchema } from "../db/schema";

const LEASE_MS = 30_000;
const RENEW_MS = 10_000;
const WAIT_MS = 25;
const WAIT_TIMEOUT_MS = 30_000;

export function createDatabaseLock(
  db: Kysely<DatabaseSchema>,
): RuntimeLock {
  return async <T>(key: string, operation: () => T | PromiseLike<T>) => {
    const owner = randomUUID();
    const deadline = Date.now() + WAIT_TIMEOUT_MS;

    while (!(await tryAcquire(db, key, owner))) {
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for OAuth credential lock: ${key}`);
      }
      await delay(WAIT_MS);
    }

    let renewal = Promise.resolve();
    const renewTimer = setInterval(() => {
      renewal = renewal
        .then(() => renew(db, key, owner))
        .catch((error) => console.error("could not renew OAuth lock", error));
    }, RENEW_MS);
    renewTimer.unref();

    try {
      return await operation();
    } finally {
      clearInterval(renewTimer);
      await renewal;
      await db
        .deleteFrom("authLock")
        .where("key", "=", key)
        .where("owner", "=", owner)
        .execute();
    }
  };
}

async function tryAcquire(
  db: Kysely<DatabaseSchema>,
  key: string,
  owner: string,
): Promise<boolean> {
  const now = Date.now();
  const acquired = await db
    .insertInto("authLock")
    .values({ key, owner, expiresAt: now + LEASE_MS })
    .onConflict((conflict) =>
      conflict
        .column("key")
        .doUpdateSet({ owner, expiresAt: now + LEASE_MS })
        .where("authLock.expiresAt", "<=", now),
    )
    .returning("owner")
    .executeTakeFirst();
  return acquired?.owner === owner;
}

async function renew(
  db: Kysely<DatabaseSchema>,
  key: string,
  owner: string,
): Promise<void> {
  await db
    .updateTable("authLock")
    .set({ expiresAt: Date.now() + LEASE_MS })
    .where("key", "=", key)
    .where("owner", "=", owner)
    .execute();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
