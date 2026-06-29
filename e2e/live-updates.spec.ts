import { e2eHeaders } from "../playwright.config";
import { expect, test, visiblePanel } from "./fixtures";

test("completing a task live-updates another client via WebSocket", async ({
  page,
  browser,
  request,
}) => {
  const create = await request.post("/api/tasks", {
    data: {
      title: "Dust shelves",
      kind: "cleaning",
      type: "scheduled",
      location: "Hallway",
      description: null,
      intervalDays: 14,
      lastDoneAt: null,
    },
  });
  expect(create.ok()).toBeTruthy();

  // Second, independent client watching the dashboard.
  const otherContext = await browser.newContext({
    extraHTTPHeaders: e2eHeaders,
  });
  const observer = await otherContext.newPage();
  await observer.goto("/");
  await expect(visiblePanel(observer).getByText("Dust shelves")).toBeVisible();

  // First client completes the task from the cleaning list (via the modal).
  await page.goto("/cleaning");
  await page.getByRole("button", { name: "Complete Dust shelves" }).click();
  await page.getByRole("button", { name: "Log it" }).click();

  // The observer page must update WITHOUT any reload or navigation: the task
  // stays on the dashboard but flips from due to counting down once completed.
  await expect(visiblePanel(observer).getByText("14 days left")).toBeVisible({
    timeout: 10_000,
  });

  await otherContext.close();
});
