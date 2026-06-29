// Stelplaats service worker: PWA installability + Web Push notifications.
// Plain JS, served from the site root as a static asset (not bundled), so its
// scope is "/". Authored by hand — kept minimal and exempt from the app lint.
/* global self, clients */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A pass-through fetch handler is part of the Android install criteria.
self.addEventListener("fetch", () => {});

// Payloads match shared/api.ts pushPayloadSchema: { title, body, url, tag }.
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (_err) {
      data = {};
    }
  }
  const title = data.title || "Stelplaats";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/" },
    }),
  );
});

// Tapping a notification focuses an existing tab (navigating it to the target)
// or opens a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              client.navigate(target);
            }
            return undefined;
          }
        }
        return clients.openWindow(target);
      }),
  );
});
