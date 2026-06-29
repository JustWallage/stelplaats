// PWA glue: register the service worker and capture the install prompt.
// `beforeinstallprompt` fires once, early (before the Settings page mounts), so
// it must be captured at startup and stashed for the "Install app" button.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isBeforeInstallPrompt(
  event: Event,
): event is BeforeInstallPromptEvent {
  return "prompt" in event && "userChoice" in event;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => {
    listener();
  });
}

/** Whether the browser has offered an install prompt we can replay. */
export function installAvailable(): boolean {
  return deferredPrompt !== null;
}

/** Subscribe to install-availability changes; returns an unsubscribe. */
export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replay the captured install prompt. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const prompt = deferredPrompt;
  if (prompt === null) {
    return false;
  }
  deferredPrompt = null;
  notify();
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === "accepted";
}

export function initPwa(): void {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failed; the app still works without push/install.
      });
    });
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = isBeforeInstallPrompt(event) ? event : null;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}
