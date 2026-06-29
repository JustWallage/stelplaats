import { Hono } from "hono";
import {
  pushConfigSchema,
  pushSubscriptionInputSchema,
  pushUnsubscribeSchema,
} from "../../shared/api";
import type { AppEnv } from "../env";
import { getDb } from "../lib/db";
import { getPushSender, sendTestPush } from "../lib/push";
import {
  deletePushSubscription,
  savePushSubscription,
} from "../lib/push-subscriptions";

export const pushRoutes = new Hono<AppEnv>();

async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// The VAPID public key the browser needs to subscribe; null when push is not
// configured server-side, so the UI can show it as unavailable.
pushRoutes.get("/", (c) => {
  const key = c.env.VAPID_PUBLIC_KEY;
  return c.json(
    pushConfigSchema.parse({
      vapidPublicKey: key === undefined || key === "" ? null : key,
    }),
  );
});

// Register (or refresh) this device's subscription for the signed-in user.
pushRoutes.post("/subscribe", async (c) => {
  const parsed = pushSubscriptionInputSchema.safeParse(
    await parseJsonBody(c.req.raw),
  );
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  await savePushSubscription(getDb(c.env), c.get("userEmail"), parsed.data);
  return c.json({ ok: true });
});

// Drop a subscription (the user disabled notifications on this device).
pushRoutes.post("/unsubscribe", async (c) => {
  const parsed = pushUnsubscribeSchema.safeParse(
    await parseJsonBody(c.req.raw),
  );
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  await deletePushSubscription(getDb(c.env), parsed.data.endpoint);
  return c.json({ ok: true });
});

// Send a test notification to the requester's own devices.
pushRoutes.post("/test", async (c) => {
  const db = getDb(c.env);
  const sender = await getPushSender(c.env);
  const count = await sendTestPush(
    db,
    sender,
    c.get("userEmail"),
    c.env.APP_URL,
  );
  if (count === 0) {
    return c.json({ error: "No subscriptions on any device" }, 409);
  }
  return c.json({ ok: true });
});
