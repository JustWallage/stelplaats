import type { DueStatus, TaskType, TaskWithStatus } from "./api";
import { describe, expect, it } from "vitest";
import { selectAsNeeded, selectUpcoming, sortByDueSoonest } from "./home";

let nextId = 1;

function task(overrides: {
  type?: TaskType;
  status?: DueStatus;
  dueAt?: string | null;
  intervalDays?: number | null;
  dueDate?: string | null;
  lastDoneAt?: string | null;
}): TaskWithStatus {
  const type = overrides.type ?? "scheduled";
  return {
    id: nextId++,
    title: `Task ${String(nextId)}`,
    kind: "cleaning",
    type,
    location: null,
    description: null,
    intervalDays:
      overrides.intervalDays === undefined
        ? type === "scheduled"
          ? 7
          : null
        : overrides.intervalDays,
    dueDate: overrides.dueDate ?? null,
    createdAt: "2026-06-01T00:00:00.000Z",
    archived: false,
    due: {
      status: overrides.status ?? "ok",
      dueAt: overrides.dueAt ?? null,
    },
    lastCompletion:
      overrides.lastDoneAt === undefined || overrides.lastDoneAt === null
        ? null
        : {
            id: nextId,
            taskId: nextId,
            doneBy: "just@wallage.nl",
            doneAt: overrides.lastDoneAt,
            note: null,
          },
  };
}

describe("selectUpcoming", () => {
  it("shows all overdue tasks even beyond the minimum", () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      task({ status: "overdue", dueAt: `2026-06-0${String(i + 1)}` }),
    );
    expect(selectUpcoming(tasks)).toHaveLength(5);
  });

  it("fills to the minimum of three with soonest-due, overdue first", () => {
    const overdue1 = task({ status: "overdue", dueAt: "2026-06-05" });
    const overdue2 = task({ status: "overdue", dueAt: "2026-06-01" });
    const soon = task({ status: "ok", dueAt: "2026-06-14" });
    const later = task({ status: "ok", dueAt: "2026-06-20" });
    const result = selectUpcoming([later, soon, overdue1, overdue2]);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(overdue2);
    expect(result[1]).toBe(overdue1);
    expect(result[2]).toBe(soon);
  });

  it("includes one-offs, with dateless ones sorted last", () => {
    const scheduled = task({ status: "due", dueAt: "2026-06-12" });
    const datedOneOff = task({
      type: "one_off",
      status: "ok",
      dueAt: "2026-06-15",
      dueDate: "2026-06-15",
    });
    const datelessOneOff = task({
      type: "one_off",
      status: "due",
      dueAt: null,
    });
    const result = selectUpcoming([datelessOneOff, scheduled, datedOneOff]);
    expect(result).toEqual([scheduled, datedOneOff, datelessOneOff]);
  });

  it("ignores as-needed tasks", () => {
    const tasks = [
      task({ type: "as_needed", status: "adhoc" }),
      task({ status: "due", dueAt: "2026-06-12" }),
    ];
    expect(selectUpcoming(tasks)).toHaveLength(1);
  });
});

describe("sortByDueSoonest", () => {
  it("orders scheduled tasks soonest-due first, as-needed last", () => {
    const later = task({ status: "ok", dueAt: "2026-06-20" });
    const overdue = task({ status: "overdue", dueAt: "2026-06-01" });
    const asNeeded = task({ type: "as_needed", status: "adhoc" });
    const soon = task({ status: "due", dueAt: "2026-06-12" });
    const result = sortByDueSoonest([later, asNeeded, overdue, soon]);
    expect(result).toEqual([overdue, soon, later, asNeeded]);
  });

  it("does not mutate the input array", () => {
    const input = [
      task({ status: "ok", dueAt: "2026-06-20" }),
      task({ status: "overdue", dueAt: "2026-06-01" }),
    ];
    const snapshot = [...input];
    sortByDueSoonest(input);
    expect(input).toEqual(snapshot);
  });
});

describe("selectAsNeeded", () => {
  it("orders by done-longest-ago, never-done first, capped at three", () => {
    const neverDone = task({ type: "as_needed", status: "adhoc" });
    const old = task({
      type: "as_needed",
      status: "adhoc",
      lastDoneAt: "2026-01-01T00:00:00.000Z",
    });
    const recent = task({
      type: "as_needed",
      status: "adhoc",
      lastDoneAt: "2026-06-01T00:00:00.000Z",
    });
    const scheduled = task({ status: "due", dueAt: "2026-06-12" });
    const oneOff = task({ type: "one_off", status: "due", dueAt: null });
    const result = selectAsNeeded([recent, old, neverDone, scheduled, oneOff]);
    expect(result).toEqual([neverDone, old, recent]);
  });
});
