import { describe, expect, it } from "vitest";
import { computeDueState } from "./due";

const noon = (isoDate: string) => new Date(`${isoDate}T12:00:00Z`);

describe("computeDueState", () => {
  const now = noon("2026-06-12");

  it("returns adhoc when the task has no interval", () => {
    expect(computeDueState(null, noon("2026-06-01"), now)).toEqual({
      status: "adhoc",
      dueAt: null,
    });
    expect(computeDueState(null, null, now)).toEqual({
      status: "adhoc",
      dueAt: null,
    });
  });

  it("is due today when the task was never completed", () => {
    expect(computeDueState(7, null, now)).toEqual({
      status: "due",
      dueAt: "2026-06-12",
    });
  });

  it("is ok when the next due date is in the future", () => {
    expect(computeDueState(7, noon("2026-06-10"), now)).toEqual({
      status: "ok",
      dueAt: "2026-06-17",
    });
  });

  it("is due when the due date is today", () => {
    expect(computeDueState(2, noon("2026-06-10"), now)).toEqual({
      status: "due",
      dueAt: "2026-06-12",
    });
  });

  it("is overdue when the due date is before today", () => {
    expect(computeDueState(3, noon("2026-06-01"), now)).toEqual({
      status: "overdue",
      dueAt: "2026-06-04",
    });
  });

  it("uses UTC calendar days, not 24h windows", () => {
    // Completed at 23:59 UTC yesterday with a 1-day interval → due today,
    // even though fewer than 24 hours have passed.
    const lastDone = new Date("2026-06-11T23:59:00Z");
    expect(computeDueState(1, lastDone, noon("2026-06-12"))).toEqual({
      status: "due",
      dueAt: "2026-06-12",
    });
  });
});
