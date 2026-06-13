import { z } from "zod";
import { userEmailSchema } from "./users";

// ---- Task domain ----

const taskKindSchema = z.enum(["cleaning", "plants", "house"]);
export type TaskKind = z.infer<typeof taskKindSchema>;

const dueStatusSchema = z.enum(["adhoc", "ok", "due", "overdue"]);
export type DueStatus = z.infer<typeof dueStatusSchema>;

const dueStateSchema = z.object({
  status: dueStatusSchema,
  /** ISO date (YYYY-MM-DD, UTC) the task is/was next due; null for ad-hoc tasks. */
  dueAt: z.iso.date().nullable(),
});
export type DueState = z.infer<typeof dueStateSchema>;

// ---- Request bodies ----

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: taskKindSchema,
  location: z.string().trim().min(1).max(100).nullable(),
  description: z.string().trim().min(1).max(1000).nullable(),
  intervalDays: z.int().min(1).max(365).nullable(),
  lastDoneAt: z.iso.datetime().nullable(),
});

export const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().min(1).max(100).nullable().optional(),
  description: z.string().trim().min(1).max(1000).nullable().optional(),
  intervalDays: z.int().min(1).max(365).nullable().optional(),
  archived: z.boolean().optional(),
});

export const completeTaskSchema = z.object({
  note: z.string().trim().min(1).max(500).nullable(),
  doneBy: userEmailSchema.optional(),
  doneAt: z.iso.datetime().optional(),
});

export const completionPatchSchema = z.object({
  doneBy: userEmailSchema.optional(),
  doneAt: z.iso.datetime().optional(),
  note: z.string().trim().min(1).max(500).nullable().optional(),
});

// ---- Response bodies ----

export const completionSchema = z.object({
  id: z.int(),
  taskId: z.int(),
  doneBy: z.string(),
  doneAt: z.iso.datetime(),
  note: z.string().nullable(),
});
export type Completion = z.infer<typeof completionSchema>;

export const taskWithStatusSchema = z.object({
  id: z.int(),
  title: z.string(),
  kind: taskKindSchema,
  location: z.string().nullable(),
  description: z.string().nullable(),
  intervalDays: z.int().nullable(),
  createdAt: z.iso.datetime(),
  archived: z.boolean(),
  due: dueStateSchema,
  lastCompletion: completionSchema.nullable(),
});
export type TaskWithStatus = z.infer<typeof taskWithStatusSchema>;

export const taskListSchema = z.object({
  tasks: z.array(taskWithStatusSchema),
});
export type TaskList = z.infer<typeof taskListSchema>;

export const completionListSchema = z.object({
  completions: z.array(completionSchema),
});

export const commentSchema = z.object({
  id: z.int(),
  taskId: z.int(),
  author: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export type Comment = z.infer<typeof commentSchema>;

export const commentCreateSchema = z.object({
  body: z.string().trim().min(1).max(1000),
});

export const commentListSchema = z.object({
  comments: z.array(commentSchema),
});

export const okSchema = z.object({ ok: z.literal(true) });

export const healthSchema = z.object({
  ok: z.literal(true),
  email: z.string(),
});

export const meSchema = z.object({ email: z.string() });
