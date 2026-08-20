# SecretSky

SecretSky is a small private microblog at <https://secretsky.at>. It is built with TanStack Start, TypeScript,
Bun, and the AT Protocol Spaces alpha. Every account owns a permissioned feed
and an owner-only connections Space. Following someone writes an
`at.secretsky.follow` record into your connections Space. Their feed opens only
after they privately follow you back.

> Spaces are alpha software. They provide access control, not end-to-end
> encryption. Use test data, expect breaking protocol changes, and do not use
> this project for secrets or production-sensitive content.

## What is implemented

- AT Protocol OAuth sign-in and durable server-side sessions
- separate feed and connections Spaces per account, using a managing-app policy
- private `at.secretsky.follow` records stored on each user's PDS
- reciprocal follow gating with no approval or declined state
- posts, threaded replies, selectable emoji reactions, author deletion, and owner moderation
- AT Protocol records for follows, posts, emoji reactions, and moderation inside Spaces
- PDS-facing `checkUserAccess`, write notification, and deletion endpoints
- direct Space synchronization into Bun-native SQLite
- responsive TanStack Start UI with server-rendered route data and SSE refreshes

The Space authority calls SecretSky's authenticated `checkUserAccess`
endpoint. The feed policy grants access only to the owner or a pair of accounts
with reciprocal private follow records. A connections Space grants user access
only to its owner. SQLite contains a synchronized index, not the authoritative
relationship state.

## Stack

- Bun for installs, scripts, runtime, tests, and SQLite
- TanStack Start + React 19 for the full-stack web application
- Nitro's Bun preset for the production server bundle
- Kysely with `kysely-bun-worker` for SQLite
- alpha `@atproto` packages and vendored alpha Spaces Lexicons

There is no Next.js dependency or application layer.

The alpha Node OAuth stack currently imports an Undici 8 agent that Bun cannot
initialize. The checked-in Bun package patch removes that unused Node 26 import,
and a small preload selects its supported Undici 7 path. This is isolated in
`patches/` and `scripts/bun-atproto-compat.ts` so it can be removed when the
alpha packages ship native Bun detection.

## Run it

Requirements: Bun 1.2.15 or newer and an account on a Spaces-compatible PDS.

```sh
bun install
bun run dev
```

Open <http://127.0.0.1:3000>. The development configuration uses the public
alpha network and identifies the managing app as
`did:web:secretsky.at#secretsky`. A remote PDS sends access checks to
<https://secretsky.at>, so full mutual-follow testing requires that domain to
route to the instance running the managing-app callback.

For protocol development against a local multi-PDS network:

```sh
bun run dev:local
```

`env/local.env` expects the AT Protocol development services on ports 2581 and
2582. It publishes the custom Lexicons at startup using the local introspection
service.

## Commands

```sh
bun run dev          # web server + Space sync service
bun run dev:local    # same, configured for a local multi-PDS network
bun run check        # ESLint, TypeScript, and Bun tests
bun run build        # generate the alpha client and make the Bun server bundle
bun run migrate      # create or update the SQLite schema
bun run start        # run the production web and sync processes
```

The custom Lexicons are under `lexicons/my` and use the `at.secretsky.*`
namespace. Generated protocol clients live under
`lib/lexicons` and are refreshed by `bun run codegen:lex`.

## Protocol identities

- The canonical SecretSky account is
  `did:plc:2abnn6euj4gjngt23bxz3tnk`.
- The `at.secretsky.*` namespace delegates Lexicon publication to
  `matt.evil.gay` (`did:plc:tas6hj2xjrqben5653v5kohk`).
- The managing-app callback service remains `did:web:secretsky.at#secretsky`.

These identities serve different protocol roles. See [DEPLOY.md](./DEPLOY.md)
for the exact DNS record and publication environment.

## Architecture

```text
Browser / TanStack Start routes
          │ OAuth, posts, follows, SSE
          ▼
SecretSky server ────────────────► SQLite
          │                         sessions and synchronized indexes
          │ authenticated managing-app callback
          ▼
Spaces-compatible PDS ◄───────── Space sync service
          │
          └── permissioned feed repos containing posts and interactions
              plus owner-only repos containing private follow records
```

The app checks reciprocal `at.secretsky.follow` records before it attempts feed
discovery or returns synchronized feed data. The PDS enforces the same result
through the managing-app access callback.

## Deployment

See [DEPLOY.md](./DEPLOY.md). Run a single app replica while using SQLite; the
web server and sync service share the same database and persistent volume.

The implementation began from the official Bulletin reference application,
then moved its Next.js and pnpm surface to TanStack Start and Bun. SecretSky
uses its own private follow records instead of Bluesky's public social graph.
