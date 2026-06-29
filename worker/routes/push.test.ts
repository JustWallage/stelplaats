import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { pushSubscriptions } from "../../db/schema";
import { pushConfigSchema } from "../../shared/api";
import { app } from "../index";
import { getDb } from "../lib/db";

const TOKEN = "unit-test-token";
const e2eEnv = { ...env, ENVIRONMENT: "e2e" };

const auth = (email: string) => ({
  "X-Test-User-Email": email,
  "X-Test-Auth": TOKEN,
  "Content-Type": "application/json",
});

const subscription = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "BPp256dhKeyValue", auth: "authSecretValue" },
});

async function post(path: string, email: string, body: unknown) {
  return app.request(
    path,
    { method: "POST", headers: auth(email), body: JSON.stringify(body) },
    e2eEnv,
  );
}

beforeEach(async () => {
  await getDb(env).delete(pushSubscriptions);
});

describe("GET /api/push", () => {
  it("reports the configured VAPID public key", async () => {
    const res = await app.request(
      "/api/push",
      { headers: auth("just@wallage.nl") },
      e2eEnv,
    );
    expect(res.status).toBe(200);
    const config = pushConfigSchema.parse(await res.json());
    expect(config.vapidPublicKey).not.toBeNull();
  });
});

describe("subscribe / unsubscribe", () => {
  it("stores a subscription and upserts on the same endpoint", async () => {
    const db = getDb(env);
    expect(
      (
        await post(
          "/api/push/subscribe",
          "just@wallage.nl",
          subscription("https://push/a"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await post(
          "/api/push/subscribe",
          "just@wallage.nl",
          subscription("https://push/a"),
        )
      ).status,
    ).toBe(200);

    const rows = await db.select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userEmail).toBe("just@wallage.nl");
  });

  it("rejects an invalid subscription body", async () => {
    const res = await post("/api/push/subscribe", "just@wallage.nl", {
      endpoint: "not-a-url",
    });
    expect(res.status).toBe(400);
  });

  it("removes a subscription on unsubscribe", async () => {
    await post(
      "/api/push/subscribe",
      "just@wallage.nl",
      subscription("https://push/b"),
    );
    const res = await post("/api/push/unsubscribe", "just@wallage.nl", {
      endpoint: "https://push/b",
    });
    expect(res.status).toBe(200);
    expect(await getDb(env).select().from(pushSubscriptions)).toEqual([]);
  });
});

describe("POST /api/push/test", () => {
  it("409s when the user has no subscriptions", async () => {
    const res = await post("/api/push/test", "just@wallage.nl", {});
    expect(res.status).toBe(409);
  });

  it("succeeds (no-op fake sender) when a subscription exists", async () => {
    await post(
      "/api/push/subscribe",
      "just@wallage.nl",
      subscription("https://push/c"),
    );
    const res = await post("/api/push/test", "just@wallage.nl", {});
    expect(res.status).toBe(200);
  });
});
