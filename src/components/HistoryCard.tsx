import { taskWithStatusSchema, type Completion } from "@shared/api";
import { KNOWN_USERS, displayName } from "@shared/users";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { apiFetch, delInit, jsonInit } from "@/lib/api";
import { formatDateTime, toDateTimeLocal } from "@/lib/format";

export function HistoryCard({
  taskId,
  completion,
  onChanged,
}: {
  taskId: number;
  completion: Completion;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [doneBy, setDoneBy] = useState(completion.doneBy);
  const [doneAt, setDoneAt] = useState(toDateTimeLocal(completion.doneAt));
  const [note, setNote] = useState(completion.note ?? "");
  const [busy, setBusy] = useState(false);

  const userOptions = [
    completion.doneBy,
    ...KNOWN_USERS.map((user) => user.email).filter(
      (email) => email !== completion.doneBy,
    ),
  ];

  const base = `/api/tasks/${String(taskId)}/completions/${String(completion.id)}`;

  const handleSave = () => {
    setBusy(true);
    void apiFetch(base, taskWithStatusSchema, {
      ...jsonInit("PATCH", {
        doneBy: doneBy === completion.doneBy ? undefined : doneBy,
        doneAt: new Date(doneAt).toISOString(),
        note: note.trim() === "" ? null : note.trim(),
      }),
    })
      .then(() => {
        setEditing(false);
        onChanged();
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const handleDelete = () => {
    setBusy(true);
    void apiFetch(base, taskWithStatusSchema, delInit)
      .then(onChanged)
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-3">
        <div className="min-w-0 flex-1 text-sm">
          <div>
            <span className="font-medium">
              {displayName(completion.doneBy)}
            </span>{" "}
            <span className="text-muted-foreground">
              · {formatDateTime(completion.doneAt)}
            </span>
          </div>
          {completion.note !== null && (
            <p className="text-muted-foreground">“{completion.note}”</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Edit record"
            onClick={() => {
              setEditing(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Delete record"
            disabled={busy}
            onClick={handleDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit record</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleSave();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor={`edit-user-${String(completion.id)}`}>
                Done by
              </Label>
              <Select
                value={doneBy}
                onValueChange={(value) => {
                  setDoneBy(String(value));
                }}
              >
                <SelectTrigger
                  id={`edit-user-${String(completion.id)}`}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {userOptions.map((email) => (
                    <SelectItem key={email} value={email}>
                      {displayName(email)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-when-${String(completion.id)}`}>When</Label>
              <Input
                id={`edit-when-${String(completion.id)}`}
                type="datetime-local"
                value={doneAt}
                onChange={(e) => {
                  setDoneAt(e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-note-${String(completion.id)}`}>Note</Label>
              <Textarea
                id={`edit-note-${String(completion.id)}`}
                value={note}
                onChange={(e) => {
                  setNote(e.target.value);
                }}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
