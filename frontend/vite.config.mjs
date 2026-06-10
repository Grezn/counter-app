import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const backend = "http://127.0.0.1:3000";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [vue()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": backend,
      "/whoami": backend,
      "/ready": backend,
      "/health": backend,
      "/app.js": backend,
      "/handover-summary.js": backend,
      "/favicon.svg": backend,
    },
  },
});
