import { Hono } from "hono";
import { telegramLinkCodeSchema, telegramStatusSchema } from "../../shared/api";
import type { AppEnv } from "../env";
import { getDb } from "../lib/db";
import { getTelegramClient } from "../lib/telegram";
import {
  disconnectTelegram,
  loadChatId,
  loadTelegramStatus,
  mintLinkCode,
} from "../lib/telegram-bot";

export const telegramRoutes = new Hono<AppEnv>();

// Whether a chat is linked to the signed-in user.
telegramRoutes.get("/", async (c) => {
  const db = getDb(c.env);
  const status = await loadTelegramStatus(db, c.get("userEmail"));
  return c.json(telegramStatusSchema.parse(status));
});

// Unlink the connected chat (the "Disconnect" button). Idempotent — returns ok
// even when no chat is linked.
telegramRoutes.delete("/", async (c) => {
  const db = getDb(c.env);
  await disconnectTelegram(db, c.get("userEmail"));
  return c.json({ ok: true });
});

// Mint a one-time code (15-min expiry) for the user to send the bot as
// `/start <code>`; only the signed-in owner can reach this (behind auth).
telegramRoutes.post("/link-code", async (c) => {
  const db = getDb(c.env);
  const { code, expiresAt } = await mintLinkCode(
    db,
    c.get("userEmail"),
    new Date(),
  );
  const username = c.env.TELEGRAM_BOT_USERNAME;
  const url = username === "" ? null : `https://t.me/${username}?start=${code}`;
  return c.json(
    telegramLinkCodeSchema.parse({
      code,
      url,
      expiresAt: expiresAt.toISOString(),
    }),
  );
});

// Send a test message to the connected chat (the "Send test message" button).
telegramRoutes.post("/test", async (c) => {
  const db = getDb(c.env);
  const chatId = await loadChatId(db, c.get("userEmail"));
  if (chatId === null) {
    return c.json({ error: "Telegram is not connected" }, 409);
  }
  await getTelegramClient(c.env).sendMessage(
    chatId,
    "✅ Test message from your Stelplaats bot.",
  );
  return c.json({ ok: true });
});
