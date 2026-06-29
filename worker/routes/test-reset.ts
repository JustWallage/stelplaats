import { Hono } from "hono";
import { comments, completions, tasks, telegram } from "../../db/schema";
import type { AppEnv } from "../env";
import { getDb } from "../lib/db";

// Wipes all data so each E2E test starts clean. Only reachable in e2e/local —
// the composition root (worker/index.ts) 404s /api/test/* everywhere else.
export const testResetRoute = new Hono<AppEnv>();

testResetRoute.post("/", async (c) => {
  const db = getDb(c.env);
  await db.delete(comments);
  await db.delete(completions);
  await db.delete(tasks);
  await db.delete(telegram);
  return c.json({ ok: true });
});
