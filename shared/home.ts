import type { TaskWithStatus } from "./api";

const MIN_UPCOMING = 3;

// Sort by due date ascending; entries without a date (dateless one-offs) sort
// last so dated work surfaces ahead of open-ended to-dos.
const byDueAt = (a: TaskWithStatus, b: TaskWithStatus): number => {
  if (a.due.dueAt === null) {
    return b.due.dueAt === null ? 0 : 1;
  }
  if (b.due.dueAt === null) {
    return -1;
  }
  return a.due.dueAt.localeCompare(b.due.dueAt);
};

/**
 * The home "Upcoming" list: scheduled and one-off tasks (both have a due
 * state). Every overdue task first (most overdue first), topped up to at least
 * MIN_UPCOMING with the soonest-due remaining tasks.
 */
export function selectUpcoming(tasks: TaskWithStatus[]): TaskWithStatus[] {
  const dated = tasks.filter(
    (task) => task.type === "scheduled" || task.type === "one_off",
  );
  const overdue = dated
    .filter((task) => task.due.status === "overdue")
    .sort(byDueAt);
  const rest = dated
    .filter((task) => task.due.status !== "overdue")
    .sort(byDueAt);
  const fill = Math.max(0, MIN_UPCOMING - overdue.length);
  return [...overdue, ...rest.slice(0, fill)];
}

/** A kind list ordered soonest-due first; as-needed tasks (no due date) sink last. */
export function sortByDueSoonest(tasks: TaskWithStatus[]): TaskWithStatus[] {
  return [...tasks].sort(byDueAt);
}

/** The home "As needed" list: the three as-needed tasks done longest ago. */
export function selectAsNeeded(tasks: TaskWithStatus[]): TaskWithStatus[] {
  return tasks
    .filter((task) => task.type === "as_needed")
    .sort((a, b) =>
      (a.lastCompletion?.doneAt ?? "").localeCompare(
        b.lastCompletion?.doneAt ?? "",
      ),
    )
    .slice(0, 3);
}
