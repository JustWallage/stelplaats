import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations("db/migrations");
      return {
        main: "./worker/index.ts",
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            // Test-only values; auth tests override ENVIRONMENT per request.
            TEST_AUTH_TOKEN: "unit-test-token",
            TELEGRAM_WEBHOOK_SECRET: "unit-webhook-secret",
            DEV_USER_EMAIL: "just@wallage.nl",
            // A public key only — no VAPID_PRIVATE_KEY, so the push sender is the
            // no-op fake and GET /api/push reports push as available.
            VAPID_PUBLIC_KEY:
              "BKBj_WgNVQrSXMD-BWTyEAkVRIE3NKkJip5879ti4abr8ebaPcxK6yzPycsKRThiG7zcJ4FnPFWEP2JqiLLD6Cw",
            // Applied to the fresh per-file D1 by worker/test-setup.ts.
            TEST_MIGRATIONS: migrations,
          },
        },
      };
    }),
  ],
  test: {
    name: "worker",
    include: ["worker/**/*.test.ts"],
    setupFiles: ["./worker/test-setup.ts"],
  },
});
