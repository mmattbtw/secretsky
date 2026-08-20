import { runProcessPair } from "./process-pair";

await runProcessPair([
  "bun",
  "--preload",
  "./scripts/bun-atproto-compat.ts",
  "./node_modules/vite/bin/vite.js",
  "dev",
]);
