import type { TaskWithStatus } from "./api";

const MIN_UPCOMING = 3;

const byDueAt = (a: TaskWithStatus, b: TaskWithStatus): number =>
  (a.due.dueAt ?? "").localeCompare(b.due.dueAt ?? "");

/**
 * The home "Upcoming" list: every overdue scheduled task (most overdue first),
 * topped up to at least MIN_UPCOMING with the soonest-due remaining tasks.
 */
export function selectUpcoming(tasks: TaskWithStatus[]): TaskWithStatus[] {
  const scheduled = tasks.filter((task) => task.intervalDays !== null);
  const overdue = scheduled
    .filter((task) => task.due.status === "overdue")
    .sort(byDueAt);
  const rest = scheduled
    .filter((task) => task.due.status !== "overdue")
    .sort(byDueAt);
  const fill = Math.max(0, MIN_UPCOMING - overdue.length);
  return [...overdue, ...rest.slice(0, fill)];
}

/** A kind list ordered soonest-due first; ad-hoc tasks (no due date) sink last. */
export function sortByDueSoonest(tasks: TaskWithStatus[]): TaskWithStatus[] {
  return [...tasks].sort((a, b) => {
    if (a.due.dueAt === null || b.due.dueAt === null) {
      return Number(a.due.dueAt === null) - Number(b.due.dueAt === null);
    }
    return a.due.dueAt.localeCompare(b.due.dueAt);
  });
}

/** The home "Ad-hoc" list: the three ad-hoc tasks done longest ago. */
export function selectAdhoc(tasks: TaskWithStatus[]): TaskWithStatus[] {
  return tasks
    .filter((task) => task.intervalDays === null)
    .sort((a, b) =>
      (a.lastCompletion?.doneAt ?? "").localeCompare(
        b.lastCompletion?.doneAt ?? "",
      ),
    )
    .slice(0, 3);
}
