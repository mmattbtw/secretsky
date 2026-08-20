import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";
import { parseEnv } from "node:util";
import { readConfig } from "./config";

async function readEnv(
  name: string,
): Promise<Record<string, string | undefined>> {
  return parseEnv(await readFile(`env/${name}.env`, "utf8"));
}

test("local and dev envs configure distinct behavior", async () => {
  const local = readConfig(await readEnv("local"));
  const dev = readConfig(await readEnv("dev"));

  assert.equal(local.development, true);
  assert.equal(local.publishLexicons, true);
  assert.equal(local.databasePath, "secretsky.db");
  assert.equal(local.bskyUrl, "https://api.bsky.app");

  assert.equal(dev.development, true);
  assert.equal(dev.publishLexicons, false);
  assert.equal(dev.databasePath, "secretsky-dev.db");
  assert.equal(dev.syncPollInterval, 10000);
  assert.equal(dev.managingAppPublicUrl, "https://secretsky.at");
  assert.equal(dev.uiPublicUrl, "http://127.0.0.1:3000");
  assert.equal(dev.managingAppDid, "did:web:secretsky.at");
  assert.equal(dev.managingAppService, "did:web:secretsky.at#secretsky");
  assert.equal(
    dev.secretskyAccountDid,
    "did:plc:2abnn6euj4gjngt23bxz3tnk",
  );
  assert.equal(dev.bskyUrl, "https://api.bsky.app");
});

test("config validation rejects invalid values", async () => {
  const dev = await readEnv("dev");

  assert.throws(() => readConfig({ ...dev, SECRETSKY_PORT: "70000" }));
  assert.throws(() =>
    readConfig({ ...dev, SYNC_POLL_INTERVAL_MS: "999" }),
  );
  assert.throws(() => readConfig({ ...dev, PUBLISH_LEXICONS: "yes" }));
  assert.throws(() =>
    readConfig({ ...dev, SYNC_INTERNAL_URL: "http://0.0.0.0:3001" }),
  );
  assert.throws(() =>
    readConfig({ ...dev, SECRETSKY_ACCOUNT_DID: "not-a-did" }),
  );
  assert.equal(
    readConfig({ ...dev, SYNC_POLL_INTERVAL_MS: "300000" })
      .syncPollInterval,
    300000,
  );
});
