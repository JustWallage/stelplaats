import { completionListSchema, taskWithStatusSchema } from "@shared/api";
import { displayName } from "@shared/users";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { CommentSection } from "@/components/CommentSection";
import { CompletionModal } from "@/components/CompletionModal";
import { HistoryCard } from "@/components/HistoryCard";
import { TaskForm } from "@/components/TaskForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTaskEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { useTasks } from "@/hooks/useTasks";
import { apiFetch, jsonInit } from "@/lib/api";
import { dueColor } from "@/lib/dueColor";
import { formatDueCountdown, formatRelative } from "@/lib/format";
import { taskTypeLabel } from "@/lib/taskType";

export function TaskDetailPage() {
  const params = useParams();
  const id = params.id ?? "";
  const navigate = useNavigate();
  const tasksState = useTasks();
  const history = useCachedFetch(
    `/api/tasks/${id}/completions`,
    completionListSchema,
  );
  const [logging, setLogging] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    tasksState.mutate();
    history.mutate();
  };
  useTaskEvents(refresh);

  const task = tasksState.data?.tasks.find((t) => String(t.id) === id);

  if (tasksState.loading || history.loading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (task === undefined) {
    return (
      <p className="text-destructive">Task not found (it may be archived).</p>
    );
  }

  const handleArchive = () => {
    setBusy(true);
    apiFetch(`/api/tasks/${id}`, taskWithStatusSchema, {
      ...jsonInit("PATCH", { archived: true }),
    })
      .then(() => navigate(`/${task.kind}`))
      .catch(refresh)
      .finally(() => {
        setBusy(false);
      });
  };

  const completions = history.data?.completions ?? [];
  const color = dueColor(task);
  const lastDone =
    task.lastCompletion === null
      ? "Never done"
      : `Last done ${formatRelative(task.lastCompletion.doneAt)} by ${displayName(task.lastCompletion.doneBy)}`;

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => {
          void navigate(`/${task.kind}`);
        }}
      >
        <ChevronLeft className="size-4" /> Back
      </Button>

      <div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{task.title}</h1>
          <TaskForm kind={task.kind} task={task} onSaved={refresh} />
        </div>
        <p className="text-muted-foreground">
          {[task.location, taskTypeLabel(task)]
            .filter((part) => part !== null && part !== "")
            .join(" · ")}
        </p>
        {task.description !== null && (
          <p className="mt-2 whitespace-pre-wrap text-sm">{task.description}</p>
        )}
        <p
          className="mt-3 text-xl font-semibold leading-tight"
          style={color !== null ? { color } : undefined}
        >
          {formatDueCountdown(task.due.status, task.due.dueAt)}
        </p>
        <p className="text-sm text-muted-foreground">{lastDone}</p>
      </div>

      <Button
        className="w-full"
        onClick={() => {
          setLogging(true);
        }}
      >
        I did this
      </Button>
      <CompletionModal
        taskId={task.id}
        title={task.title}
        archivesOnComplete={task.type === "one_off"}
        open={logging}
        onOpenChange={setLogging}
        onDone={() => {
          refresh();
          if (task.type === "one_off") {
            void navigate(`/${task.kind}`);
          }
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {completions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Never completed yet.
            </p>
          ) : (
            completions.map((completion) => (
              <HistoryCard
                key={completion.id}
                taskId={task.id}
                completion={completion}
                onChanged={refresh}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comments</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentSection taskId={id} />
        </CardContent>
      </Card>

      <Button
        variant="destructive"
        className="w-full"
        disabled={busy}
        onClick={handleArchive}
      >
        Archive task
      </Button>
    </div>
  );
}
