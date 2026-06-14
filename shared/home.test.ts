import type { DueStatus, TaskWithStatus } from "./api";
import { describe, expect, it } from "vitest";
import { selectAdhoc, selectUpcoming, sortByDueSoonest } from "./home";

let nextId = 1;

function task(overrides: {
  status?: DueStatus;
  dueAt?: string | null;
  intervalDays?: number | null;
  lastDoneAt?: string | null;
}): TaskWithStatus {
  const intervalDays =
    overrides.intervalDays === undefined ? 7 : overrides.intervalDays;
  return {
    id: nextId++,
    title: `Task ${String(nextId)}`,
    kind: "cleaning",
    location: null,
    description: null,
    intervalDays,
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

  it("returns the three soonest when nothing is overdue", () => {
    const tasks = [
      task({ status: "ok", dueAt: "2026-06-20" }),
      task({ status: "due", dueAt: "2026-06-12" }),
      task({ status: "ok", dueAt: "2026-06-15" }),
      task({ status: "ok", dueAt: "2026-06-18" }),
    ];
    const result = selectUpcoming(tasks);
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.due.dueAt)).toEqual([
      "2026-06-12",
      "2026-06-15",
      "2026-06-18",
    ]);
  });

  it("ignores ad-hoc tasks", () => {
    const tasks = [
      task({ intervalDays: null, status: "adhoc" }),
      task({ status: "due", dueAt: "2026-06-12" }),
    ];
    expect(selectUpcoming(tasks)).toHaveLength(1);
  });
});

describe("sortByDueSoonest", () => {
  it("orders scheduled tasks soonest-due first, ad-hoc last", () => {
    const later = task({ status: "ok", dueAt: "2026-06-20" });
    const overdue = task({ status: "overdue", dueAt: "2026-06-01" });
    const adhoc = task({ intervalDays: null, status: "adhoc" });
    const soon = task({ status: "due", dueAt: "2026-06-12" });
    const result = sortByDueSoonest([later, adhoc, overdue, soon]);
    expect(result).toEqual([overdue, soon, later, adhoc]);
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

describe("selectAdhoc", () => {
  it("orders by done-longest-ago, never-done first, capped at three", () => {
    const neverDone = task({ intervalDays: null, status: "adhoc" });
    const old = task({
      intervalDays: null,
      status: "adhoc",
      lastDoneAt: "2026-01-01T00:00:00.000Z",
    });
    const recent = task({
      intervalDays: null,
      status: "adhoc",
      lastDoneAt: "2026-06-01T00:00:00.000Z",
    });
    const scheduled = task({ status: "due", dueAt: "2026-06-12" });
    const result = selectAdhoc([recent, old, neverDone, scheduled]);
    expect(result).toEqual([neverDone, old, recent]);
  });
});
