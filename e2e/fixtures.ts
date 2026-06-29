import { test as base, expect, type Page } from "@playwright/test";

// The swipe deck keeps every main page mounted side by side, so a task can
// appear on its kind list and the dashboard at once. Scope text queries to the
// panel currently in view (the only one without the `inert` attribute).
export const visiblePanel = (page: Page) =>
  page.locator("[data-deck-path]:not([inert])");

// Every test starts from a wiped database (single worker, see config).
export const test = base.extend({
  page: async ({ page, request }, use) => {
    const reset = await request.post("/api/test/reset");
    expect(reset.ok()).toBeTruthy();
    await use(page);
  },
});

export { expect } from "@playwright/test";
