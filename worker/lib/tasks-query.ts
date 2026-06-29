import { inArray, isNotNull, isNull, max } from "drizzle-orm";
import {
  completions,
  tasks,
  type CompletionRow,
  type TaskRow,
} from "../../db/schema";
import type { TaskWithStatus } from "../../shared/api";
import type { Db } from "./db";
import { toTaskWithStatus } from "./serialize";

export interface TaskWithLastCompletion {
  task: TaskRow;
  lastCompletion: CompletionRow | null;
}

// Loads tasks (active or archived) each paired with its latest completion, in a
// single grouped query rather than one lookup per task. Shared by the task list
// route and the daily reminder so due-state is computed from the same inputs.
export async function loadTasksWithLastCompletion(
  db: Db,
  archived: boolean,
): Promise<TaskWithLastCompletion[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(archived ? isNotNull(tasks.archivedAt) : isNull(tasks.archivedAt));
  const latestIds = db
    .select({ id: max(completions.id) })
    .from(completions)
    .groupBy(completions.taskId);
  const latest = await db
    .select()
    .from(completions)
    .where(inArray(completions.id, latestIds));
  const byTask = new Map(latest.map((row) => [row.taskId, row]));
  return rows.map((task) => ({
    task,
    lastCompletion: byTask.get(task.id) ?? null,
  }));
}

// Active tasks whose countdown reaches zero on `now`'s calendar day: due state
// is "due" AND has a concrete date (so adhoc tasks and undated to-dos, which
// have no countdown, are excluded). Overdue tasks already fired on their own
// due day, so they are not re-notified.
export async function loadTasksDueToday(
  db: Db,
  now: Date,
): Promise<TaskWithStatus[]> {
  const active = await loadTasksWithLastCompletion(db, false);
  return active
    .map(({ task, lastCompletion }) =>
      toTaskWithStatus(task, lastCompletion, now),
    )
    .filter((task) => task.due.status === "due" && task.due.dueAt !== null);
}
