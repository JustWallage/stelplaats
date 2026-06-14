import { expect, test } from "./fixtures";

test("create, complete via modal, inspect history, archive", async ({
  page,
}) => {
  await page.goto("/cleaning");

  // Create (location left empty — it is optional now)
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Title").fill("Mop kitchen floor");
  await page.getByLabel(/Repeat every/).fill("7");
  await page.getByRole("button", { name: "Create" }).click();

  const card = page.getByText("Mop kitchen floor", { exact: true });
  await expect(card).toBeVisible();
  await expect(page.getByText("Due today")).toBeVisible();

  // Complete via the card button → confirm in the modal
  await page
    .getByRole("button", { name: "Complete Mop kitchen floor" })
    .click();
  await page.getByRole("button", { name: "Log it" }).click();
  await expect(page.getByText("7 days left")).toBeVisible();

  // History shows the completion with the test identity
  await card.click();
  await expect(
    page.getByRole("heading", { name: "Mop kitchen floor" }),
  ).toBeVisible();
  await expect(page.getByText("e2e@stelplaats.test").first()).toBeVisible();
  // The detail page mirrors the card: prominent countdown + a muted "last done".
  await expect(page.getByText("7 days left")).toBeVisible();
  await expect(page.getByText(/Last done today/)).toBeVisible();

  // Complete again with a note from the detail page
  await page.getByRole("button", { name: "I did this" }).click();
  await page.getByLabel("Note (optional)").fill("extra soap");
  await page.getByRole("button", { name: "Log it" }).click();
  await expect(page.getByText("“extra soap”")).toBeVisible();

  // Archive navigates back to the list and the task is gone
  await page.getByRole("button", { name: "Archive task" }).click();
  await expect(page).toHaveURL(/\/cleaning$/);
  await expect(page.getByText("Mop kitchen floor")).toBeHidden();
});

test("dashboard shows upcoming tasks and reflects completion", async ({
  page,
  request,
}) => {
  const create = await request.post("/api/tasks", {
    data: {
      title: "Water ficus",
      kind: "plants",
      location: "Office",
      description: null,
      intervalDays: 3,
      lastDoneAt: null,
    },
  });
  expect(create.ok()).toBeTruthy();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByText("Water ficus")).toBeVisible();
  await expect(page.getByText("Due today")).toBeVisible();

  // Completing it keeps it on the dashboard as the next-due task, now counting
  // down to the next due date.
  await page.getByRole("button", { name: "Complete Water ficus" }).click();
  await page.getByRole("button", { name: "Log it" }).click();
  await expect(page.getByText("3 days left")).toBeVisible();
});

test("kind list orders tasks soonest-due first, ad-hoc last", async ({
  page,
  request,
}) => {
  const mk = (title: string, body: Record<string, unknown>) =>
    request.post("/api/tasks", {
      data: {
        title,
        kind: "cleaning",
        location: null,
        description: null,
        ...body,
      },
    });
  // Bravo is due after Alpha; Charlie is ad-hoc (no due date) so it sinks last.
  await mk("Bravo", {
    intervalDays: 7,
    lastDoneAt: "2026-03-01T00:00:00.000Z",
  });
  await mk("Alpha", {
    intervalDays: 7,
    lastDoneAt: "2026-01-01T00:00:00.000Z",
  });
  await mk("Charlie", { intervalDays: null, lastDoneAt: null });

  await page.goto("/cleaning");
  const cards = page.locator('a[href^="/tasks/"]');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText("Alpha");
  await expect(cards.nth(1)).toContainText("Bravo");
  await expect(cards.nth(2)).toContainText("Charlie");
});

test("validation errors surface in the create dialog", async ({ page }) => {
  await page.goto("/plants");
  await page.getByRole("button", { name: "Add task" }).click();
  // 250 chars passes browser-side constraints but fails the zod max(200).
  await page.getByLabel("Title").fill("x".repeat(250));
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText(/Could not create the task/)).toBeVisible();
});
