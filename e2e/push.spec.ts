import { pushConfigSchema } from "@shared/api";
import { expect, test } from "./fixtures";

const subscription = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "BPp256dhExampleKey", auth: "authSecretExample" },
});

test("the Settings page shows install, notifications and telegram", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Install app", { exact: true })).toBeVisible();
  await expect(page.getByText("Notifications", { exact: true })).toBeVisible();
  await expect(page.getByText("Telegram", { exact: true })).toBeVisible();
  // The notification controls' exact state (enable button vs. "Checking…")
  // depends on service-worker readiness, which is environment-dependent in
  // headless CI; assert the always-rendered card copy instead.
  await expect(
    page.getByText(/Get a push notification when a task is due/),
  ).toBeVisible();
});

test("exposes a VAPID public key for subscribing", async ({ request }) => {
  const config = pushConfigSchema.parse(
    await (await request.get("/api/push")).json(),
  );
  expect(config.vapidPublicKey).not.toBeNull();
});

test("subscribe, test and unsubscribe a device over the API", async ({
  request,
}) => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/e2e-device";

  const subscribed = await request.post("/api/push/subscribe", {
    data: subscription(endpoint),
  });
  expect(subscribed.status()).toBe(200);

  // The push sender is the no-op fake in e2e (no VAPID private key), so a test
  // send succeeds without anything leaving the worker.
  const tested = await request.post("/api/push/test", { data: {} });
  expect(tested.status()).toBe(200);

  const unsubscribed = await request.post("/api/push/unsubscribe", {
    data: { endpoint },
  });
  expect(unsubscribed.status()).toBe(200);

  // With the device removed, a test send has no audience.
  const afterRemoval = await request.post("/api/push/test", { data: {} });
  expect(afterRemoval.status()).toBe(409);
});
