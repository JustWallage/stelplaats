import { eq, isNotNull } from "drizzle-orm";
import { telegram, type TelegramRow } from "../../db/schema";
import type { TelegramStatus } from "../../shared/api";
import botCommands from "./bot-commands.json";
import type { Db } from "./db";
import type { TelegramUpdate } from "./telegram";

const LINK_CODE_TTL_MS = 15 * 60 * 1000;

// The identifying bits of a Telegram chat, captured at link time so the app can
// show which chat is connected.
interface ChatIdentity {
  id: number;
  username: string | null;
  name: string | null;
}

// Derived from bot-commands.json — the same list registered with Telegram for
// autocomplete (see the deploy workflow), so in-chat help can never drift.
const HELP = [
  "Commands:",
  ...botCommands.commands.map((c) => `/${c.command} — ${c.description}`),
].join("\n");

const GREETING =
  "Welcome! To connect this chat, open the app's Telegram page, tap " +
  "Generate connect link, and send me /start <code>.";

const NOT_LINKED =
  "This chat is not linked yet. Open the app's Telegram page, tap " +
  "Generate connect link, and send me /start <code>.";

// A friendly label for a connected chat: "@handle" if it has a username, else
// the stored display name, else null.
function chatLabel(row: TelegramRow): string | null {
  if (row.chatUsername !== null) {
    return `@${row.chatUsername}`;
  }
  return row.chatName;
}

// 8 random bytes (16 hex chars, 64 bits): guessing a pending code within its
// 15-min window would link an attacker's chat to a victim's account, so the
// keyspace is kept large rather than relying only on Telegram's send rate limit.
function generateLinkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadByEmail(
  db: Db,
  userEmail: string,
): Promise<TelegramRow | null> {
  const rows = await db
    .select()
    .from(telegram)
    .where(eq(telegram.userEmail, userEmail))
    .limit(1);
  return rows[0] ?? null;
}

async function loadByChat(db: Db, chatId: number): Promise<TelegramRow | null> {
  const rows = await db
    .select()
    .from(telegram)
    .where(eq(telegram.chatId, chatId))
    .limit(1);
  return rows[0] ?? null;
}

export async function loadTelegramStatus(
  db: Db,
  userEmail: string,
): Promise<TelegramStatus> {
  const row = await loadByEmail(db, userEmail);
  return {
    linked: row?.chatId != null,
    chatLabel: row?.chatId == null ? null : chatLabel(row),
  };
}

/** The Telegram chat id bound to the user, or null when not linked. */
export async function loadChatId(
  db: Db,
  userEmail: string,
): Promise<number | null> {
  return (await loadByEmail(db, userEmail))?.chatId ?? null;
}

/** Every linked chat id, the recipients of the daily reminder. */
export async function loadLinkedChatIds(db: Db): Promise<number[]> {
  const rows = await db
    .select({ chatId: telegram.chatId })
    .from(telegram)
    .where(isNotNull(telegram.chatId));
  return rows.flatMap((row) => (row.chatId === null ? [] : [row.chatId]));
}

// Drop the chat link entirely (chat binding + pending code) so the account is
// back to unlinked. Idempotent: a no-op when nothing is linked.
export async function disconnectTelegram(
  db: Db,
  userEmail: string,
): Promise<void> {
  await db.delete(telegram).where(eq(telegram.userEmail, userEmail));
}

export async function mintLinkCode(
  db: Db,
  userEmail: string,
  now: Date,
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateLinkCode();
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
  await db
    .insert(telegram)
    .values({ userEmail, linkCode: code, linkCodeExpiresAt: expiresAt })
    .onConflictDoUpdate({
      target: telegram.userEmail,
      set: { linkCode: code, linkCodeExpiresAt: expiresAt },
    });
  return { code, expiresAt };
}

async function handleStart(
  db: Db,
  chat: ChatIdentity,
  code: string,
): Promise<string> {
  if (code === "") {
    return GREETING;
  }
  const rows = await db
    .select()
    .from(telegram)
    .where(eq(telegram.linkCode, code))
    .limit(1);
  const row = rows[0];
  if (
    row?.linkCodeExpiresAt == null ||
    row.linkCodeExpiresAt.getTime() < Date.now()
  ) {
    return "That code is invalid or expired. Generate a fresh one in the app.";
  }
  // chatId is unique: binding a chat already linked to a DIFFERENT account would
  // violate the index and throw (→ webhook 500 → Telegram retries). Refuse with a
  // clear message instead. Re-linking the SAME account to its own chat is fine.
  const existing = await loadByChat(db, chat.id);
  if (existing !== null && existing.userEmail !== row.userEmail) {
    return (
      "This Telegram chat is already linked to another account. " +
      "Send /disconnect here first, then use a fresh code."
    );
  }
  await db
    .update(telegram)
    .set({
      chatId: chat.id,
      chatUsername: chat.username,
      chatName: chat.name,
      linkCode: null,
      linkCodeExpiresAt: null,
    })
    .where(eq(telegram.userEmail, row.userEmail));
  return `✅ Linked! I'll send a reminder here at 07:00 when a task is due.\n\n${HELP}`;
}

export interface TelegramReply {
  chatId: number;
  reply: string;
}

// Resolves an incoming update to the reply to send back, applying any side
// effects (linking, disconnecting). Returns null for updates the bot ignores
// (non-message, non-command). Pure with respect to Telegram itself — the caller
// sends the reply — so it is straightforward to unit-test.
export async function handleTelegramUpdate(
  db: Db,
  update: TelegramUpdate,
): Promise<TelegramReply | null> {
  const message = update.message;
  if (message === undefined) {
    return null;
  }
  const text = message.text?.trim() ?? "";
  if (!text.startsWith("/")) {
    return null;
  }
  const { id: chatId } = message.chat;
  const name = [message.chat.first_name, message.chat.last_name].filter(
    (part): part is string => part !== undefined && part !== "",
  );
  const chat: ChatIdentity = {
    id: chatId,
    username: message.chat.username ?? null,
    name: name.length > 0 ? name.join(" ") : null,
  };
  const [command, ...rest] = text.split(/\s+/);
  const arg = rest.join(" ").trim();

  if (command === "/start") {
    return { chatId, reply: await handleStart(db, chat, arg) };
  }

  const row = await loadByChat(db, chatId);
  if (row === null) {
    return { chatId, reply: NOT_LINKED };
  }

  switch (command) {
    case "/user":
      return { chatId, reply: `Connected account: ${row.userEmail}` };
    case "/disconnect":
      await disconnectTelegram(db, row.userEmail);
      return {
        chatId,
        reply:
          "✅ Disconnected. This chat will no longer receive reminders. " +
          "Reconnect any time from the app's Telegram page.",
      };
    case "/help":
      return { chatId, reply: HELP };
    default:
      return { chatId, reply: HELP };
  }
}
