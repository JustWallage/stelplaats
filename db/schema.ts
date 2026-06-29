import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["cleaning", "plants", "house"] }).notNull(),
  type: text("type", {
    enum: ["scheduled", "as_needed", "one_off"],
  }).notNull(),
  location: text("location").notNull(),
  description: text("description"),
  intervalDays: integer("interval_days"),
  dueDate: integer("due_date", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
});

export const completions = sqliteTable("completions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  doneBy: text("done_by").notNull(),
  doneAt: integer("done_at", { mode: "timestamp" }).notNull(),
  note: text("note"),
});

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  author: text("author").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// One row per user linking a Telegram chat to the account. The webhook looks
// chats up by chatId; linkCode holds the pending one-time code minted by the
// web UI (cleared once /start consumes it). chatId null means not linked. The
// daily 07:00 Amsterdam reminder is sent to every row whose chatId is set —
// there is no per-user schedule, so no slot/timezone columns (cf. project news).
export const telegram = sqliteTable(
  "telegram",
  {
    userEmail: text("user_email").primaryKey(),
    chatId: integer("chat_id"),
    chatUsername: text("chat_username"),
    chatName: text("chat_name"),
    linkCode: text("link_code"),
    linkCodeExpiresAt: integer("link_code_expires_at", { mode: "timestamp" }),
  },
  (t) => [uniqueIndex("telegram_chat_id_idx").on(t.chatId)],
);

export type TaskRow = typeof tasks.$inferSelect;
export type CompletionRow = typeof completions.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type TelegramRow = typeof telegram.$inferSelect;
