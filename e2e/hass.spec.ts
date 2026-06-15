import { expect, test } from "./fixtures";

const HASS_URL = "https://hass.justwallage.nl";

test("nav routes to the Home Assistant page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Hass" }).click();
  await expect(page).toHaveURL(/\/hass$/);
});

test("embeds the Home Assistant dashboard with a direct-open fallback", async ({
  page,
}) => {
  await page.goto("/hass");

  await expect(page.locator('iframe[title="Home Assistant"]')).toHaveAttribute(
    "src",
    HASS_URL,
  );
  await expect(
    page.getByRole("link", { name: /open directly/i }),
  ).toHaveAttribute("href", HASS_URL);
});
