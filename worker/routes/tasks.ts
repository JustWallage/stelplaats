import { desc, eq } from "drizzle-orm";
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
  completionPatchSchema,
  taskCreateSchema,
  taskPatchSchema,
} from "../../shared/api";
import type { AppEnv } from "../env";
import { broadcast } from "../lib/broadcast";
import { getDb, type Db } from "../lib/db";
import { toCompletion, toTaskWithStatus } from "../lib/serialize";
import { loadTasksWithLastCompletion } from "../lib/tasks-query";

export const tasksRoutes = new Hono<AppEnv>();

async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// A one-off target date is a calendar day; anchor it at noon UTC so it round
// trips back to the same YYYY-MM-DD regardless of timezone.
const toDueDate = (date: string | null): Date | null =>
  date === null ? null : new Date(`${date}T12:00:00Z`);

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
  const archived = c.req.query("archived") === "true";
  const rows = await loadTasksWithLastCompletion(db, archived);
  const now = new Date();
  return c.json({
    tasks: rows.map(({ task, lastCompletion }) =>
      toTaskWithStatus(task, lastCompletion, now),
    ),
  });
});

tasksRoutes.post("/", async (c) => {
  const parsed = taskCreateSchema.safeParse(await parseJsonBody(c.req.raw));
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const db = getDb(c.env);
  const data = parsed.data;
  const inserted = await db
    .insert(tasks)
    .values({
      title: data.title,
      kind: data.kind,
      type: data.type,
      location: data.location ?? "",
      description: data.description,
      intervalDays: data.type === "scheduled" ? data.intervalDays : null,
      dueDate: data.type === "one_off" ? toDueDate(data.dueDate) : null,
      createdAt: new Date(),
    })
    .returning();
  const task = inserted[0];
  if (task === undefined) {
    return c.json({ error: "Insert failed" }, 500);
  }
  const lastDoneAt = data.type === "one_off" ? null : data.lastDoneAt;
  let seed: CompletionRow | null = null;
  if (lastDoneAt !== null) {
    const seedRows = await db
      .insert(completions)
      .values({
        taskId: task.id,
        doneBy: c.get("userEmail"),
        doneAt: new Date(lastDoneAt),
        note: null,
      })
      .returning();
    seed = seedRows[0] ?? null;
  }
  const payload = toTaskWithStatus(task, seed, new Date());
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
  const updates: Partial<typeof tasks.$inferInsert> = {};
  if ("archived" in data) {
    updates.archivedAt = data.archived ? new Date() : null;
  } else {
    // A content edit sets every type-dependent column explicitly, clearing the
    // ones the (possibly changed) type no longer uses.
    updates.title = data.title;
    updates.location = data.location ?? "";
    updates.description = data.description;
    updates.type = data.type;
    updates.intervalDays = data.type === "scheduled" ? data.intervalDays : null;
    updates.dueDate = data.type === "one_off" ? toDueDate(data.dueDate) : null;
  }
  await db.update(tasks).set(updates).where(eq(tasks.id, id));
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
      doneBy: data.doneBy ?? c.get("userEmail"),
      doneAt: data.doneAt === undefined ? new Date() : new Date(data.doneAt),
      note: data.note,
    })
    .returning();
  const completion = inserted[0];
  if (completion === undefined) {
    return c.json({ error: "Insert failed" }, 500);
  }
  const now = new Date();
  let task = existing;
  if (existing.type === "one_off") {
    await db
      .update(tasks)
      .set({ archivedAt: now })
      .where(eq(tasks.id, existing.id));
    task = { ...existing, archivedAt: now };
  }
  const payload = toTaskWithStatus(task, completion, now);
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

// Recompute the task payload from its current latest completion and broadcast
// task_updated — shared by the completion edit/delete routes, which both shift
// due state.
async function respondWithUpdatedTask(
  c: Context<AppEnv>,
  db: Db,
  task: TaskRow,
): Promise<Response> {
  const payload = toTaskWithStatus(
    task,
    await findLastCompletion(db, task.id),
    new Date(),
  );
  await broadcast(c.env, { type: "task_updated", payload });
  return c.json(payload);
}

async function loadCompletionForTask(
  db: Db,
  taskId: number,
  completionId: number,
): Promise<CompletionRow | null> {
  const rows = await db
    .select()
    .from(completions)
    .where(eq(completions.id, completionId))
    .limit(1);
  const row = rows[0] ?? null;
  return row !== null && row.taskId === taskId ? row : null;
}

tasksRoutes.patch("/:id/completions/:cid", async (c) => {
  const result = await parseBodyForTask(c, completionPatchSchema);
  if ("error" in result) {
    return result.error;
  }
  const { data, db, task } = result;
  const cid = Number(c.req.param("cid"));
  const completion = await loadCompletionForTask(db, task.id, cid);
  if (completion === null) {
    return c.json({ error: "Completion not found" }, 404);
  }
  const updates: Partial<typeof completions.$inferInsert> = {};
  if (data.doneBy !== undefined) {
    updates.doneBy = data.doneBy;
  }
  if (data.doneAt !== undefined) {
    updates.doneAt = new Date(data.doneAt);
  }
  if (data.note !== undefined) {
    updates.note = data.note;
  }
  if (Object.keys(updates).length > 0) {
    await db.update(completions).set(updates).where(eq(completions.id, cid));
  }
  return respondWithUpdatedTask(c, db, task);
});

tasksRoutes.delete("/:id/completions/:cid", async (c) => {
  const db = getDb(c.env);
  const task = await findTask(db, Number(c.req.param("id")));
  if (task === null) {
    return c.json({ error: "Task not found" }, 404);
  }
  const cid = Number(c.req.param("cid"));
  const completion = await loadCompletionForTask(db, task.id, cid);
  if (completion === null) {
    return c.json({ error: "Completion not found" }, 404);
  }
  await db.delete(completions).where(eq(completions.id, cid));
  return respondWithUpdatedTask(c, db, task);
});
