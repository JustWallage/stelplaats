import { desc, eq, isNull, inArray, max } from "drizzle-orm";
import { Hono, type Context } from "hono";
import type { ZodType } from "zod";
import {
  completions,
  tasks,
  type CompletionRow,
  type TaskRow,
} from "../../db/schema";
import {
  completeTaskSchema,
  taskCreateSchema,
  taskPatchSchema,
} from "../../shared/api";
import type { AppEnv } from "../env";
import { broadcast } from "../lib/broadcast";
import { getDb, type Db } from "../lib/db";
import { toCompletion, toTaskWithStatus } from "../lib/serialize";

export const tasksRoutes = new Hono<AppEnv>();

async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function findTask(db: Db, id: number): Promise<TaskRow | null> {
  const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return rows[0] ?? null;
}

async function findLastCompletion(
  db: Db,
  taskId: number,
): Promise<CompletionRow | null> {
  const rows = await db
    .select()
    .from(completions)
    .where(eq(completions.taskId, taskId))
    .orderBy(desc(completions.id))
    .limit(1);
  return rows[0] ?? null;
}

tasksRoutes.get("/", async (c) => {
  const db = getDb(c.env);
  const activeTasks = await db
    .select()
    .from(tasks)
    .where(isNull(tasks.archivedAt));
  const latestIds = db
    .select({ id: max(completions.id) })
    .from(completions)
    .groupBy(completions.taskId);
  const latestCompletions = await db
    .select()
    .from(completions)
    .where(inArray(completions.id, latestIds));
  const latestByTask = new Map(
    latestCompletions.map((row) => [row.taskId, row]),
  );
  const now = new Date();
  return c.json({
    tasks: activeTasks.map((task) =>
      toTaskWithStatus(task, latestByTask.get(task.id) ?? null, now),
    ),
  });
});

tasksRoutes.post("/", async (c) => {
  const parsed = taskCreateSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const db = getDb(c.env);
  const inserted = await db
    .insert(tasks)
    .values({ ...parsed.data, createdAt: new Date() })
    .returning();
  const task = inserted[0];
  if (task === undefined) {
    return c.json({ error: "Insert failed" }, 500);
  }
  const payload = toTaskWithStatus(task, null, new Date());
  await broadcast(c.env, { type: "task_created", payload });
  return c.json(payload, 201);
});

// Shared prologue for body-carrying routes on /:id — parses the body against
// the given schema and loads the addressed task.
async function parseBodyForTask<T>(
  c: Context<AppEnv>,
  schema: ZodType<T>,
): Promise<{ data: T; db: Db; task: TaskRow } | { error: Response }> {
  const parsed = schema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) {
    return { error: c.json({ error: "Invalid request body" }, 400) };
  }
  const db = getDb(c.env);
  const task = await findTask(db, Number(c.req.param("id")));
  if (task === null) {
    return { error: c.json({ error: "Task not found" }, 404) };
  }
  return { data: parsed.data, db, task };
}

tasksRoutes.patch("/:id", async (c) => {
  const result = await parseBodyForTask(c, taskPatchSchema);
  if ("error" in result) {
    return result.error;
  }
  const { data, db, task } = result;
  const id = task.id;
  const { archived, title, location, intervalDays } = data;
  const updates: Partial<typeof tasks.$inferInsert> = {};
  if (title !== undefined) {
    updates.title = title;
  }
  if (location !== undefined) {
    updates.location = location;
  }
  if (intervalDays !== undefined) {
    updates.intervalDays = intervalDays;
  }
  if (archived !== undefined) {
    updates.archivedAt = archived ? new Date() : null;
  }
  if (Object.keys(updates).length > 0) {
    await db.update(tasks).set(updates).where(eq(tasks.id, id));
  }
  const updated = await findTask(db, id);
  if (updated === null) {
    return c.json({ error: "Task not found" }, 404);
  }
  const payload = toTaskWithStatus(
    updated,
    await findLastCompletion(db, id),
    new Date(),
  );
  await broadcast(c.env, { type: "task_updated", payload });
  return c.json(payload);
});

tasksRoutes.post("/:id/complete", async (c) => {
  const result = await parseBodyForTask(c, completeTaskSchema);
  if ("error" in result) {
    return result.error;
  }
  const { data, db, task: existing } = result;
  const inserted = await db
    .insert(completions)
    .values({
      taskId: existing.id,
      doneBy: c.get("userEmail"),
      doneAt: new Date(),
      note: data.note,
    })
    .returning();
  const completion = inserted[0];
  if (completion === undefined) {
    return c.json({ error: "Insert failed" }, 500);
  }
  const payload = toTaskWithStatus(existing, completion, new Date());
  await broadcast(c.env, {
    type: "task_completed",
    payload: { task: payload, completion: toCompletion(completion) },
  });
  return c.json(payload);
});

tasksRoutes.get("/:id/completions", async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb(c.env);
  const existing = await findTask(db, id);
  if (existing === null) {
    return c.json({ error: "Task not found" }, 404);
  }
  const rows = await db
    .select()
    .from(completions)
    .where(eq(completions.taskId, id))
    .orderBy(desc(completions.id));
  return c.json({ completions: rows.map(toCompletion) });
});
