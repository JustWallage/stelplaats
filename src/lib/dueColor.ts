import type { TaskWithStatus } from "@shared/api";
import { dueColorHue } from "@shared/due";

/** CSS color for a task's due countdown, or null for ad-hoc tasks. */
export function dueColor(
  task: TaskWithStatus,
  now: Date = new Date(),
): string | null {
  const hue = dueColorHue(task.intervalDays, task.due.dueAt, now);
  return hue === null ? null : `hsl(${String(Math.round(hue))} 80% 45%)`;
}
