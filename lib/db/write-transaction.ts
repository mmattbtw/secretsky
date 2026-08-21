import { sql, type Kysely } from "kysely";
import type { DatabaseSchema } from "./schema";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [25, 100];

export async function writeTransaction<T>(
  db: Kysely<DatabaseSchema>,
  operation: (transaction: Kysely<DatabaseSchema>) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await db.connection().execute(async (connection) => {
        let active = false;
        try {
          await sql.raw("BEGIN IMMEDIATE").execute(connection);
          active = true;
          const result = await operation(connection);
          await sql.raw("COMMIT").execute(connection);
          active = false;
          return result;
        } catch (error) {
          if (active) {
            await sql.raw("ROLLBACK").execute(connection).catch(() => undefined);
          }
          throw error;
        }
      });
    } catch (error) {
      if (!isDatabaseBusy(error) || attempt + 1 >= MAX_ATTEMPTS) throw error;
      await delay(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1) ?? 100);
    }
  }
}

export function isDatabaseBusy(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current !== "object") return false;
    const candidate = current as {
      code?: unknown;
      errno?: unknown;
      cause?: unknown;
    };
    if (
      candidate.code === "SQLITE_BUSY" ||
      candidate.code === "SQLITE_LOCKED" ||
      candidate.errno === 5 ||
      candidate.errno === 6
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
