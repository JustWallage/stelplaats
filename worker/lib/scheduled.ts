import type { Bindings } from "../env";
import { getDb, type Db } from "./db";
import { getPushSender, sendDueTaskPushNotifications } from "./push";
import { loadLinkedChatIds } from "./telegram-bot";
import { loadTasksDueToday } from "./tasks-query";
import {
  formatDueTasksMessage,
  getTelegramClient,
  type TelegramClient,
} from "./telegram";
import { isAmsterdamReminderHour } from "./time";

// Push the "due today" reminder to every linked chat. No-op (no message at all)
// when nothing is due, so a quiet day stays quiet. The client is injected so a
// recording fake can assert the sends in tests.
export async function sendDueTaskReminders(
  db: Db,
  telegram: TelegramClient,
  appUrl: string,
  now: Date,
): Promise<void> {
  const due = await loadTasksDueToday(db, now);
  if (due.length === 0) {
    return;
  }
  const chatIds = await loadLinkedChatIds(db);
  const message = formatDueTasksMessage(due, appUrl);
  await Promise.all(
    chatIds.map((chatId) => telegram.sendMessage(chatId, message)),
  );
}

// Cron entry. The trigger fires at 05:00 and 06:00 UTC; only the tick that is
// 07:00 in Amsterdam acts (DST guard), so the reminder lands at 07:00 local all
// year with a single daily send. Both channels fire: Telegram (one combined
// message per chat) and Web Push (one notification per due task per device).
export async function runDueTaskReminders(
  env: Bindings,
  now: Date,
): Promise<void> {
  if (!isAmsterdamReminderHour(now)) {
    return;
  }
  const db = getDb(env);
  await Promise.all([
    sendDueTaskReminders(db, getTelegramClient(env), env.APP_URL, now),
    sendDueTaskPushNotifications(
      db,
      await getPushSender(env),
      env.APP_URL,
      now,
    ),
  ]);
}
