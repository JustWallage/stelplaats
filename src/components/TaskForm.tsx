import { taskWithStatusSchema, type TaskKind } from "@shared/api";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, jsonInit } from "@/lib/api";

export function TaskForm({
  kind,
  onCreated,
}: {
  kind: TaskKind;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [intervalDays, setIntervalDays] = useState("");
  const [lastDone, setLastDone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle("");
    setLocation("");
    setDescription("");
    setIntervalDays("");
    setLastDone("");
  };

  const handleSubmit = () => {
    setBusy(true);
    setError(null);
    apiFetch("/api/tasks", taskWithStatusSchema, {
      ...jsonInit("POST", {
        title,
        kind,
        location: location.trim() === "" ? null : location,
        description: description.trim() === "" ? null : description,
        intervalDays: intervalDays === "" ? null : Number(intervalDays),
        lastDoneAt:
          lastDone === ""
            ? null
            : new Date(`${lastDone}T12:00:00Z`).toISOString(),
      }),
    })
      .then(() => {
        setOpen(false);
        reset();
        onCreated();
      })
      .catch(() => {
        setError("Could not create the task — check the fields.");
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" /> Add task
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {kind} task</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
              placeholder={
                kind === "plants" ? "Water monstera" : "Vacuum living room"
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-location">Location (optional)</Label>
            <Input
              id="task-location"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
              }}
              placeholder="Living room"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Description (optional)</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
              placeholder="How it's done, what to watch out for…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-interval">
              Repeat every … days (empty = ad-hoc)
            </Label>
            <Input
              id="task-interval"
              type="number"
              min={1}
              max={365}
              value={intervalDays}
              onChange={(e) => {
                setIntervalDays(e.target.value);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-last-done">Last done (optional)</Label>
            <Input
              id="task-last-done"
              type="date"
              value={lastDone}
              onChange={(e) => {
                setLastDone(e.target.value);
              }}
            />
          </div>
          {error !== null && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
