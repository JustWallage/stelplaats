import type { APIRequestContext } from "@playwright/test";
import { telegramLinkCodeSchema, telegramStatusSchema } from "@shared/api";
import { e2eHeaders } from "../playwright.config";
import { expect, test } from "./fixtures";

// The e2e webhook secret: the committed default for the local/hermetic run, or
// the per-run value minted by CI for the internet-reachable ephemeral worker
// (see ephemeral-e2e.yml). Lets the suite drive the bot webhook to link/unlink a
// chat without a real Telegram round-trip.
const WEBHOOK_SECRET = process.env.E2E_WEBHOOK_SECRET ?? "e2e-webhook-secret";

// Links a chat to the test user the way production does: mint a code, then send
// the bot a `/start <code>` via the webhook. Returns the chat id (unique per
// test, so parallel runs don't collide on the chat_id index) and `@handle`.
async function linkChat(
  request: APIRequestContext,
): Promise<{ chatId: number; label: string }> {
  const chatId = Math.floor(Math.random() * 1_000_000_000);
  const username = `e2e_${String(chatId)}`;
  const minted = telegramLinkCodeSchema.parse(
    await (await request.post("/api/telegram/link-code")).json(),
  );
  const linked = await request.post("/telegram/webhook", {
    headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
    data: {
      message: {
        chat: { id: chatId, username },
        text: `/start ${minted.code}`,
      },
    },
  });
  expect(linked.status()).toBe(200);
  return { chatId, label: `@${username}` };
}

test("reveals a Telegram connect code with a copy button", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-write"]);
  await page.goto("/telegram");
  await expect(page.getByText(/Connected to Telegram/)).toBeHidden();

  await page.getByRole("button", { name: "Generate connect link" }).click();

  await expect(page.getByText(/\/start [0-9a-f]{16}/)).toBeVisible();
  await expect(page.getByText(/expires in 15 minutes/)).toBeVisible();

  const copy = page.getByRole("button", { name: "Copy" });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
});

test("shows the connected chat once linked", async ({ page, request }) => {
  const { label } = await linkChat(request);

  await page.goto("/telegram");
  await expect(
    page.getByText(`Connected to Telegram as ${label}.`),
  ).toBeVisible();
  await expect(
    page.getByText(`Reminders for ${e2eHeaders["X-Test-User-Email"]}`),
  ).toBeVisible();
});

test("disconnects Telegram after confirming", async ({ page, request }) => {
  const { label } = await linkChat(request);

  await page.goto("/telegram");
  await expect(
    page.getByText(`Connected to Telegram as ${label}.`),
  ).toBeVisible();

  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByText("Disconnect Telegram?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, disconnect" }).click();

  await expect(page.getByText(/Connected to Telegram/)).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Generate connect link" }),
  ).toBeVisible();
});

test("the /disconnect bot command unlinks the chat", async ({ request }) => {
  const { chatId } = await linkChat(request);

  const before = telegramStatusSchema.parse(
    await (await request.get("/api/telegram")).json(),
  );
  expect(before.linked).toBe(true);

  const res = await request.post("/telegram/webhook", {
    headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
    data: { message: { chat: { id: chatId }, text: "/disconnect" } },
  });
  expect(res.status()).toBe(200);

  const after = telegramStatusSchema.parse(
    await (await request.get("/api/telegram")).json(),
  );
  expect(after.linked).toBe(false);
});

test("refuses to link a chat already bound to another account (no 500)", async ({
  request,
}) => {
  const { chatId } = await linkChat(request);

  // A different account mints a fresh code; the SAME chat tries to use it.
  const bHeaders = {
    "X-Test-User-Email": "suusraedts2018@gmail.com",
    "X-Test-Auth": e2eHeaders["X-Test-Auth"],
  };
  const mintedB = telegramLinkCodeSchema.parse(
    await (
      await request.post("/api/telegram/link-code", { headers: bHeaders })
    ).json(),
  );
  const res = await request.post("/telegram/webhook", {
    headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
    data: { message: { chat: { id: chatId }, text: `/start ${mintedB.code}` } },
  });

  // The webhook acks gracefully rather than 500ing on the chat_id conflict, and
  // the second account is left unlinked.
  expect(res.status()).toBe(200);
  const statusB = telegramStatusSchema.parse(
    await (await request.get("/api/telegram", { headers: bHeaders })).json(),
  );
  expect(statusB.linked).toBe(false);
});
