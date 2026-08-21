# secretsky

[secretsky](https://secretsky.at) is a private microblog built on the AT Protocol
[Spaces alpha](https://atproto.com/blog/atproto-spaces-alpha).

You can follow another account privately. When they follow you back, you become
mutuals and can see each other's posts, replies, and emoji reactions. Follow
records and feed data live in permissioned Spaces on each user's PDS.

> Spaces is alpha software and may change without notice. It provides access
> control, not end-to-end encryption. Do not use secretsky for sensitive data.

## Stack

- Bun
- TypeScript
- TanStack Start and React
- SQLite with Kysely
- Alpha `@atproto` packages
- Custom `at.secretsky.*` Lexicons

## Run locally

You need Bun 1.2.15 or newer and an account on a Spaces-compatible PDS.

```sh
bun install
bun run dev
```

Open <http://127.0.0.1:3000>.

To run against a local AT Protocol development network instead:

```sh
bun run dev:local
```

The local configuration expects development PDS instances on ports 2581 and
2582.

## Commands

```sh
bun run dev          # start the app and Space sync service
bun run dev:local    # start against the local AT Protocol network
bun run check        # run lint, type checks, and tests
bun run build        # generate protocol code and build the app
bun run migrate      # update the SQLite schema
bun run start        # start the production server
```

## Protocol

The custom Lexicons are in [`lexicons/my`](./lexicons/my). They define private
follows, posts, replies, reactions, and moderation records under the
`at.secretsky.*` namespace.

- Canonical secretsky account: `did:plc:2abnn6euj4gjngt23bxz3tnk`
- Lexicon publisher: `matt.evil.gay` (`did:plc:tas6hj2xjrqben5653v5kohk`)
- Managing app: `did:web:secretsky.at#secretsky`

SQLite is only a local index. The records stored in AT Protocol Spaces are the
source of truth.

See [`DEPLOY.md`](./DEPLOY.md) for deployment and DNS setup.

## Credits

secretsky started from Bluesky's
[`bluesky-social/bulletin`](https://github.com/bluesky-social/bulletin) example
application. Bulletin provided the original reference implementation for
building an application with AT Protocol Spaces.
