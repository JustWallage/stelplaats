import { completionListSchema, taskWithStatusSchema } from "@shared/api";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { CommentSection } from "@/components/CommentSection";
import { CompletionModal } from "@/components/CompletionModal";
import { HistoryCard } from "@/components/HistoryCard";
import { DueStatusBadge } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTaskEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { useTasks } from "@/hooks/useTasks";
import { apiFetch, jsonInit } from "@/lib/api";

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
        <h1 className="text-2xl font-bold">{task.title}</h1>
        <p className="text-muted-foreground">
          {[
            task.location,
            task.intervalDays !== null
              ? `every ${String(task.intervalDays)} days`
              : "ad-hoc",
          ]
            .filter((part) => part !== null && part !== "")
            .join(" · ")}
        </p>
        {task.description !== null && (
          <p className="mt-2 whitespace-pre-wrap text-sm">{task.description}</p>
        )}
        <div className="mt-2">
          <DueStatusBadge task={task} />
        </div>
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
        open={logging}
        onOpenChange={setLogging}
        onDone={refresh}
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
