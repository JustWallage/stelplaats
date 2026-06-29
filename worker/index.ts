import { Hono } from "hono";
import { meSchema } from "../shared/api";
import type { AppEnv } from "./env";
import { runDueTaskReminders } from "./lib/scheduled";
import { commentsRoutes } from "./routes/comments";
import { hassRoutes } from "./routes/hass";
import { pushRoutes } from "./routes/push";
import { tasksRoutes } from "./routes/tasks";
import { telegramRoutes } from "./routes/telegram";
import { telegramWebhookRoutes } from "./routes/telegram-webhook";
import { testResetRoute } from "./routes/test-reset";
import { authMiddleware } from "./middleware/auth";

export const app = new Hono<AppEnv>();

// /api/ws is registered BEFORE the auth middleware on purpose: browsers cannot
// set custom headers on WebSocket upgrades, so the socket is exempt from
// app-level auth. In production, Cloudflare Access still gates it at the edge.
// Hono runs matched handlers in registration order, so this route never passes
// through authMiddleware. Do not move it below the `app.use` line.
app.get("/api/ws", (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ error: "Expected WebSocket upgrade" }, 426);
  }
  const stub = c.env.WEBSOCKET_DO.get(c.env.WEBSOCKET_DO.idFromName("global"));
  return stub.fetch(c.req.raw);
});

app.use("/api/*", authMiddleware);

app.get("/api/health", (c) => c.json({ ok: true, email: c.get("userEmail") }));
app.get("/api/me", (c) =>
  c.json(meSchema.parse({ email: c.get("userEmail") })),
);
app.route("/api/tasks", tasksRoutes);
app.route("/api/tasks/:id/comments", commentsRoutes);
app.route("/api/hass", hassRoutes);
app.route("/api/telegram", telegramRoutes);
app.route("/api/push", pushRoutes);

// The Telegram webhook cannot present a Cloudflare Access identity, so it sits
// OUTSIDE /api (no auth middleware) and is guarded by its own secret-token check
// (see the route). In production a Terraform Access "bypass" policy exposes
// /telegram/webhook publicly; everything else stays behind Access.
app.route("/telegram", telegramWebhookRoutes);

// Test-only surface. Fail closed: anything that is not exactly e2e/local —
// including unknown ENVIRONMENT values — gets a 404, as if the route does not
// exist. Auth still applies (the middleware above runs first).
app.use("/api/test/*", async (c, next) => {
  if (c.env.ENVIRONMENT !== "e2e" && c.env.ENVIRONMENT !== "local") {
    return c.json({ error: "Not found" }, 404);
  }
  return next();
});
app.route("/api/test/reset", testResetRoute);

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  // One daily cron (05:00 + 06:00 UTC); runDueTaskReminders acts only on the
  // tick that is 07:00 in Amsterdam, then pushes the due-today reminder.
  scheduled: (controller, env, ctx) => {
    ctx.waitUntil(runDueTaskReminders(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
export { WebsocketDO } from "./do/WebsocketDO";
