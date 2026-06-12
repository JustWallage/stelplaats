import { Hono } from "hono";
import { completions, tasks } from "../../db/schema";
import type { AppEnv } from "../env";
import { getDb } from "../lib/db";

// Wipes all data so each E2E test starts clean. Only reachable in e2e/local —
// the composition root (worker/index.ts) 404s /api/test/* everywhere else.
export const testResetRoute = new Hono<AppEnv>();

testResetRoute.post("/", async (c) => {
  const db = getDb(c.env);
  await db.delete(completions);
  await db.delete(tasks);
  return c.json({ ok: true });
});
