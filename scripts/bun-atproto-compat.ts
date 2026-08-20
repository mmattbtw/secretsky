// @atproto-labs/fetch-node detects the Undici version bundled by Node and
// imports agents for Node 22, 24, and 26. Bun reports Node 24 compatibility but
// does not expose process.versions.undici. Pinning the detector to the
// compatible Undici 7 agent keeps the alpha OAuth package on its supported
// Node-24 code path when the application runs under Bun.
process.versions.undici ??= "7.16.0";
