import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../index";

const testEnv = {
  ...env,
  ENVIRONMENT: "production",
  HASS_API_URL: "https://hass-api.justwallage.nl",
  HASS_TOKEN: "tok",
  HASS_ACCESS_CLIENT_ID: "cid",
  HASS_ACCESS_CLIENT_SECRET: "csec",
};

const authed: RequestInit = {
  method: "POST",
  headers: { "Cf-Access-Authenticated-User-Email": "just@wallage.nl" },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/hass/scripts/:id/run", () => {
  it("rejects an invalid script id without calling Home Assistant", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await app.request(
      "/api/hass/scripts/BAD-id/run",
      authed,
      testEnv,
    );

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("triggers the HASS script and returns ok", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("[]", { status: 200 }));

    const res = await app.request(
      "/api/hass/scripts/all_lights_off/run",
      authed,
      testEnv,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://hass-api.justwallage.nl/api/services/script/turn_on",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns 502 when Home Assistant fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 500 }),
    );

    const res = await app.request(
      "/api/hass/scripts/all_lights_off/run",
      authed,
      testEnv,
    );

    expect(res.status).toBe(502);
  });
});
