import { expect, test } from "./fixtures";

const HASS_URL = "https://hass.justwallage.nl";

test("Control page opens the Home Assistant view", async ({ page }) => {
  await page.goto("/control");
  await page.getByRole("button", { name: /open home assistant/i }).click();
  await expect(page).toHaveURL(/\/hass$/);
});

test("back button returns from Home Assistant to Control", async ({ page }) => {
  await page.goto("/hass");
  await page.getByRole("button", { name: /back/i }).click();
  await expect(page).toHaveURL(/\/control$/);
});

test("embeds the Home Assistant dashboard", async ({ page }) => {
  await page.goto("/hass");

  await expect(page.locator('iframe[title="Home Assistant"]')).toHaveAttribute(
    "src",
    HASS_URL,
  );
});
