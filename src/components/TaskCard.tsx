import { type TaskWithStatus } from "@shared/api";
import { displayName } from "@shared/users";
import { Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { CompletionModal } from "@/components/CompletionModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dueColor } from "@/lib/dueColor";
import { formatDueCountdown, formatRelative } from "@/lib/format";

export function TaskCard({
  task,
  onChanged,
}: {
  task: TaskWithStatus;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const color = dueColor(task);
  const countdown = formatDueCountdown(task.due.status, task.due.dueAt);

  const subtitle = [
    task.location,
    task.lastCompletion === null
      ? "never done"
      : `${displayName(task.lastCompletion.doneBy)} · ${formatRelative(task.lastCompletion.doneAt)}`,
  ]
    .filter((part) => part !== null && part !== "")
    .join(" · ");

  return (
    <Card
      className={color !== null ? "border-l-4" : undefined}
      style={color !== null ? { borderLeftColor: color } : undefined}
    >
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <Link to={`/tasks/${String(task.id)}`} className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold leading-tight">
            {task.title}
          </div>
          <div
            className="truncate font-medium"
            style={color !== null ? { color } : undefined}
          >
            {countdown}
          </div>
          <div className="truncate text-sm text-muted-foreground">
            {subtitle}
          </div>
        </Link>
        <Button
          size="icon"
          aria-label={`Complete ${task.title}`}
          onClick={() => {
            setOpen(true);
          }}
        >
          <Check className="size-5" />
        </Button>
      </CardContent>
      <CompletionModal
        taskId={task.id}
        title={task.title}
        open={open}
        onOpenChange={setOpen}
        onDone={onChanged}
      />
    </Card>
  );
}
