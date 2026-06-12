import { e2eHeaders } from "../playwright.config";
import { expect, test } from "./fixtures";

test("completing a task live-updates another client via WebSocket", async ({
  page,
  browser,
  request,
}) => {
  const create = await request.post("/api/tasks", {
    data: {
      title: "Dust shelves",
      kind: "cleaning",
      location: "Hallway",
      intervalDays: 14,
    },
  });
  expect(create.ok()).toBeTruthy();

  // Second, independent client watching the dashboard.
  const otherContext = await browser.newContext({
    extraHTTPHeaders: e2eHeaders,
  });
  const observer = await otherContext.newPage();
  await observer.goto("/");
  await expect(observer.getByText("Dust shelves")).toBeVisible();

  // First client completes the task from the cleaning list.
  await page.goto("/cleaning");
  await page.getByRole("button", { name: "Complete Dust shelves" }).click();

  // The observer page must update WITHOUT any reload or navigation.
  await expect(observer.getByText(/All caught up/)).toBeVisible({
    timeout: 10_000,
  });

  await otherContext.close();
});
