import { type DueStatus, type TaskWithStatus } from "@shared/api";
import { displayName } from "@shared/users";
import { Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { CompletionModal } from "@/components/CompletionModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dueColor } from "@/lib/dueColor";
import { formatDate, formatRelative } from "@/lib/format";

const dueBadge: Record<
  DueStatus,
  {
    label: string;
    variant: "destructive" | "default" | "secondary" | "outline";
  }
> = {
  overdue: { label: "Overdue", variant: "destructive" },
  due: { label: "Due", variant: "default" },
  ok: { label: "OK", variant: "secondary" },
  adhoc: { label: "Ad-hoc", variant: "outline" },
};

export function DueStatusBadge({ task }: { task: TaskWithStatus }) {
  const badge = dueBadge[task.due.status];
  return (
    <Badge variant={badge.variant}>
      {badge.label}
      {task.due.status === "ok" && task.due.dueAt !== null
        ? ` · next ${formatDate(task.due.dueAt)}`
        : ""}
    </Badge>
  );
}

export function TaskCard({
  task,
  onChanged,
}: {
  task: TaskWithStatus;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const color = dueColor(task);

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
          <div className="truncate font-medium">{task.title}</div>
          <div className="truncate text-sm text-muted-foreground">
            {subtitle}
          </div>
          <div className="mt-1">
            <DueStatusBadge task={task} />
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
