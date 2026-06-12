import { z } from "zod";

// ---- Task domain ----

export const taskKindSchema = z.enum(["cleaning", "plants"]);
export type TaskKind = z.infer<typeof taskKindSchema>;

export const dueStatusSchema = z.enum(["adhoc", "ok", "due", "overdue"]);
export type DueStatus = z.infer<typeof dueStatusSchema>;

export const dueStateSchema = z.object({
  status: dueStatusSchema,
  /** ISO date (YYYY-MM-DD, UTC) the task is/was next due; null for ad-hoc tasks. */
  dueAt: z.iso.date().nullable(),
});
export type DueState = z.infer<typeof dueStateSchema>;

// ---- Request bodies ----

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: taskKindSchema,
  location: z.string().trim().min(1).max(100),
  intervalDays: z.int().min(1).max(365).nullable(),
});
export type TaskCreate = z.infer<typeof taskCreateSchema>;

export const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  location: z.string().trim().min(1).max(100).optional(),
  intervalDays: z.int().min(1).max(365).nullable().optional(),
  archived: z.boolean().optional(),
});
export type TaskPatch = z.infer<typeof taskPatchSchema>;

export const completeTaskSchema = z.object({
  note: z.string().trim().min(1).max(500).nullable(),
});
export type CompleteTask = z.infer<typeof completeTaskSchema>;

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
  location: z.string(),
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
export type CompletionList = z.infer<typeof completionListSchema>;

export const healthSchema = z.object({
  ok: z.literal(true),
  email: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

export const meSchema = z.object({ email: z.string() });
export type Me = z.infer<typeof meSchema>;

export const apiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof apiErrorSchema>;
