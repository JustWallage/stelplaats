const AMSTERDAM = "Europe/Amsterdam";

/** Minutes since midnight (0–1439) for the given instant in the given IANA zone. */
function minuteOfDayInTz(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return (get("hour") % 24) * 60 + get("minute");
}

// The reminder cron fires at both 05:00 and 06:00 UTC; exactly one of those is
// 07:00 in Amsterdam depending on DST (CET = UTC+1 → 06:00 UTC, CEST = UTC+2 →
// 05:00 UTC). Acting only on the tick whose Amsterdam-local hour is 7 makes the
// reminder land at 07:00 wall-clock all year without a second daily send.
export function isAmsterdamReminderHour(now: Date): boolean {
  return Math.floor(minuteOfDayInTz(now, AMSTERDAM) / 60) === 7;
}
