import {
  taskWithStatusSchema,
  type TaskKind,
  type TaskType,
  type TaskWithStatus,
} from "@shared/api";
import { Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
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

const TYPE_OPTIONS: { value: TaskType; label: string; hint: string }[] = [
  {
    value: "scheduled",
    label: "Scheduled",
    hint: "Repeats on a fixed schedule — set the interval in days.",
  },
  {
    value: "as_needed",
    label: "As needed",
    hint: "Repeats whenever; no due date.",
  },
  {
    value: "one_off",
    label: "One-off",
    hint: "Done once, then archived. An optional target date is allowed.",
  },
];

const dateToIso = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toISOString();

export function TaskForm({
  kind,
  task,
  onSaved,
}: {
  kind: TaskKind;
  task?: TaskWithStatus;
  onSaved: () => void;
}) {
  const isEdit = task !== undefined;
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TaskType | "">("");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [intervalDays, setIntervalDays] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lastDone, setLastDone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setType(task?.type ?? "");
    setTitle(task?.title ?? "");
    setLocation(task?.location ?? "");
    setDescription(task?.description ?? "");
    setIntervalDays(
      task?.intervalDays == null ? "" : String(task.intervalDays),
    );
    setDueDate(task?.dueDate ?? "");
    setLastDone("");
  }, [open, task]);

  const buildBody = (chosen: TaskType): unknown => {
    const base = {
      title,
      kind,
      location: location.trim() === "" ? null : location,
      description: description.trim() === "" ? null : description,
    };
    const lastDoneAt = lastDone === "" ? null : dateToIso(lastDone);
    if (chosen === "scheduled") {
      const fields = {
        ...base,
        type: chosen,
        intervalDays: Number(intervalDays),
      };
      return isEdit ? fields : { ...fields, lastDoneAt };
    }
    if (chosen === "as_needed") {
      return isEdit
        ? { ...base, type: chosen }
        : { ...base, type: chosen, lastDoneAt };
    }
    return { ...base, type: chosen, dueDate: dueDate === "" ? null : dueDate };
  };

  const handleSubmit = () => {
    if (type === "") {
      return;
    }
    setBusy(true);
    setError(null);
    apiFetch(
      isEdit ? `/api/tasks/${String(task.id)}` : "/api/tasks",
      taskWithStatusSchema,
      { ...jsonInit(isEdit ? "PATCH" : "POST", buildBody(type)) },
    )
      .then(() => {
        setOpen(false);
        onSaved();
      })
      .catch(() => {
        setError(
          isEdit
            ? "Could not save the task — check the fields."
            : "Could not create the task — check the fields.",
        );
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={isEdit ? "outline" : "default"} />}
      >
        {isEdit ? (
          <>
            <Pencil className="size-4" /> Edit
          </>
        ) : (
          <>
            <Plus className="size-4" /> Add task
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : `New ${kind} task`}</DialogTitle>
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
            <Label>Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={type === option.value ? "default" : "outline"}
                  onClick={() => {
                    setType(option.value);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {type === ""
                ? "Choose a task type."
                : TYPE_OPTIONS.find((option) => option.value === type)?.hint}
            </p>
          </div>

          {type === "scheduled" && (
            <div className="space-y-2">
              <Label htmlFor="task-interval">Days in between</Label>
              <Input
                id="task-interval"
                type="number"
                min={1}
                max={365}
                value={intervalDays}
                onChange={(e) => {
                  setIntervalDays(e.target.value);
                }}
                required
              />
            </div>
          )}
          {type === "one_off" && (
            <div className="space-y-2">
              <Label htmlFor="task-due">Target date (optional)</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                }}
              />
            </div>
          )}
          {!isEdit && (type === "scheduled" || type === "as_needed") && (
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
          )}

          {error !== null && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={busy || type === ""}
          >
            {isEdit ? "Save" : "Create"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
