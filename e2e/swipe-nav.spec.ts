import { expect, test } from "./fixtures";

test("all main pages are mounted side by side in the deck", async ({
  page,
}) => {
  await page.goto("/");
  const deck = page.getByTestId("swipe-deck");
  await expect(deck.locator("[data-deck-path]")).toHaveCount(4);
});

test("the nav snaps the deck to the chosen page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  const deck = page.getByTestId("swipe-deck");
  await expect
    .poll(() =>
      deck.evaluate((el) => Math.round(el.scrollLeft / el.clientWidth)),
    )
    .toBe(3);
});

test("side-scrolling the deck navigates without reloading", async ({
  page,
}) => {
  await page.goto("/");

  const deck = page.getByTestId("swipe-deck");
  await deck.evaluate((el) => {
    el.scrollTo({ left: el.clientWidth, behavior: "auto" });
  });

  await expect(page).toHaveURL(/\/tasks$/);
});
