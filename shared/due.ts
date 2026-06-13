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

/**
 * Hue (0–120) for the due countdown: 120 green at just-done, 30 orange two days
 * before due, 0 red at/after due — interpolated and scaled to the interval.
 * Null for ad-hoc tasks (no countdown).
 */
export function dueColorHue(
  intervalDays: number | null,
  dueAt: string | null,
  now: Date,
): number | null {
  if (intervalDays === null || dueAt === null) {
    return null;
  }
  const daysUntilDue = utcDayNumber(new Date(dueAt)) - utcDayNumber(now);
  if (daysUntilDue <= 0) {
    return 0;
  }
  if (daysUntilDue >= intervalDays) {
    return 120;
  }
  if (daysUntilDue >= 2) {
    const t = (daysUntilDue - 2) / Math.max(intervalDays - 2, 1);
    return 30 + t * 90;
  }
  return (daysUntilDue / 2) * 30;
}
