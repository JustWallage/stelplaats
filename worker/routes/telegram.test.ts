import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { telegram } from "../../db/schema";
import { telegramLinkCodeSchema, telegramStatusSchema } from "../../shared/api";
import { app } from "../index";
import { getDb } from "../lib/db";

const SECRET = "unit-webhook-secret";
const TOKEN = "unit-test-token";
const e2eEnv = { ...env, ENVIRONMENT: "e2e" };

const auth = (email: string) => ({
  "X-Test-User-Email": email,
  "X-Test-Auth": TOKEN,
});

async function status(email: string) {
  const res = await app.request(
    "/api/telegram",
    { headers: auth(email) },
    e2eEnv,
  );
  expect(res.status).toBe(200);
  return telegramStatusSchema.parse(await res.json());
}

async function mintCode(email: string): Promise<string> {
  const res = await app.request(
    "/api/telegram/link-code",
    { method: "POST", headers: auth(email) },
    e2eEnv,
  );
  expect(res.status).toBe(200);
  return telegramLinkCodeSchema.parse(await res.json()).code;
}

async function webhook(body: unknown, secret = SECRET): Promise<Response> {
  return app.request(
    "/telegram/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": secret,
      },
      body: JSON.stringify(body),
    },
    e2eEnv,
  );
}

beforeEach(async () => {
  await getDb(env).delete(telegram);
});

describe("telegram connect flow", () => {
  it("links a chat via /start and reports it connected", async () => {
    const email = "just@wallage.nl";
    expect((await status(email)).linked).toBe(false);

    const code = await mintCode(email);
    const res = await webhook({
      message: { chat: { id: 5001, username: "just" }, text: `/start ${code}` },
    });
    expect(res.status).toBe(200);

    const after = await status(email);
    expect(after.linked).toBe(true);
    expect(after.chatLabel).toBe("@just");
  });

  it("rejects the webhook without the secret token", async () => {
    const res = await webhook(
      { message: { chat: { id: 1 }, text: "/help" } },
      "wrong",
    );
    expect(res.status).toBe(403);
  });

  it("disconnects via DELETE /api/telegram", async () => {
    const email = "just@wallage.nl";
    const code = await mintCode(email);
    await webhook({ message: { chat: { id: 5002 }, text: `/start ${code}` } });
    expect((await status(email)).linked).toBe(true);

    const res = await app.request(
      "/api/telegram",
      { method: "DELETE", headers: auth(email) },
      e2eEnv,
    );
    expect(res.status).toBe(200);
    expect((await status(email)).linked).toBe(false);
  });

  it("test message 409s until a chat is linked", async () => {
    const res = await app.request(
      "/api/telegram/test",
      { method: "POST", headers: auth("just@wallage.nl") },
      e2eEnv,
    );
    expect(res.status).toBe(409);
  });

  it("refuses to bind a chat already linked to another account (no 500)", async () => {
    const userA = "just@wallage.nl";
    const userB = "suusraedts2018@gmail.com";
    const codeA = await mintCode(userA);
    await webhook({ message: { chat: { id: 5003 }, text: `/start ${codeA}` } });

    const codeB = await mintCode(userB);
    const res = await webhook({
      message: { chat: { id: 5003 }, text: `/start ${codeB}` },
    });
    expect(res.status).toBe(200);
    expect((await status(userB)).linked).toBe(false);
  });

  it("/disconnect bot command unlinks the chat", async () => {
    const email = "just@wallage.nl";
    const code = await mintCode(email);
    await webhook({ message: { chat: { id: 5004 }, text: `/start ${code}` } });
    expect((await status(email)).linked).toBe(true);

    await webhook({ message: { chat: { id: 5004 }, text: "/disconnect" } });
    expect((await status(email)).linked).toBe(false);
  });
});
