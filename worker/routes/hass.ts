import { Hono } from "hono";
import { okSchema } from "../../shared/api";

// HASS_API_URL is a var, but the three credentials are secrets — which are not
// present in `.dev.vars` on CI, so the generated `Env` omits them there.
// Declare the bindings this route needs explicitly (mirrors middleware/auth.ts)
// rather than relying on `Env`.
interface HassBindings {
  HASS_API_URL: string;
  HASS_TOKEN: string;
  HASS_ACCESS_CLIENT_ID: string;
  HASS_ACCESS_CLIENT_SECRET: string;
}

export const hassRoutes = new Hono<{ Bindings: HassBindings }>();

// Run a Home Assistant script by object id ("all_lights_off" -> script.all_lights_off).
// The Worker calls HASS server-side via the Access-protected hass-api hostname,
// authenticating with the Access service token + the HASS long-lived token (both
// Worker secrets). The browser never holds HASS credentials.
hassRoutes.post("/scripts/:id/run", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-z0-9_]+$/.test(id)) {
    return c.json({ error: "Invalid script id" }, 400);
  }

  const res = await fetch(`${c.env.HASS_API_URL}/api/services/script/turn_on`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.HASS_TOKEN}`,
      "CF-Access-Client-Id": c.env.HASS_ACCESS_CLIENT_ID,
      "CF-Access-Client-Secret": c.env.HASS_ACCESS_CLIENT_SECRET,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ entity_id: `script.${id}` }),
  });

  if (!res.ok) {
    return c.json({ error: "Home Assistant request failed" }, 502);
  }
  return c.json(okSchema.parse({ ok: true }));
});
