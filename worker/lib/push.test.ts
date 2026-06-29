import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { pushSubscriptions, tasks, type TaskRow } from "../../db/schema";
import { getDb } from "./db";
import {
  notifyTaskCompleted,
  sendDueTaskPushNotifications,
  sendTestPush,
  type PushResult,
  type PushSender,
} from "./push";
import { toTaskWithStatus } from "./serialize";

const db = getDb(env);

interface Sent {
  endpoint: string;
  title: string;
  body: string;
}

// A recording sender; `goneEndpoints` simulates the push service reporting a
// subscription as expired so the prune path can be asserted.
function recorder(goneEndpoints: string[] = []): {
  sender: PushSender;
  sent: Sent[];
} {
  const sent: Sent[] = [];
  return {
    sent,
    sender: {
      send(subscription, payload): Promise<PushResult> {
        if (goneEndpoints.includes(subscription.endpoint)) {
          return Promise.resolve("gone");
        }
        sent.push({
          endpoint: subscription.endpoint,
          title: payload.title,
          body: payload.body,
        });
        return Promise.resolve("ok");
      },
    },
  };
}

const isoToday = (now: Date): string => now.toISOString().slice(0, 10);
const noon = (date: string): Date => new Date(`${date}T12:00:00Z`);

async function subscribe(userEmail: string, endpoint: string): Promise<void> {
  await db.insert(pushSubscriptions).values({
    userEmail,
    endpoint,
    p256dh: "p",
    auth: "a",
    createdAt: new Date(),
  });
}

async function addDueOneOff(title: string, dueDate: string): Promise<TaskRow> {
  const rows = await db
    .insert(tasks)
    .values({
      title,
      kind: "cleaning",
      type: "one_off",
      location: "",
      description: null,
      dueDate: noon(dueDate),
      createdAt: new Date(),
    })
    .returning();
  const row = rows[0];
  if (row === undefined) {
    throw new Error("insert failed");
  }
  return row;
}

beforeEach(async () => {
  await db.delete(tasks);
  await db.delete(pushSubscriptions);
});

describe("sendDueTaskPushNotifications", () => {
  it("sends one notification per due task to every subscription", async () => {
    const now = new Date();
    await subscribe("just@wallage.nl", "https://push/just");
    await subscribe("suusraedts2018@gmail.com", "https://push/suus");
    await addDueOneOff("Water the ferns", isoToday(now));
    await addDueOneOff("Vacuum", isoToday(now));

    const { sender, sent } = recorder();
    await sendDueTaskPushNotifications(db, sender, "https://app.test", now);

    // 2 tasks * 2 devices = 4 notifications.
    expect(sent).toHaveLength(4);
    expect(sent.filter((s) => s.body.includes("Water the ferns"))).toHaveLength(
      2,
    );
    expect(sent.every((s) => s.title.includes("due today"))).toBe(true);
  });

  it("sends nothing when no task is due today", async () => {
    const now = new Date();
    await subscribe("just@wallage.nl", "https://push/just");
    await addDueOneOff(
      "Future",
      isoToday(new Date(now.getTime() + 5 * 86_400_000)),
    );

    const { sender, sent } = recorder();
    await sendDueTaskPushNotifications(db, sender, "https://app.test", now);
    expect(sent).toEqual([]);
  });

  it("sends nothing when there are no subscriptions", async () => {
    const now = new Date();
    await addDueOneOff("Due but no audience", isoToday(now));

    const { sender, sent } = recorder();
    await sendDueTaskPushNotifications(db, sender, "https://app.test", now);
    expect(sent).toEqual([]);
  });

  it("prunes a subscription the push service reports as gone", async () => {
    const now = new Date();
    await subscribe("just@wallage.nl", "https://push/gone");
    await subscribe("suusraedts2018@gmail.com", "https://push/live");
    await addDueOneOff("Water the ferns", isoToday(now));

    const { sender, sent } = recorder(["https://push/gone"]);
    await sendDueTaskPushNotifications(db, sender, "https://app.test", now);

    expect(sent.map((s) => s.endpoint)).toEqual(["https://push/live"]);
    const remaining = await db.select().from(pushSubscriptions);
    expect(remaining.map((r) => r.endpoint)).toEqual(["https://push/live"]);
  });
});

describe("notifyTaskCompleted", () => {
  it("notifies the other user, not the one who completed it", async () => {
    const now = new Date();
    await subscribe("just@wallage.nl", "https://push/just");
    await subscribe("suusraedts2018@gmail.com", "https://push/suus");
    const task = await addDueOneOff("Take out trash", isoToday(now));
    const payload = toTaskWithStatus(task, null, now);

    const { sender, sent } = recorder();
    await notifyTaskCompleted(
      db,
      sender,
      payload,
      "just@wallage.nl",
      "https://app.test",
    );

    expect(sent.map((s) => s.endpoint)).toEqual(["https://push/suus"]);
    expect(sent[0]?.body).toContain("Just completed");
    expect(sent[0]?.body).toContain("Take out trash");
  });

  it("sends nothing when only the actor is subscribed", async () => {
    const now = new Date();
    await subscribe("just@wallage.nl", "https://push/just");
    const task = await addDueOneOff("Solo", isoToday(now));
    const payload = toTaskWithStatus(task, null, now);

    const { sender, sent } = recorder();
    await notifyTaskCompleted(
      db,
      sender,
      payload,
      "just@wallage.nl",
      "https://app.test",
    );
    expect(sent).toEqual([]);
  });
});

describe("sendTestPush", () => {
  it("pushes only to the requester's own devices and returns the count", async () => {
    await subscribe("just@wallage.nl", "https://push/just-1");
    await subscribe("just@wallage.nl", "https://push/just-2");
    await subscribe("suusraedts2018@gmail.com", "https://push/suus");

    const { sender, sent } = recorder();
    const count = await sendTestPush(
      db,
      sender,
      "just@wallage.nl",
      "https://app.test",
    );

    expect(count).toBe(2);
    expect(sent.map((s) => s.endpoint).sort()).toEqual([
      "https://push/just-1",
      "https://push/just-2",
    ]);
  });
});
