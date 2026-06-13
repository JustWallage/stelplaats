import { describe, expect, it } from "vitest";
import { displayName } from "./users";

describe("displayName", () => {
  it("maps known emails to friendly names", () => {
    expect(displayName("just@wallage.nl")).toBe("Just");
    expect(displayName("suusraedts2018@gmail.com")).toBe("Suus");
  });

  it("falls back to the raw email for unknown users", () => {
    expect(displayName("e2e@stelplaats.test")).toBe("e2e@stelplaats.test");
  });
});
