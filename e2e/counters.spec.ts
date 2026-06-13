import { taskWithStatusSchema } from "@shared/api";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";

async function createTask(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const res = await request.post("/api/tasks", {
    data: {
      title: "Vacuum living room",
      kind: "cleaning",
      location: "Living room",
      description: null,
      intervalDays: 7,
      lastDoneAt: null,
      ...overrides,
    },
  });
  expect(res.ok()).toBeTruthy();
  return taskWithStatusSchema.parse(await res.json()).id;
}

async function complete(request: APIRequestContext, id: number): Promise<void> {
  const res = await request.post(`/api/tasks/${String(id)}/complete`, {
    data: { note: "first pass" },
  });
  expect(res.ok()).toBeTruthy();
}

test("logs a completion under an overridden user", async ({
  page,
  request,
}) => {
  const id = await createTask(request, { title: "Refill water filter" });

  await page.goto("/cleaning");
  await page
    .getByRole("button", { name: "Complete Refill water filter" })
    .click();
  await page.getByLabel("Done by").click();
  await page.getByRole("option", { name: "Suus" }).click();
  await page.getByRole("button", { name: "Log it" }).click();

  await page.goto(`/tasks/${String(id)}`);
  await expect(page.getByText("Suus").first()).toBeVisible();
});

test("logs a completion at a chosen date", async ({ page, request }) => {
  const id = await createTask(request, { title: "Bleed the radiators" });

  await page.goto("/cleaning");
  await page
    .getByRole("button", { name: "Complete Bleed the radiators" })
    .click();
  await page.getByLabel("When").fill("2026-01-15T12:00");
  await page.getByRole("button", { name: "Log it" }).click();

  await page.goto(`/tasks/${String(id)}`);
  await expect(page.getByText(/15\/01\/2026/)).toBeVisible();
});

test("edits a history record's note", async ({ page, request }) => {
  const id = await createTask(request, { title: "Clean the oven" });
  await complete(request, id);

  await page.goto(`/tasks/${String(id)}`);
  await expect(page.getByText("“first pass”")).toBeVisible();

  await page.getByRole("button", { name: "Edit record" }).click();
  const note = page.getByLabel("Note", { exact: true });
  await note.fill("did the racks too");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("“did the racks too”")).toBeVisible();
});

test("deletes a history record and the task becomes due again", async ({
  page,
  request,
}) => {
  const id = await createTask(request, { title: "Descale kettle" });
  await complete(request, id);

  await page.goto(`/tasks/${String(id)}`);
  await expect(page.getByText("“first pass”")).toBeVisible();

  await page.getByRole("button", { name: "Delete record" }).click();
  await expect(page.getByText("Never completed yet.")).toBeVisible();
  await expect(page.getByText("Due today")).toBeVisible();
  await expect(page.getByText("Never done")).toBeVisible();
});

test("adds and deletes a comment", async ({ page, request }) => {
  const id = await createTask(request, { title: "Water the basil" });

  await page.goto(`/tasks/${String(id)}`);
  await page.getByPlaceholder("Add a comment").fill("looking a bit droopy");
  await page.getByRole("button", { name: "Comment" }).click();

  await expect(page.getByText("looking a bit droopy")).toBeVisible();

  await page.getByRole("button", { name: "Delete comment" }).click();
  await expect(page.getByText("No comments yet.")).toBeVisible();
});

test("seeds a first completion from the last-done date", async ({ page }) => {
  await page.goto("/plants");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Title").fill("Fertilise ferns");
  await page.getByLabel(/Repeat every/).fill("30");
  await page.getByLabel("Last done (optional)").fill("2026-06-01");
  await page.getByRole("button", { name: "Create" }).click();

  await page.getByText("Fertilise ferns").click();
  await expect(
    page.getByRole("heading", { name: "Fertilise ferns" }),
  ).toBeVisible();
  await expect(page.getByText("e2e@stelplaats.test").first()).toBeVisible();
  await expect(page.getByText("Never completed yet.")).toBeHidden();
});

test("archives and restores a task via the archived section", async ({
  page,
  request,
}) => {
  await createTask(request, { title: "Wipe the skirting boards" });

  await page.goto("/cleaning");
  await page.getByText("Wipe the skirting boards").click();
  await page.getByRole("button", { name: "Archive task" }).click();
  await expect(page).toHaveURL(/\/cleaning$/);
  await expect(page.getByText("Wipe the skirting boards")).toBeHidden();

  await page.getByRole("button", { name: /Show archived/ }).click();
  await expect(page.getByText("Wipe the skirting boards")).toBeVisible();
  await page.getByRole("button", { name: "Unarchive" }).click();

  await expect(
    page.getByRole("button", { name: "Complete Wipe the skirting boards" }),
  ).toBeVisible();
});

test("creates and lists a house task", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "House" }).click();
  await expect(page).toHaveURL(/\/house$/);

  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Title").fill("Replace smoke alarm battery");
  await page.getByLabel(/Repeat every/).fill("180");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByText("Replace smoke alarm battery")).toBeVisible();
});

test("back button returns to the kind list", async ({ page, request }) => {
  const id = await createTask(request, { title: "Polish the taps" });

  await page.goto(`/tasks/${String(id)}`);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/cleaning$/);
});
