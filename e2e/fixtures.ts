import { test as base, expect } from "@playwright/test";

// Every test starts from a wiped database (single worker, see config).
export const test = base.extend({
  page: async ({ page, request }, use) => {
    const reset = await request.post("/api/test/reset");
    expect(reset.ok()).toBeTruthy();
    await use(page);
  },
});

export { expect } from "@playwright/test";
