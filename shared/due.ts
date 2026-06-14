import type { DueState, TaskType } from "./api";

const MS_PER_DAY = 86_400_000;

// The countdown ramp for a dated one-off has no interval to scale against, so a
// fixed window is used: green a fortnight out, orange→red as the date nears.
const ONE_OFF_RAMP_DAYS = 14;

const utcDayNumber = (date: Date): number =>
  Math.floor(date.getTime() / MS_PER_DAY);

const isoDate = (dayNumber: number): string => {
  const date = new Date(dayNumber * MS_PER_DAY);
  return date.toISOString().slice(0, 10);
};

const dueOnDay = (dueDay: number, now: Date): DueState => {
  const today = utcDayNumber(now);
  const status = dueDay > today ? "ok" : dueDay === today ? "due" : "overdue";
  return { status, dueAt: isoDate(dueDay) };
};

export interface DueInput {
  type: TaskType;
  intervalDays: number | null;
  lastDoneAt: Date | null;
  dueDate: Date | null;
}

/**
 * Due state uses UTC calendar days, not 24h windows: a 1-day-interval task
 * completed at 23:59 is due again the next calendar day.
 *
 * - `as_needed` → no due date (adhoc).
 * - `scheduled` → next due is `lastDoneAt + intervalDays` (due today if never done).
 * - `one_off` with a target date → ok/due/overdue against that date.
 * - `one_off` without a target date → an outstanding to-do (due, no date).
 */
export function computeDueState(input: DueInput, now: Date): DueState {
  switch (input.type) {
    case "as_needed":
      return { status: "adhoc", dueAt: null };
    case "one_off":
      return input.dueDate === null
        ? { status: "due", dueAt: null }
        : dueOnDay(utcDayNumber(input.dueDate), now);
    case "scheduled": {
      if (input.intervalDays === null) {
        return { status: "due", dueAt: isoDate(utcDayNumber(now)) };
      }
      if (input.lastDoneAt === null) {
        return { status: "due", dueAt: isoDate(utcDayNumber(now)) };
      }
      return dueOnDay(utcDayNumber(input.lastDoneAt) + input.intervalDays, now);
    }
  }
}

/**
 * Hue (0–120) for the due countdown: 120 green far out, 30 orange two days
 * before due, 0 red at/after due — interpolated and scaled to the ramp window
 * (the interval for scheduled tasks, a fixed window for dated one-offs). Null
 * when there is no countdown (no due date).
 */
export function dueColorHue(
  type: TaskType,
  intervalDays: number | null,
  dueAt: string | null,
  now: Date,
): number | null {
  if (dueAt === null) {
    return null;
  }
  const ramp =
    type === "scheduled" && intervalDays !== null
      ? intervalDays
      : ONE_OFF_RAMP_DAYS;
  const daysUntilDue = utcDayNumber(new Date(dueAt)) - utcDayNumber(now);
  if (daysUntilDue <= 0) {
    return 0;
  }
  if (daysUntilDue >= ramp) {
    return 120;
  }
  if (daysUntilDue >= 2) {
    const t = (daysUntilDue - 2) / Math.max(ramp - 2, 1);
    return 30 + t * 90;
  }
  return (daysUntilDue / 2) * 30;
}
