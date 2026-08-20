# Deploy SecretSky

This project targets the AT Protocol Spaces alpha. Deploy it only for testing,
with accounts and PDSes that support the alpha APIs.

## 1. Publish the Lexicons

SecretSky uses the `at.secretsky.*` namespace, which is tied to
`secretsky.at`. Add this DNS record before publishing the schemas:

```text
_lexicon.secretsky.at  TXT  "did=did:plc:tas6hj2xjrqben5653v5kohk"
```

The Lexicon authority is Matt's account, `matt.evil.gay`
(`did:plc:tas6hj2xjrqben5653v5kohk`). Create an app password on that account,
then publish the custom schemas:

```sh
export LEXICON_AUTHORITY_DID="did:plc:tas6hj2xjrqben5653v5kohk"
export LEXICON_AUTHORITY_HANDLE="matt.evil.gay"
export LEXICON_AUTHORITY_PASSWORD="your-app-password"
export LEXICON_AUTHORITY_PDS="https://evil.gay"
bun install
bun run publish-lexicons
```

The publisher verifies that the authenticated account has the configured DID
before writing anything. Run the publish command again after any Lexicon
change.

## 2. Verify the application

```sh
bun run check
bun run build
```

The build regenerates the TypeScript client from the vendored alpha protocol
Lexicons and creates a Nitro server bundle with its Bun preset.

## 3. Deploy the container

The included Dockerfile uses Bun for dependency installation, builds, and the
runtime. It works on a container host such as Railway or Fly.io.

- Expose port `3000` through an HTTPS domain.
- Mount persistent storage at `/data`.
- Keep the service at one replica while using SQLite.
- Do not expose the sync listener on port `3001`; it is loopback-only.

Set these production environment variables:

```text
NODE_ENV=production
SECRETSKY_HOST=0.0.0.0
SECRETSKY_PORT=3000
PUBLISH_LEXICONS=false
MANAGING_APP_PUBLIC_URL=https://secretsky.at
UI_PUBLIC_URL=https://secretsky.at
DATABASE_PATH=/data/secretsky.db
BLOB_DIRECTORY=/data/secretsky-blobs
SYNC_INTERNAL_URL=http://127.0.0.1:3001
MANAGING_APP_DID=did:web:secretsky.at
SECRETSKY_ACCOUNT_DID=did:plc:2abnn6euj4gjngt23bxz3tnk
PLC_URL=https://plc.directory
BSKY_URL=https://api.bsky.app
```

These are three intentionally separate identities:

- `did:plc:2abnn6euj4gjngt23bxz3tnk` is the canonical SecretSky account.
- `did:plc:tas6hj2xjrqben5653v5kohk` publishes the `at.secretsky.*` Lexicons.
- `did:web:secretsky.at` is the managing-app service identity.

The managing-app DID document is served at `/.well-known/did.json`. Keep its
service URL aligned with the public HTTPS origin so Spaces-compatible PDSes can
call the access and notification endpoints.

## 4. Smoke test

After deployment, verify the public protocol endpoints:

```sh
curl --fail https://secretsky.at/.well-known/did.json
curl --fail https://secretsky.at/oauth-client-metadata.json
curl --fail https://secretsky.at/sync/health
```

Then use two test accounts:

1. Sign in as the owner and create a private feed.
2. Sign in as another account and privately follow the owner.
3. Confirm the owner's feed remains locked.
4. As the owner, privately follow the second account back.
5. Confirm both accounts can read, post, reply, and react.
6. Remove either private follow and confirm feed access is revoked.

Back up the persistent volume. It contains OAuth sessions, synchronized
indexes, and cached blobs. Private follows remain authoritative records on each
user's PDS.
