import {
  okSchema,
  pushConfigSchema,
  telegramLinkCodeSchema,
  telegramStatusSchema,
  type TelegramLinkCode,
} from "@shared/api";
import { useEffect, useState } from "react";
import { useUser } from "@/components/AuthGate";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { apiFetch, delInit } from "@/lib/api";
import {
  currentSubscription,
  disablePush,
  enablePush,
  notificationPermission,
  pushSupported,
} from "@/lib/push";
import { installAvailable, promptInstall, subscribeInstall } from "@/lib/pwa";
import { cn } from "@/lib/utils";

const postInit: RequestInit = { method: "POST" };

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches
  );
}

// The browser's menu path to install, since the one-tap prompt
// (beforeinstallprompt) is Chromium-only and only fires after an engagement
// heuristic — Firefox and a fresh Chrome session need the manual route.
function browserInstallItem(): string {
  return navigator.userAgent.includes("Firefox")
    ? "Install…"
    : "Add to Home screen (or Install app)";
}

// "Install app" — offers the one-tap prompt when the browser has handed us one,
// and ALWAYS shows the manual menu path as a fallback (Chrome has no auto
// pop-up, and Firefox never exposes a programmatic prompt at all).
function InstallCard() {
  const [available, setAvailable] = useState(installAvailable());
  const [standalone] = useState(isStandalone());

  useEffect(
    () =>
      subscribeInstall(() => {
        setAvailable(installAvailable());
      }),
    [],
  );

  const install = (): void => {
    void promptInstall();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install app</CardTitle>
        <CardDescription>
          Add Stelplaats to your home screen for a full-screen, app-like
          experience.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {standalone ? (
          <p className="text-muted-foreground">App is installed. 🎉</p>
        ) : (
          <>
            {available && <Button onClick={install}>Install app</Button>}
            <p className="text-sm text-muted-foreground">
              {available
                ? "No prompt? Install it from your browser instead: open the "
                : "Install it from your browser: open the "}
              browser menu (⋮) and tap{" "}
              <span className="font-medium">{browserInstallItem()}</span>.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

type TestState = "idle" | "sending" | "sent" | "error";

// A "send a test message" button with its own status, shared by the push and
// Telegram cards (both POST an endpoint that returns { ok: true }).
function TestSendButton({ path, label }: { path: string; label: string }) {
  const [test, setTest] = useState<TestState>("idle");
  const send = (): void => {
    setTest("sending");
    apiFetch(path, okSchema, postInit)
      .then(() => {
        setTest("sent");
      })
      .catch(() => {
        setTest("error");
      });
  };
  return (
    <>
      <Button variant="outline" onClick={send} disabled={test === "sending"}>
        {test === "sending" ? "Sending…" : label}
      </Button>
      {test === "sent" && <span className="text-muted-foreground">Sent.</span>}
      {test === "error" && (
        <span className="text-destructive">Could not send.</span>
      )}
    </>
  );
}

// Push notifications for THIS device: enable/disable the subscription and send a
// test. Notifications themselves (task due, completed by the other user) are
// pushed by the worker.
function NotificationsCard() {
  const { data } = useCachedFetch("/api/push", pushConfigSchema);
  const vapidKey = data?.vapidPublicKey ?? null;
  const supported = pushSupported();

  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [permission, setPermission] = useState(notificationPermission());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) {
      setSubscribed(false);
      return;
    }
    let active = true;
    currentSubscription()
      .then((subscription) => {
        if (active) {
          setSubscribed(subscription !== null);
        }
      })
      .catch(() => {
        if (active) {
          setSubscribed(false);
        }
      });
    return () => {
      active = false;
    };
  }, [supported]);

  const enable = (): void => {
    if (vapidKey === null) {
      return;
    }
    setBusy(true);
    enablePush(vapidKey)
      .then((ok) => {
        setPermission(notificationPermission());
        setSubscribed(ok);
      })
      .catch(() => {
        setSubscribed(false);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const disable = (): void => {
    setBusy(true);
    disablePush()
      .then(() => {
        setSubscribed(false);
      })
      .catch(() => {
        // Leave it enabled; the user can retry.
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Get a push notification when a task is due (07:00) and when the other
          person completes a task.
        </CardDescription>
      </CardHeader>
      {!supported ? (
        <CardContent>
          <p className="text-muted-foreground">
            This browser doesn’t support push notifications.
          </p>
        </CardContent>
      ) : vapidKey === null ? (
        <CardContent>
          <p className="text-muted-foreground">
            Push isn’t configured on the server yet.
          </p>
        </CardContent>
      ) : permission === "denied" ? (
        <CardContent>
          <p className="text-muted-foreground">
            Notifications are blocked for this site. Enable them in your
            browser’s site settings, then reload.
          </p>
        </CardContent>
      ) : subscribed === null ? (
        <CardContent>
          <p className="text-muted-foreground">Checking…</p>
        </CardContent>
      ) : subscribed ? (
        <>
          <CardContent>
            <p>Notifications are on for this device.</p>
          </CardContent>
          <CardFooter className="gap-3">
            <TestSendButton
              path="/api/push/test"
              label="Send test notification"
            />
            <Button
              variant="destructive"
              className="ml-auto"
              onClick={disable}
              disabled={busy}
            >
              {busy ? "Working…" : "Turn off"}
            </Button>
          </CardFooter>
        </>
      ) : (
        <CardContent>
          <Button onClick={enable} disabled={busy}>
            {busy ? "Enabling…" : "Enable notifications"}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

// The Telegram connection (moved verbatim from the former Telegram tab): an
// alternative 07:00 reminder channel, linked via a one-time code.
function TelegramCard() {
  const email = useUser();
  const { data, mutate } = useCachedFetch(
    "/api/telegram",
    telegramStatusSchema,
  );
  const [code, setCode] = useState<TelegramLinkCode | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const linked = data?.linked === true;
  const label = data?.chatLabel ?? null;

  const connect = (): void => {
    setPending(true);
    apiFetch("/api/telegram/link-code", telegramLinkCodeSchema, postInit)
      .then((next) => {
        setCode(next);
        setCopied(false);
      })
      .catch(() => {
        setCode(null);
      })
      .finally(() => {
        setPending(false);
      });
  };

  const disconnect = (): void => {
    setDisconnecting(true);
    apiFetch("/api/telegram", okSchema, delInit)
      .then(() => {
        setCode(null);
        mutate();
      })
      .catch(() => {
        // Disconnect failed — the chat stays linked; the user can retry.
      })
      .finally(() => {
        setDisconnecting(false);
      });
  };

  const copy = (): void => {
    if (code === null) {
      return;
    }
    navigator.clipboard
      .writeText(`/start ${code.code}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      })
      .catch(() => {
        // Clipboard denied — leave the button showing "Copy".
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>
          Link a Telegram chat to also receive the daily 07:00 reminder there.
        </CardDescription>
      </CardHeader>

      {linked ? (
        <>
          <CardContent className="space-y-1">
            <p>
              Connected to Telegram
              {label !== null && (
                <>
                  {" as "}
                  <span className="font-medium">{label}</span>
                </>
              )}
              .
            </p>
            <p className="text-muted-foreground">
              Reminders for {email} are delivered to this chat.
            </p>
          </CardContent>
          <CardFooter className="gap-3">
            <TestSendButton
              path="/api/telegram/test"
              label="Send test message"
            />
            <Button
              variant="destructive"
              className="ml-auto"
              onClick={() => {
                setConfirmDisconnect(true);
              }}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </CardFooter>
        </>
      ) : (
        <CardContent className="space-y-3">
          <p className="text-muted-foreground">
            Generate a connect link, open it, and your account links
            automatically.
          </p>

          {code === null ? (
            <Button onClick={connect} disabled={pending}>
              {pending ? "Generating…" : "Generate connect link"}
            </Button>
          ) : (
            <div className="space-y-4">
              {code.url !== null && (
                <div className="space-y-1.5">
                  <a
                    href={code.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "h-11 w-full text-base",
                    )}
                  >
                    Link my account
                  </a>
                  <p className="text-muted-foreground">
                    Opens Telegram and links your account automatically — that's
                    all you need.
                  </p>
                </div>
              )}

              <div className="space-y-2 border-t pt-3">
                <p className="text-sm text-muted-foreground">
                  {code.url !== null
                    ? "Prefer to do it by hand? Send this command to the bot instead:"
                    : "Send this command to the bot to connect:"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 text-sm">
                    /start {code.code}
                  </code>
                  <Button variant="outline" size="sm" onClick={copy}>
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  This code expires in 15 minutes.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={connect}
                  disabled={pending}
                >
                  {pending ? "Generating…" : "Generate a new link"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Telegram?"
        description="This chat will stop receiving reminders. You can reconnect any time."
        confirmLabel="Yes, disconnect"
        onConfirm={disconnect}
      />
    </Card>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Install the app and manage how you’re reminded about tasks.
        </p>
      </div>

      <InstallCard />
      <NotificationsCard />
      <TelegramCard />
    </div>
  );
}
