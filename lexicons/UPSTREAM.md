# Vendored AT Protocol Lexicons

The `upstream/app/bsky` and `upstream/com/atproto` schemas are the subset used
by SecretSky's generated client. The Spaces schemas (`com.atproto.space`,
`managedspace`, `memberspace`, and `personalspace`) are copied from
`bluesky-social/atproto` commit
`d4def6e9f521896ed8222f576d54923d00b5fbeb`, included in
`0.0.0-spaces-alpha-20261112204144`. The remaining schemas are from commit
`2f77206ff8010710db5733c454abff9eb5ebb96b`.

The schemas in `at/` are owned by SecretSky and use the `at.secretsky.*`
namespace controlled through `secretsky.at`.
