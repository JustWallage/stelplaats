import type { CommentRow, CompletionRow, TaskRow } from "../../db/schema";
import {
  commentSchema,
  completionSchema,
  taskWithStatusSchema,
  type Comment,
  type Completion,
  type TaskWithStatus,
} from "../../shared/api";
import { computeDueState } from "../../shared/due";

// Responses are zod-parsed so a drifting DB row can never silently produce an
// out-of-contract payload. `location` is NOT NULL in the DB (an empty string is
// the "no location" sentinel) but nullable in the contract — convert here.

export function toCompletion(row: CompletionRow): Completion {
  return completionSchema.parse({
    id: row.id,
    taskId: row.taskId,
    doneBy: row.doneBy,
    doneAt: row.doneAt.toISOString(),
    note: row.note,
  });
}

export function toComment(row: CommentRow): Comment {
  return commentSchema.parse({
    id: row.id,
    taskId: row.taskId,
    author: row.author,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
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
    location: task.location === "" ? null : task.location,
    description: task.description,
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
