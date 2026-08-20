import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: process.env.SECRETSKY_HOST ?? "127.0.0.1",
    port: Number(process.env.SECRETSKY_PORT ?? 3000),
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart({ srcDirectory: "src" }),
    react(),
    nitro({ preset: "bun" }),
  ],
});
