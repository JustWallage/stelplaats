import { describe, expect, it } from "vitest";
import type { TaskType } from "./api";
import {
  computeDueState,
  daysUntilDue,
  type DueInput,
  dueColorHue,
} from "./due";

const noon = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`);

const input = (over: Partial<DueInput> & { type: TaskType }): DueInput => ({
  intervalDays: null,
  lastDoneAt: null,
  dueDate: null,
  ...over,
});

describe("computeDueState", () => {
  const now = noon("2026-06-12");

  it("returns adhoc for an as-needed task, ignoring any history", () => {
    expect(computeDueState(input({ type: "as_needed" }), now)).toEqual({
      status: "adhoc",
      dueAt: null,
    });
  });

  it("is due today when a scheduled task was never completed", () => {
    expect(
      computeDueState(input({ type: "scheduled", intervalDays: 7 }), now),
    ).toEqual({ status: "due", dueAt: "2026-06-12" });
  });

  it("is ok when a scheduled task's next due date is in the future", () => {
    expect(
      computeDueState(
        input({
          type: "scheduled",
          intervalDays: 7,
          lastDoneAt: noon("2026-06-10"),
        }),
        now,
      ),
    ).toEqual({ status: "ok", dueAt: "2026-06-17" });
  });

  it("is overdue when a scheduled task's due date is past", () => {
    expect(
      computeDueState(
        input({
          type: "scheduled",
          intervalDays: 3,
          lastDoneAt: noon("2026-06-01"),
        }),
        now,
      ),
    ).toEqual({ status: "overdue", dueAt: "2026-06-04" });
  });

  it("uses UTC calendar days, not 24h windows", () => {
    const lastDoneAt = new Date("2026-06-11T23:59:00Z");
    expect(
      computeDueState(
        input({ type: "scheduled", intervalDays: 1, lastDoneAt }),
        noon("2026-06-12"),
      ),
    ).toEqual({ status: "due", dueAt: "2026-06-12" });
  });

  it("computes a one-off's status from its target date", () => {
    expect(
      computeDueState(
        input({ type: "one_off", dueDate: noon("2026-06-20") }),
        now,
      ),
    ).toEqual({ status: "ok", dueAt: "2026-06-20" });
    expect(
      computeDueState(
        input({ type: "one_off", dueDate: noon("2026-06-12") }),
        now,
      ),
    ).toEqual({ status: "due", dueAt: "2026-06-12" });
    expect(
      computeDueState(
        input({ type: "one_off", dueDate: noon("2026-06-01") }),
        now,
      ),
    ).toEqual({ status: "overdue", dueAt: "2026-06-01" });
  });

  it("treats a dateless one-off as an outstanding to-do", () => {
    expect(computeDueState(input({ type: "one_off" }), now)).toEqual({
      status: "due",
      dueAt: null,
    });
  });
});

describe("daysUntilDue", () => {
  const now = noon("2026-06-12");

  it("counts whole UTC days until the due date", () => {
    expect(daysUntilDue("2026-06-19", now)).toBe(7);
    expect(daysUntilDue("2026-06-13", now)).toBe(1);
  });

  it("is zero on the due date and negative once overdue", () => {
    expect(daysUntilDue("2026-06-12", now)).toBe(0);
    expect(daysUntilDue("2026-06-11", now)).toBe(-1);
    expect(daysUntilDue("2026-06-09", now)).toBe(-3);
  });
});

describe("daysUntilDue", () => {
  const now = noon("2026-06-12");

  it("counts whole UTC days until the due date", () => {
    expect(daysUntilDue("2026-06-19", now)).toBe(7);
    expect(daysUntilDue("2026-06-13", now)).toBe(1);
  });

  it("is zero on the due date and negative once overdue", () => {
    expect(daysUntilDue("2026-06-12", now)).toBe(0);
    expect(daysUntilDue("2026-06-11", now)).toBe(-1);
    expect(daysUntilDue("2026-06-09", now)).toBe(-3);
  });
});

describe("dueColorHue", () => {
  const now = noon("2026-06-12");

  it("is null when there is no due date", () => {
    expect(dueColorHue("as_needed", null, null, now)).toBeNull();
    expect(dueColorHue("one_off", null, null, now)).toBeNull();
  });

  it("scales a scheduled task to its interval", () => {
    expect(dueColorHue("scheduled", 7, "2026-06-19", now)).toBe(120);
    expect(dueColorHue("scheduled", 7, "2026-06-12", now)).toBe(0);
    expect(dueColorHue("scheduled", 7, "2026-06-14", now)).toBe(30);
  });

  it("scales a dated one-off over its fixed window", () => {
    expect(dueColorHue("one_off", null, "2026-06-26", now)).toBe(120);
    expect(dueColorHue("one_off", null, "2026-06-12", now)).toBe(0);
    expect(dueColorHue("one_off", null, "2026-06-14", now)).toBe(30);
  });
});
