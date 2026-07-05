import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    server: {
      deps: {
        // @caistech/property-services-sdk ships ESM with extensionless relative
        // imports (export … from './client'). Bundlers (Next/tsc) resolve that,
        // but Vitest's Node-ESM loader can't — inline it so Vite transforms it.
        inline: [/@caistech\/property-services-sdk/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
