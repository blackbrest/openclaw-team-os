import { defineConfig } from "vite";

import { DEFAULT_WEB_PORT } from "@openclaw-team-os/config";

export default defineConfig({
  base: "./",
  server: {
    host: "0.0.0.0",
    port: DEFAULT_WEB_PORT
  },
  preview: {
    host: "0.0.0.0",
    port: DEFAULT_WEB_PORT
  }
});
