import { Hono } from "hono";
import type { AppEnv } from "../env";
import { timingSafeEqual } from "../lib/crypto";
import { getDb } from "../lib/db";
import { parseJsonBody } from "../lib/http";
import { getTelegramClient, updateSchema } from "../lib/telegram";
import { handleTelegramUpdate } from "../lib/telegram-bot";

export const telegramWebhookRoutes = new Hono<AppEnv>();

// Telegram delivers updates here. This path sits OUTSIDE /api (Telegram cannot
// present a Cloudflare Access identity) and is authenticated solely by the
// secret token registered with setWebhook; a missing/wrong secret fails closed.
telegramWebhookRoutes.post("/webhook", async (c) => {
  const secret = c.env.TELEGRAM_WEBHOOK_SECRET;
  const given = c.req.header("X-Telegram-Bot-Api-Secret-Token");
  if (
    secret === undefined ||
    secret === "" ||
    given === undefined ||
    !(await timingSafeEqual(secret, given))
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }
  const parsed = updateSchema.safeParse(await parseJsonBody(c.req.raw));
  // Acknowledge anything we can't parse so Telegram stops retrying it.
  if (!parsed.success) {
    return c.json({ ok: true });
  }
  const db = getDb(c.env);
  const result = await handleTelegramUpdate(db, parsed.data);
  if (result !== null) {
    await getTelegramClient(c.env).sendMessage(result.chatId, result.reply);
  }
  return c.json({ ok: true });
});
