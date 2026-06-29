import { z } from "zod";
import { userEmailSchema } from "./users";

// ---- Task domain ----

const taskKindSchema = z.enum(["cleaning", "plants", "house"]);
export type TaskKind = z.infer<typeof taskKindSchema>;

const taskTypeSchema = z.enum(["scheduled", "as_needed", "one_off"]);
export type TaskType = z.infer<typeof taskTypeSchema>;

const dueStatusSchema = z.enum(["adhoc", "ok", "due", "overdue"]);
export type DueStatus = z.infer<typeof dueStatusSchema>;

const dueStateSchema = z.object({
  status: dueStatusSchema,
  /** ISO date (YYYY-MM-DD, UTC) the task is/was next due; null when there is none. */
  dueAt: z.iso.date().nullable(),
});
export type DueState = z.infer<typeof dueStateSchema>;

// ---- Request bodies ----

// Fields every task carries, regardless of type. The per-type fields
// (intervalDays / dueDate / lastDoneAt) live on the variants below so an
// invalid combination cannot be expressed.
const taskContentBase = {
  title: z.string().trim().min(1).max(200),
  kind: taskKindSchema,
  location: z.string().trim().min(1).max(100).nullable(),
  description: z.string().trim().min(1).max(1000).nullable(),
};

const intervalDaysSchema = z.int().min(1).max(365);

// Creation seeds an optional first completion (lastDoneAt) for the recurring
// types only; a one-off is done once and then archived, so it takes no seed.
export const taskCreateSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...taskContentBase,
      type: z.literal("scheduled"),
      intervalDays: intervalDaysSchema,
      lastDoneAt: z.iso.datetime().nullable(),
    })
    .strict(),
  z
    .object({
      ...taskContentBase,
      type: z.literal("as_needed"),
      lastDoneAt: z.iso.datetime().nullable(),
    })
    .strict(),
  z
    .object({
      ...taskContentBase,
      type: z.literal("one_off"),
      dueDate: z.iso.date().nullable(),
    })
    .strict(),
]);

// A full content edit (including a type change). No lastDoneAt — editing never
// seeds completions.
const taskEditSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...taskContentBase,
      type: z.literal("scheduled"),
      intervalDays: intervalDaysSchema,
    })
    .strict(),
  z.object({ ...taskContentBase, type: z.literal("as_needed") }).strict(),
  z
    .object({
      ...taskContentBase,
      type: z.literal("one_off"),
      dueDate: z.iso.date().nullable(),
    })
    .strict(),
]);

// PATCH is either the archive toggle (left untouched) or a full content edit.
export const taskPatchSchema = z.union([
  z.object({ archived: z.boolean() }).strict(),
  taskEditSchema,
]);

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
  type: taskTypeSchema,
  location: z.string().nullable(),
  description: z.string().nullable(),
  intervalDays: z.int().nullable(),
  /** One-off target date (YYYY-MM-DD, UTC); null otherwise. */
  dueDate: z.iso.date().nullable(),
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

// ---- Telegram ----

export const telegramStatusSchema = z.object({
  /** Whether a Telegram chat is bound to this account. */
  linked: z.boolean(),
  /** Human label for the connected chat ("@handle" or name); null if unknown. */
  chatLabel: z.string().nullable(),
});
export type TelegramStatus = z.infer<typeof telegramStatusSchema>;

export const telegramLinkCodeSchema = z.object({
  /** One-time code to send the bot as `/start <code>`. */
  code: z.string(),
  /** `t.me` deep link, or null when the bot username is not configured. */
  url: z.string().nullable(),
  expiresAt: z.iso.datetime(),
});
export type TelegramLinkCode = z.infer<typeof telegramLinkCodeSchema>;

export const healthSchema = z.object({
  ok: z.literal(true),
  email: z.string(),
});

export const meSchema = z.object({ email: z.string() });
