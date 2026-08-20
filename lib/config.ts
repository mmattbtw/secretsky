export const SPACE_TYPE = "at.secretsky.feed";
export const CONNECTIONS_SPACE_TYPE = "at.secretsky.connections";
export const FOLLOW_COLLECTION = "at.secretsky.follow";
export const POST_COLLECTION = "at.secretsky.post";
export const REACTION_COLLECTION = "at.secretsky.reaction";
// Kept as an internal compatibility constant while the alpha sync code is
// shared with the alpha reference implementation. secretsky never creates
// records in this collection.
export const POSITION_COLLECTION = "at.secretsky.position";
export const REMOVAL_COLLECTION = "at.secretsky.removal";
export const SECRETSKY_PERMISSION_SET = "at.secretsky.permissions";
export const BOARD_SKEY = "self";
export const DEFAULT_SECRETSKY_ACCOUNT_DID =
  "did:plc:2abnn6euj4gjngt23bxz3tnk";

export const OAUTH_SCOPE = [
  "atproto",
  "blob?accept=image/jpeg&accept=image/png&accept=image/webp",
  `include:${SECRETSKY_PERMISSION_SET}`,
].join(" ");

export type Config = {
  development: boolean;
  publishLexicons: boolean;
  hostname: string;
  port: number;
  syncPollInterval?: number;
  managingAppPublicUrl: string;
  uiPublicUrl: string;
  syncInternalUrl: string;
  devIntrospectUrl?: string;
  plcUrl: string;
  bskyUrl: string;
  managingAppDid: string;
  managingAppService: string;
  secretskyAccountDid: string;
  databasePath: string;
  blobDirectory?: string;
};

type Environment = Record<string, string | undefined>;

export function getConfig(): Config {
  return readConfig(process.env);
}

export function readConfig(
  environment: Environment = process.env,
): Config {
  const managingAppDid =
    environment.MANAGING_APP_DID ?? "did:web:secretsky.at";
  const managingAppPublicUrl = absoluteUrl(
    "MANAGING_APP_PUBLIC_URL",
    environment.MANAGING_APP_PUBLIC_URL ?? "https://secretsky.at",
  );
  const syncInternalUrl = loopbackUrl(
    "SYNC_INTERNAL_URL",
    environment.SYNC_INTERNAL_URL ?? "http://127.0.0.1:3001",
  );
  return {
    development: environment.NODE_ENV !== "production",
    publishLexicons: boolean(
      environment.PUBLISH_LEXICONS ?? "false",
      "PUBLISH_LEXICONS",
    ),
    hostname: environment.SECRETSKY_HOST ?? "127.0.0.1",
    port: integer(
      environment.SECRETSKY_PORT ?? "3000",
      "SECRETSKY_PORT",
      1,
      65535,
    ),
    syncPollInterval: optionalInteger(
      environment.SYNC_POLL_INTERVAL_MS,
      "SYNC_POLL_INTERVAL_MS",
      1000,
    ),
    managingAppPublicUrl,
    uiPublicUrl: absoluteUrl(
      "UI_PUBLIC_URL",
      environment.UI_PUBLIC_URL ?? "https://secretsky.at",
    ),
    syncInternalUrl,
    devIntrospectUrl: optionalAbsoluteUrl(
      "DEV_INTROSPECT_URL",
      environment.DEV_INTROSPECT_URL,
    ),
    plcUrl: absoluteUrl(
      "PLC_URL",
      environment.PLC_URL ?? "http://localhost:2582",
    ),
    bskyUrl: absoluteUrl(
      "BSKY_URL",
      environment.BSKY_URL ?? "https://api.bsky.app",
    ),
    managingAppDid,
    managingAppService: `${managingAppDid}#secretsky`,
    secretskyAccountDid: did(
      "SECRETSKY_ACCOUNT_DID",
      environment.SECRETSKY_ACCOUNT_DID ?? DEFAULT_SECRETSKY_ACCOUNT_DID,
    ),
    databasePath: environment.DATABASE_PATH ?? "secretsky.db",
    blobDirectory: environment.BLOB_DIRECTORY,
  };
}

function did(name: string, value: string): string {
  if (!/^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(value)) {
    throw new Error(`${name} must be a DID`);
  }
  return value;
}

function boolean(value: string, name: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export function boardUri(ownerDid: string): string {
  return `at://${ownerDid}/space/${SPACE_TYPE}/${BOARD_SKEY}`;
}

export const feedUri = boardUri;

export function connectionsUri(ownerDid: string): string {
  return `at://${ownerDid}/space/${CONNECTIONS_SPACE_TYPE}/${BOARD_SKEY}`;
}

function absoluteUrl(name: string, value: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

function loopbackUrl(name: string, value: string): string {
  const normalized = absoluteUrl(name, value);
  const url = new URL(normalized);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  ) {
    throw new Error(`${name} must be an HTTP loopback URL`);
  }
  return normalized;
}

function optionalAbsoluteUrl(
  name: string,
  value: string | undefined,
): string | undefined {
  return value ? absoluteUrl(name, value) : undefined;
}

function optionalInteger(
  value: string | undefined,
  name: string,
  minimum: number,
): number | undefined {
  return value === undefined || value === ""
    ? undefined
    : integer(value, name, minimum);
}

function integer(
  value: string,
  name: string,
  minimum: number,
  maximum?: number,
): number {
  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    (maximum !== undefined && parsed > maximum)
  ) {
    const range = maximum
      ? `from ${minimum} through ${maximum}`
      : `of at least ${minimum}`;
    throw new Error(`${name} must be an integer ${range}`);
  }
  return parsed;
}
