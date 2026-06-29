import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "./index";

// Pins the composition-order guarantee: /api/ws must stay exempt from auth
// (it is registered before the auth middleware), everything else under /api
// must require identity.
describe("app composition", () => {
  it("exempts /api/ws from auth: unauthenticated request reaches the route", async () => {
    const res = await app.request(
      "/api/ws",
      {},
      { ...env, ENVIRONMENT: "production" },
    );
    expect(res.status).toBe(426);
  });

  it("requires auth for every other /api route", async () => {
    const res = await app.request(
      "/api/health",
      {},
      { ...env, ENVIRONMENT: "production" },
    );
    expect(res.status).toBe(401);
  });

  it("hides /api/test/reset in production even for authenticated users", async () => {
    const res = await app.request(
      "/api/test/reset",
      {
        method: "POST",
        headers: { "Cf-Access-Authenticated-User-Email": "just@wallage.nl" },
      },
      { ...env, ENVIRONMENT: "production" },
    );
    expect(res.status).toBe(404);
  });

  it("hides /api/test/reset for unknown environments (fail closed)", async () => {
    const res = await app.request(
      "/api/test/reset",
      {
        method: "POST",
        headers: { "Cf-Access-Authenticated-User-Email": "just@wallage.nl" },
      },
      { ...env, ENVIRONMENT: "weird" },
    );
    expect(res.status).toBe(404);
  });

  it("serves /api/test/reset in local mode", async () => {
    const res = await app.request(
      "/api/test/reset",
      { method: "POST" },
      { ...env, ENVIRONMENT: "local" },
    );
    expect(res.status).toBe(200);
  });

  it("serves /api/health with identity in local mode", async () => {
    const res = await app.request(
      "/api/health",
      {},
      { ...env, ENVIRONMENT: "local" },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, email: "just@wallage.nl" });
  });
});
