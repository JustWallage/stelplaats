import {
  okSchema,
  telegramLinkCodeSchema,
  telegramStatusSchema,
  type TelegramLinkCode,
} from "@shared/api";
import { useState } from "react";
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
import { cn } from "@/lib/utils";

const postInit: RequestInit = { method: "POST" };

export function TelegramPage() {
  const email = useUser();
  const { data, mutate } = useCachedFetch(
    "/api/telegram",
    telegramStatusSchema,
  );
  const [code, setCode] = useState<TelegramLinkCode | null>(null);
  const [pending, setPending] = useState(false);
  const [test, setTest] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
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

  const sendTest = (): void => {
    setTest("sending");
    apiFetch("/api/telegram/test", okSchema, postInit)
      .then(() => {
        setTest("sent");
      })
      .catch(() => {
        setTest("error");
      });
  };

  const disconnect = (): void => {
    setDisconnecting(true);
    apiFetch("/api/telegram", okSchema, delInit)
      .then(() => {
        setCode(null);
        setTest("idle");
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Telegram</h1>
        <p className="text-sm text-muted-foreground">
          Get a reminder at 07:00 when a task is due that day.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>
            Link a Telegram chat to receive daily reminders.
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
              <Button
                variant="outline"
                onClick={sendTest}
                disabled={test === "sending"}
              >
                {test === "sending" ? "Sending…" : "Send test message"}
              </Button>
              {test === "sent" && (
                <span className="text-muted-foreground">Sent.</span>
              )}
              {test === "error" && (
                <span className="text-destructive">Could not send.</span>
              )}
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
                      Opens Telegram and links your account automatically —
                      that's all you need.
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
      </Card>

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Telegram?"
        description="This chat will stop receiving reminders. You can reconnect any time."
        confirmLabel="Yes, disconnect"
        onConfirm={disconnect}
      />
    </div>
  );
}
