import { Hono } from "hono";
import type { AppEnv } from "./env";
import { tasksRoutes } from "./routes/tasks";
import { authMiddleware } from "./middleware/auth";

const app = new Hono<AppEnv>();

// /api/ws is registered BEFORE the auth middleware on purpose: browsers cannot
// set custom headers on WebSocket upgrades, so the socket is exempt from
// app-level auth. In production, Cloudflare Access still gates it at the edge.
// Hono runs matched handlers in registration order, so this route never passes
// through authMiddleware. Do not move it below the `app.use` line.
app.get("/api/ws", (c) => c.json({ error: "Expected WebSocket upgrade" }, 426));

app.use("/api/*", authMiddleware);

app.get("/api/health", (c) => c.json({ ok: true, email: c.get("userEmail") }));
app.get("/api/me", (c) => c.json({ email: c.get("userEmail") }));
app.route("/api/tasks", tasksRoutes);

export default app;
export { WebsocketDO } from "./do/WebsocketDO";
