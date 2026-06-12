import { expect, test } from "./fixtures";

test("create, complete, inspect history, archive", async ({ page }) => {
  await page.goto("/cleaning");

  // Create
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Title").fill("Mop kitchen floor");
  await page.getByLabel("Location").fill("Kitchen");
  await page.getByLabel(/Repeat every/).fill("7");
  await page.getByRole("button", { name: "Create" }).click();

  const card = page.getByText("Mop kitchen floor");
  await expect(card).toBeVisible();
  await expect(page.getByText("Due", { exact: true })).toBeVisible();

  // Complete via the card button
  await page
    .getByRole("button", { name: "Complete Mop kitchen floor" })
    .click();
  await expect(page.getByText(/OK · next/)).toBeVisible();

  // History shows the completion with the test identity
  await card.click();
  await expect(
    page.getByRole("heading", { name: "Mop kitchen floor" }),
  ).toBeVisible();
  await expect(page.getByText("by e2e@stelplaats.test")).toBeVisible();

  // Complete again with a note from the detail page
  await page.getByPlaceholder("Optional note").fill("extra soap");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("“extra soap”")).toBeVisible();

  // Archive navigates back to the list and the task is gone
  await page.getByRole("button", { name: "Archive task" }).click();
  await expect(page).toHaveURL(/\/cleaning$/);
  await expect(page.getByText("Mop kitchen floor")).toBeHidden();
});

test("dashboard groups due and overdue tasks", async ({ page, request }) => {
  const create = await request.post("/api/tasks", {
    data: {
      title: "Water ficus",
      kind: "plants",
      location: "Office",
      intervalDays: 3,
    },
  });
  expect(create.ok()).toBeTruthy();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("Water ficus")).toBeVisible();

  // Completing it leaves the dashboard empty
  await page.getByRole("button", { name: "Complete Water ficus" }).click();
  await expect(page.getByText(/All caught up/)).toBeVisible();
});

test("validation errors surface in the create dialog", async ({ page }) => {
  await page.goto("/plants");
  await page.getByRole("button", { name: "Add task" }).click();
  // 250 chars passes browser-side constraints but fails the zod max(200).
  await page.getByLabel("Title").fill("x".repeat(250));
  await page.getByLabel("Location").fill("y");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(/Could not create the task/)).toBeVisible();
});
