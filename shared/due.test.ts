import { describe, expect, it } from "vitest";
import { computeDueState, dueColorHue } from "./due";

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

describe("dueColorHue", () => {
  const now = noon("2026-06-12");

  it("is null for ad-hoc tasks", () => {
    expect(dueColorHue(null, "2026-06-20", now)).toBeNull();
    expect(dueColorHue(7, null, now)).toBeNull();
  });

  it("is green when a full interval remains", () => {
    expect(dueColorHue(7, "2026-06-19", now)).toBe(120);
  });

  it("is red at and past the due date", () => {
    expect(dueColorHue(7, "2026-06-12", now)).toBe(0);
    expect(dueColorHue(7, "2026-06-09", now)).toBe(0);
  });

  it("is orange two days before due", () => {
    expect(dueColorHue(7, "2026-06-14", now)).toBe(30);
  });

  it("interpolates between green and orange in the middle", () => {
    const hue = dueColorHue(7, "2026-06-16", now);
    expect(hue).toBeGreaterThan(30);
    expect(hue).toBeLessThan(120);
  });
});
