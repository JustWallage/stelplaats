import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // Test-only secrets; auth tests override ENVIRONMENT per request via
        // explicit app instances.
        bindings: {
          TEST_AUTH_TOKEN: "unit-test-token",
          DEV_USER_EMAIL: "just@wallage.nl",
        },
      },
    }),
  ],
  test: {
    name: "worker",
    include: ["worker/**/*.test.ts"],
  },
});
