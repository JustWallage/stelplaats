import { okSchema } from "@shared/api";
import { apiFetch, jsonInit } from "@/lib/api";

// Web Push subscription management on the client. The worker exposes the VAPID
// public key (GET /api/push); we subscribe via the service worker's PushManager
// and register the resulting endpoint server-side.

export function pushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function notificationPermission():
  | NotificationPermission
  | "unsupported" {
  return "Notification" in window ? Notification.permission : "unsupported";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready;
}

/** The current device's push subscription, or null if not subscribed. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) {
    return null;
  }
  const registration = await readyRegistration();
  return registration.pushManager.getSubscription();
}

// Turn a PushSubscription into the request body the worker validates
// (pushSubscriptionInputSchema). toJSON() yields { endpoint, keys: {...} } but
// every field is optional in the DOM type, so each is checked explicitly.
function toSubscribeBody(subscription: PushSubscription): {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (
    json.endpoint === undefined ||
    p256dh === undefined ||
    auth === undefined
  ) {
    throw new Error("Incomplete push subscription");
  }
  return { endpoint: json.endpoint, keys: { p256dh, auth } };
}

/**
 * Ask for notification permission and subscribe this device. Returns true once
 * registered server-side; false if the user denied permission.
 */
export async function enablePush(vapidPublicKey: string): Promise<boolean> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return false;
  }
  const registration = await readyRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));
  await apiFetch(
    "/api/push/subscribe",
    okSchema,
    jsonInit("POST", toSubscribeBody(subscription)),
  );
  return true;
}

/** Unsubscribe this device and drop it server-side. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (subscription === null) {
    return;
  }
  await apiFetch(
    "/api/push/unsubscribe",
    okSchema,
    jsonInit("POST", { endpoint: subscription.endpoint }),
  );
  await subscription.unsubscribe();
}
