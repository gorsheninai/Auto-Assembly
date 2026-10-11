import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "@aa/schema": resolve("packages/schema/src/index.ts"), "@aa/core": resolve("packages/core/src/index.ts"), "@aa/adapters": resolve("packages/adapters/src/index.ts") } },
  test: { include: ["packages/**/*.test.ts", "apps/**/*.test.ts"] },
});
