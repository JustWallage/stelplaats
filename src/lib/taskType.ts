import type { TaskWithStatus } from "@shared/api";

/** Human-readable description of a task's schedule, for cards and detail. */
export function taskTypeLabel(task: TaskWithStatus): string {
  switch (task.type) {
    case "scheduled":
      return task.intervalDays === null
        ? "scheduled"
        : `every ${String(task.intervalDays)} days`;
    case "as_needed":
      return "as needed";
    case "one_off":
      return task.dueDate === null ? "one-off" : `one-off · by ${task.dueDate}`;
  }
}
