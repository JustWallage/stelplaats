import { completionListSchema, taskWithStatusSchema } from "@shared/api";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { DueStatusBadge, completeTask } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useTaskEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { useTasks } from "@/hooks/useTasks";
import { apiFetch, jsonInit } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export function TaskDetailPage() {
  const params = useParams();
  const id = params.id ?? "";
  const navigate = useNavigate();
  const tasksState = useTasks();
  const history = useCachedFetch(
    `/api/tasks/${id}/completions`,
    completionListSchema,
  );
  const [note, setNote] = useState("");
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

  const handleComplete = () => {
    setBusy(true);
    completeTask(task.id, note.trim() === "" ? null : note.trim())
      .then(() => {
        setNote("");
        refresh();
      })
      .catch(refresh)
      .finally(() => {
        setBusy(false);
      });
  };

  const handleArchive = () => {
    setBusy(true);
    apiFetch(`/api/tasks/${id}`, taskWithStatusSchema, {
      ...jsonInit("PATCH", { archived: true }),
    })
      .then(() => navigate(-1))
      .catch(refresh)
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{task.title}</h1>
        <p className="text-muted-foreground">
          {task.location}
          {task.intervalDays !== null
            ? ` · every ${String(task.intervalDays)} days`
            : " · ad-hoc"}
        </p>
        <div className="mt-2">
          <DueStatusBadge task={task} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mark as done</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Optional note"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
          />
          <Button className="w-full" disabled={busy} onClick={handleComplete}>
            Done
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {history.data === undefined ||
          history.data.completions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Never completed yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.data.completions.map((completion) => (
                <li
                  key={completion.id}
                  className="border-b pb-2 text-sm last:border-b-0"
                >
                  <span className="font-medium">
                    {formatDateTime(completion.doneAt)}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    by {completion.doneBy}
                  </span>
                  {completion.note !== null && (
                    <p className="text-muted-foreground">“{completion.note}”</p>
                  )}
                </li>
              ))}
            </ul>
          )}
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
