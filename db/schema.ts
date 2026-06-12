import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["cleaning", "plants"] }).notNull(),
  location: text("location").notNull(),
  intervalDays: integer("interval_days"),
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

export type TaskRow = typeof tasks.$inferSelect;
export type CompletionRow = typeof completions.$inferSelect;
