import {
  taskWithStatusSchema,
  type DueStatus,
  type TaskWithStatus,
} from "@shared/api";
import { Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, jsonInit } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

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
        ? ` · next ${task.due.dueAt}`
        : ""}
    </Badge>
  );
}

export async function completeTask(
  taskId: number,
  note: string | null,
): Promise<void> {
  await apiFetch(
    `/api/tasks/${String(taskId)}/complete`,
    taskWithStatusSchema,
    {
      ...jsonInit("POST", { note }),
    },
  );
}

export function TaskCard({
  task,
  onChanged,
}: {
  task: TaskWithStatus;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleComplete = () => {
    setBusy(true);
    completeTask(task.id, null)
      .then(onChanged)
      .catch(onChanged)
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <Link to={`/tasks/${String(task.id)}`} className="min-w-0 flex-1">
          <div className="truncate font-medium">{task.title}</div>
          <div className="truncate text-sm text-muted-foreground">
            {task.location}
            {task.lastCompletion === null
              ? " · never done"
              : ` · last ${formatDateTime(task.lastCompletion.doneAt)}`}
          </div>
          <div className="mt-1">
            <DueStatusBadge task={task} />
          </div>
        </Link>
        <Button
          size="icon"
          aria-label={`Complete ${task.title}`}
          disabled={busy}
          onClick={handleComplete}
        >
          <Check className="size-5" />
        </Button>
      </CardContent>
    </Card>
  );
}
