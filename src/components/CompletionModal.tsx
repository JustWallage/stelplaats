import { taskWithStatusSchema } from "@shared/api";
import { KNOWN_USERS, displayName } from "@shared/users";
import { useEffect, useState } from "react";
import { useUser } from "@/components/AuthGate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, jsonInit } from "@/lib/api";
import { toDateTimeLocal } from "@/lib/format";

const nowLocal = (): string => toDateTimeLocal(new Date().toISOString());

async function completeTask(
  taskId: number,
  opts: { note: string | null; doneBy?: string; doneAt?: string },
): Promise<void> {
  await apiFetch(
    `/api/tasks/${String(taskId)}/complete`,
    taskWithStatusSchema,
    {
      ...jsonInit("POST", opts),
    },
  );
}

export function CompletionModal({
  taskId,
  title,
  archivesOnComplete = false,
  open,
  onOpenChange,
  onDone,
}: {
  taskId: number;
  title: string;
  archivesOnComplete?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const currentUser = useUser();
  const [note, setNote] = useState("");
  const [doneBy, setDoneBy] = useState(currentUser);
  const [doneAt, setDoneAt] = useState(nowLocal);
  const [busy, setBusy] = useState(false);

  // Default the timestamp to "now" each time the modal opens.
  useEffect(() => {
    if (open) {
      setDoneAt(nowLocal());
    }
  }, [open]);

  // The current user is always an option, plus the two known users. Picking the
  // current user sends no override (works even for non-known dev/e2e identities).
  const options = [
    currentUser,
    ...KNOWN_USERS.map((user) => user.email).filter(
      (email) => email !== currentUser,
    ),
  ];

  const handleSubmit = () => {
    setBusy(true);
    const opts: { note: string | null; doneBy?: string; doneAt?: string } = {
      note: note.trim() === "" ? null : note.trim(),
      doneAt: new Date(doneAt).toISOString(),
    };
    if (doneBy !== currentUser) {
      opts.doneBy = doneBy;
    }
    completeTask(taskId, opts)
      .then(() => {
        setNote("");
        setDoneBy(currentUser);
        setDoneAt(nowLocal());
        onOpenChange(false);
        onDone();
      })
      .catch(() => {
        setBusy(false);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Done: {title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="completion-user">Done by</Label>
            <Select
              value={doneBy}
              onValueChange={(value) => {
                setDoneBy(String(value));
              }}
            >
              <SelectTrigger id="completion-user" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((email) => (
                  <SelectItem key={email} value={email}>
                    {displayName(email)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="completion-when">When</Label>
            <Input
              id="completion-when"
              type="datetime-local"
              value={doneAt}
              onChange={(e) => {
                setDoneAt(e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="completion-note">Note (optional)</Label>
            <Textarea
              id="completion-note"
              placeholder="Anything worth remembering?"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </div>
          {archivesOnComplete && (
            <p className="text-sm text-muted-foreground">
              This is a one-off — completing it will archive the task.
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            Log it
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
