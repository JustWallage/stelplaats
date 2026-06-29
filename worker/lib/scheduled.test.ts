import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { tasks, telegram } from "../../db/schema";
import { getDb } from "./db";
import { sendDueTaskReminders } from "./scheduled";
import type { TelegramClient } from "./telegram";
import { isAmsterdamReminderHour } from "./time";

const db = getDb(env);

interface Sent {
  chatId: number;
  text: string;
}

function recorder(): { client: TelegramClient; sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    client: {
      sendMessage(chatId, text) {
        sent.push({ chatId, text });
        return Promise.resolve();
      },
    },
  };
}

const isoToday = (now: Date): string => now.toISOString().slice(0, 10);
const noon = (date: string): Date => new Date(`${date}T12:00:00Z`);

async function linkChat(userEmail: string, chatId: number): Promise<void> {
  await db.insert(telegram).values({ userEmail, chatId });
}

async function addOneOff(title: string, dueDate: string): Promise<void> {
  await db.insert(tasks).values({
    title,
    kind: "cleaning",
    type: "one_off",
    location: "",
    description: null,
    dueDate: noon(dueDate),
    createdAt: new Date(),
  });
}

beforeEach(async () => {
  await db.delete(tasks);
  await db.delete(telegram);
});

describe("isAmsterdamReminderHour", () => {
  it("is true for the 06:00 UTC tick in winter (CET, 07:00 local)", () => {
    expect(isAmsterdamReminderHour(new Date("2026-01-15T06:00:00Z"))).toBe(
      true,
    );
    expect(isAmsterdamReminderHour(new Date("2026-01-15T05:00:00Z"))).toBe(
      false,
    );
  });

  it("is true for the 05:00 UTC tick in summer (CEST, 07:00 local)", () => {
    expect(isAmsterdamReminderHour(new Date("2026-07-15T05:00:00Z"))).toBe(
      true,
    );
    expect(isAmsterdamReminderHour(new Date("2026-07-15T06:00:00Z"))).toBe(
      false,
    );
  });
});

describe("sendDueTaskReminders", () => {
  it("messages every linked chat once with the tasks due today", async () => {
    const now = new Date();
    await linkChat("just@wallage.nl", 111);
    await linkChat("suusraedts2018@gmail.com", 222);
    await addOneOff("Water the ferns", isoToday(now));

    const { client, sent } = recorder();
    await sendDueTaskReminders(db, client, "https://app.test", now);

    expect(sent.map((s) => s.chatId).sort()).toEqual([111, 222]);
    expect(sent[0]?.text).toContain("Water the ferns");
    expect(sent[0]?.text).toContain("due today");
    expect(sent[0]?.text).toContain("https://app.test");
  });

  it("sends nothing when no task is due today", async () => {
    const now = new Date();
    await linkChat("just@wallage.nl", 111);
    await addOneOff(
      "Future task",
      isoToday(new Date(now.getTime() + 5 * 86_400_000)),
    );

    const { client, sent } = recorder();
    await sendDueTaskReminders(db, client, "https://app.test", now);
    expect(sent).toEqual([]);
  });

  it("does not re-notify a task that is already overdue", async () => {
    const now = new Date();
    await linkChat("just@wallage.nl", 111);
    await addOneOff(
      "Late task",
      isoToday(new Date(now.getTime() - 3 * 86_400_000)),
    );

    const { client, sent } = recorder();
    await sendDueTaskReminders(db, client, "https://app.test", now);
    expect(sent).toEqual([]);
  });

  it("sends nothing when no chat is linked even if a task is due", async () => {
    const now = new Date();
    await addOneOff("Due but no audience", isoToday(now));

    const { client, sent } = recorder();
    await sendDueTaskReminders(db, client, "https://app.test", now);
    expect(sent).toEqual([]);
  });
});
