import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // The companion is a separate package but its parsing tests run here, so
    // one `npm test` covers the whole repo.
    exclude: ["**/node_modules/**", ".next/**"],
  },
});
