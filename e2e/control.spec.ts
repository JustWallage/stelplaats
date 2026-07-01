import { expect, test } from "./fixtures";

const RUN = "**/api/hass/scripts/all_lights_off/run";

test("nav routes to the Control page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Control" }).click();
  await expect(page).toHaveURL(/\/control$/);
});

test("All lights off triggers the script and confirms", async ({ page }) => {
  await page.route(RUN, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );

  await page.goto("/control");
  await page.getByRole("button", { name: /all lights off/i }).click();

  await expect(page.getByText("Done.")).toBeVisible();
});

test("shows an error when Home Assistant is unreachable", async ({ page }) => {
  await page.route(RUN, (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "unreachable" }),
    }),
  );

  await page.goto("/control");
  await page.getByRole("button", { name: /all lights off/i }).click();

  await expect(page.getByText(/couldn't reach home assistant/i)).toBeVisible();
});
