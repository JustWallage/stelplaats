import type { CompletionRow, TaskRow } from "../../db/schema";
import {
  completionSchema,
  taskWithStatusSchema,
  type Completion,
  type TaskWithStatus,
} from "../../shared/api";
import { computeDueState } from "../../shared/due";

// Responses are zod-parsed so a drifting DB row can never silently produce an
// out-of-contract payload.

export function toCompletion(row: CompletionRow): Completion {
  return completionSchema.parse({
    id: row.id,
    taskId: row.taskId,
    doneBy: row.doneBy,
    doneAt: row.doneAt.toISOString(),
    note: row.note,
  });
}

export function toTaskWithStatus(
  task: TaskRow,
  lastCompletion: CompletionRow | null,
  now: Date,
): TaskWithStatus {
  return taskWithStatusSchema.parse({
    id: task.id,
    title: task.title,
    kind: task.kind,
    location: task.location,
    intervalDays: task.intervalDays,
    createdAt: task.createdAt.toISOString(),
    archived: task.archivedAt !== null,
    due: computeDueState(
      task.intervalDays,
      lastCompletion?.doneAt ?? null,
      now,
    ),
    lastCompletion:
      lastCompletion === null ? null : toCompletion(lastCompletion),
  });
}
