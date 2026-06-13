import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { comments, tasks } from "../../db/schema";
import { commentCreateSchema } from "../../shared/api";
import type { AppEnv } from "../env";
import { broadcast } from "../lib/broadcast";
import { getDb, type Db } from "../lib/db";
import { toComment } from "../lib/serialize";

// Mounted at /api/tasks/:id/comments — the :id param is inherited from the
// parent route. A per-task comment thread; add + delete, no editing.
export const commentsRoutes = new Hono<AppEnv>();

async function taskExists(db: Db, id: number): Promise<boolean> {
  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return rows.length > 0;
}

commentsRoutes.get("/", async (c) => {
  const taskId = Number(c.req.param("id"));
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.taskId, taskId))
    .orderBy(asc(comments.id));
  return c.json({ comments: rows.map(toComment) });
});

commentsRoutes.post("/", async (c) => {
  const taskId = Number(c.req.param("id"));
  const db = getDb(c.env);
  if (!(await taskExists(db, taskId))) {
    return c.json({ error: "Task not found" }, 404);
  }
  let body: unknown;
  try {
    body = await c.req.raw.json();
  } catch {
    body = null;
  }
  const parsed = commentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const inserted = await db
    .insert(comments)
    .values({
      taskId,
      author: c.get("userEmail"),
      body: parsed.data.body,
      createdAt: new Date(),
    })
    .returning();
  const row = inserted[0];
  if (row === undefined) {
    return c.json({ error: "Insert failed" }, 500);
  }
  const payload = toComment(row);
  await broadcast(c.env, { type: "comment_created", payload });
  return c.json(payload, 201);
});

commentsRoutes.delete("/:cid", async (c) => {
  const taskId = Number(c.req.param("id"));
  const cid = Number(c.req.param("cid"));
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.id, cid))
    .limit(1);
  const row = rows[0] ?? null;
  if (row?.taskId !== taskId) {
    return c.json({ error: "Comment not found" }, 404);
  }
  await db.delete(comments).where(eq(comments.id, cid));
  await broadcast(c.env, {
    type: "comment_deleted",
    payload: { id: cid, taskId },
  });
  return c.json({ ok: true });
});
