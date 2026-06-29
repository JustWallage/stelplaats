import { z } from "zod";
import type { TaskWithStatus } from "../../shared/api";
import { displayName } from "../../shared/users";
import type { Bindings } from "../env";

// The external dependency seam for sending Telegram messages (the Bot API in
// production, a no-op fake everywhere the bot token is unset — e2e/local).
export interface TelegramClient {
  sendMessage(chatId: number, text: string): Promise<void>;
}

function makeRealTelegramClient(token: string): TelegramClient {
  return {
    async sendMessage(chatId, text) {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        },
      );
      if (!res.ok) {
        console.warn(`[telegram] sendMessage failed (${res.status})`);
      }
    },
  };
}

const fakeTelegramClient: TelegramClient = {
  sendMessage: (chatId) => {
    console.log(`[telegram] (fake) sendMessage to ${chatId}`);
    return Promise.resolve();
  },
};

// Real client only when the bot token is set (production); the fake elsewhere,
// so no message ever leaves the worker in e2e/local and the webhook + cron can
// still be exercised end to end.
export function getTelegramClient(env: Bindings): TelegramClient {
  const token = env.TELEGRAM_BOT_TOKEN;
  return token === undefined || token === ""
    ? fakeTelegramClient
    : makeRealTelegramClient(token);
}

// Only the fields the bot reads from an incoming update; everything else (edits,
// callbacks, channel posts, …) is ignored.
export const updateSchema = z.object({
  message: z
    .object({
      chat: z.object({
        id: z.number(),
        username: z.string().optional(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
      }),
      text: z.string().optional(),
    })
    .optional(),
});
export type TelegramUpdate = z.infer<typeof updateSchema>;

// Escapes the chars that matter in Telegram HTML mode, including the double
// quote so an attacker-influenced value can't break out of an href="" attribute.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const KIND_LABEL: Record<TaskWithStatus["kind"], string> = {
  cleaning: "🧹",
  plants: "🪴",
  house: "🔧",
};

// One line per task: the emoji for its kind, the title, and the location in
// parentheses when set. `lastCompletion` names who last did it, for context.
function formatTask(task: TaskWithStatus): string {
  const head = `${KIND_LABEL[task.kind]} <b>${escapeHtml(task.title)}</b>`;
  const loc = task.location === null ? "" : ` — ${escapeHtml(task.location)}`;
  const who =
    task.lastCompletion === null
      ? ""
      : ` (last by ${escapeHtml(displayName(task.lastCompletion.doneBy))})`;
  return `${head}${loc}${who}`;
}

// The 07:00 reminder body: every task whose countdown reached zero today, one
// per line, then a link back to the app. Callers only send this when there is
// at least one due task, so the empty case is never rendered.
export function formatDueTasksMessage(
  tasks: TaskWithStatus[],
  appUrl: string,
): string {
  const lines = tasks.map(formatTask).join("\n");
  const footer = `\n\n<a href="${appUrl}">Open Stelplaats</a>`;
  const count = tasks.length === 1 ? "1 task is" : `${tasks.length} tasks are`;
  return `⏰ ${count} due today\n\n${lines}${footer}`;
}
