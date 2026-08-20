import { runProcessPair } from "./process-pair";

await runProcessPair([
  "bun",
  "--preload",
  "./scripts/bun-atproto-compat.ts",
  ".output/server/index.mjs",
]);
