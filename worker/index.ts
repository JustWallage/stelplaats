import { Hono } from "hono";
import { meSchema } from "../shared/api";
import type { AppEnv } from "./env";
import { tasksRoutes } from "./routes/tasks";
import { testResetRoute } from "./routes/test-reset";
import { authMiddleware } from "./middleware/auth";

const app = new Hono<AppEnv>();

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

export default app;
export { WebsocketDO } from "./do/WebsocketDO";
