export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Date-only ISO (YYYY-MM-DD) → DD/MM/YYYY, with no timezone shift. */
export const formatDate = (isoDate: string): string => {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
};

/** ISO → value for an <input type="datetime-local"> (local time, no seconds). */
export const toDateTimeLocal = (iso: string): string => {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const MS_PER_DAY = 86_400_000;

export const formatRelative = (iso: string, now: Date = new Date()): string => {
  const days = Math.floor((now.getTime() - Date.parse(iso)) / MS_PER_DAY);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return `${String(days)} days ago`;
};
