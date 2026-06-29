import type { PushSubscriptionRow } from "../../db/schema";
import {
  pushPayloadSchema,
  type PushPayload,
  type TaskWithStatus,
} from "../../shared/api";
import { displayName } from "../../shared/users";
import type { Bindings } from "../env";
import type { Db } from "./db";
import {
  buildPushRequest,
  importVapidKeys,
  type VapidKeys,
} from "./push-crypto";
import {
  deletePushSubscription,
  loadAllSubscriptions,
  loadSubscriptionsExcept,
  loadSubscriptionsForUser,
} from "./push-subscriptions";
import { loadTasksDueToday } from "./tasks-query";

// "gone" => the push service says the subscription no longer exists (404/410),
// so the caller prunes it. The client is injected so tests record sends without
// touching the network (cf. TelegramClient).
export type PushResult = "ok" | "gone" | "error";

export interface PushSender {
  send(
    subscription: PushSubscriptionRow,
    payload: PushPayload,
  ): Promise<PushResult>;
}

const encoder = new TextEncoder();

function makeRealPushSender(keys: VapidKeys): PushSender {
  return {
    async send(subscription, payload) {
      try {
        const request = await buildPushRequest(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          encoder.encode(JSON.stringify(pushPayloadSchema.parse(payload))),
          keys,
          new Date(),
        );
        const res = await fetch(request.url, {
          method: "POST",
          headers: request.headers,
          body: request.body,
        });
        if (res.status === 404 || res.status === 410) {
          return "gone";
        }
        if (!res.ok) {
          console.warn(`[push] send failed (${res.status})`);
          return "error";
        }
        return "ok";
      } catch {
        return "error";
      }
    },
  };
}

const fakePushSender: PushSender = {
  send: (subscription) => {
    console.log(`[push] (fake) send to ${subscription.endpoint}`);
    return Promise.resolve("ok");
  },
};

// Real sender only when the full VAPID config is present (production); the no-op
// fake elsewhere, so no push ever leaves the worker in e2e/local and the routes
// + cron can still be exercised end to end.
export async function getPushSender(env: Bindings): Promise<PushSender> {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    return fakePushSender;
  }
  return makeRealPushSender(
    await importVapidKeys(publicKey, privateKey, subject),
  );
}

function dueTaskPayload(task: TaskWithStatus, appUrl: string): PushPayload {
  const location = task.location === null ? "" : ` — ${task.location}`;
  return {
    title: "⏰ Task due today",
    body: `${task.title}${location}`,
    url: appUrl,
    tag: `due-${task.id}`,
  };
}

function completedPayload(
  task: TaskWithStatus,
  actorEmail: string,
  appUrl: string,
): PushPayload {
  return {
    title: "✅ Task completed",
    body: `${displayName(actorEmail)} completed ${task.title}`,
    url: `${appUrl}/tasks/${task.id}`,
    tag: `completed-${task.id}`,
  };
}

// Send one payload to many subscriptions, pruning any the push service reports
// as gone. Best-effort: per-subscription failures never throw.
async function deliver(
  db: Db,
  sender: PushSender,
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload,
): Promise<void> {
  await Promise.all(
    subscriptions.map(async (subscription) => {
      const result = await sender.send(subscription, payload);
      if (result === "gone") {
        await deletePushSubscription(db, subscription.endpoint);
      }
    }),
  );
}

// The 07:00 push: ONE notification per task due today (so several arrive when
// several expire), to every subscribed device. Mirrors the Telegram reminder's
// timing but with a separate notification per task.
export async function sendDueTaskPushNotifications(
  db: Db,
  sender: PushSender,
  appUrl: string,
  now: Date,
): Promise<void> {
  const due = await loadTasksDueToday(db, now);
  if (due.length === 0) {
    return;
  }
  const subscriptions = await loadAllSubscriptions(db);
  if (subscriptions.length === 0) {
    return;
  }
  for (const task of due) {
    await deliver(db, sender, subscriptions, dueTaskPayload(task, appUrl));
  }
}

// Notify the OTHER user(s) — never the actor — that a task was completed.
export async function notifyTaskCompleted(
  db: Db,
  sender: PushSender,
  task: TaskWithStatus,
  actorEmail: string,
  appUrl: string,
): Promise<void> {
  const subscriptions = await loadSubscriptionsExcept(db, actorEmail);
  if (subscriptions.length === 0) {
    return;
  }
  await deliver(
    db,
    sender,
    subscriptions,
    completedPayload(task, actorEmail, appUrl),
  );
}

// The "send test notification" button: push only to the requester's own devices.
export async function sendTestPush(
  db: Db,
  sender: PushSender,
  userEmail: string,
  appUrl: string,
): Promise<number> {
  const subscriptions = await loadSubscriptionsForUser(db, userEmail);
  await deliver(db, sender, subscriptions, {
    title: "🔔 Stelplaats",
    body: "Test notification — push is working on this device.",
    url: appUrl,
    tag: "test",
  });
  return subscriptions.length;
}
