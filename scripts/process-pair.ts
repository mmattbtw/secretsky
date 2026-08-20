import { spawn } from "node:child_process";

export async function runProcessPair(webCommand: string[]) {
  const children = [
    spawn(
      "bun",
      ["--preload", "./scripts/bun-atproto-compat.ts", "scripts/sync.ts"],
      { stdio: "inherit", env: process.env },
    ),
    spawn(webCommand[0], webCommand.slice(1), {
      stdio: "inherit",
      env: process.env,
    }),
  ];
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    for (const child of children) child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const code = await new Promise<number>((resolve) => {
    for (const child of children) {
      child.once("exit", (exitCode) => resolve(exitCode ?? 1));
    }
  });
  stop();
  process.exitCode = code;
}
