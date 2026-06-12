import type { DueState } from "./api";

const MS_PER_DAY = 86_400_000;

const utcDayNumber = (date: Date): number =>
  Math.floor(date.getTime() / MS_PER_DAY);

const isoDate = (dayNumber: number): string => {
  const date = new Date(dayNumber * MS_PER_DAY);
  return date.toISOString().slice(0, 10);
};

/**
 * Due state uses UTC calendar days, not 24h windows: a 1-day-interval task
 * completed at 23:59 is due again the next calendar day.
 */
export function computeDueState(
  intervalDays: number | null,
  lastDoneAt: Date | null,
  now: Date,
): DueState {
  if (intervalDays === null) {
    return { status: "adhoc", dueAt: null };
  }
  const today = utcDayNumber(now);
  if (lastDoneAt === null) {
    return { status: "due", dueAt: isoDate(today) };
  }
  const dueDay = utcDayNumber(lastDoneAt) + intervalDays;
  const status = dueDay > today ? "ok" : dueDay === today ? "due" : "overdue";
  return { status, dueAt: isoDate(dueDay) };
}
