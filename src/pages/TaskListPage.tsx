import {
  taskListSchema,
  taskWithStatusSchema,
  type TaskKind,
} from "@shared/api";
import { sortByDueSoonest } from "@shared/home";
import { useState } from "react";
import { TaskCard } from "@/components/TaskCard";
import { TaskForm } from "@/components/TaskForm";
import { Button } from "@/components/ui/button";
import { useTaskEvents } from "@/context/WebSocketContext";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { useTasks } from "@/hooks/useTasks";
import { apiFetch, jsonInit } from "@/lib/api";

type KindFilter = TaskKind | "all";

const FILTERS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "cleaning", label: "Cleaning" },
  { value: "plants", label: "Plants" },
  { value: "house", label: "House" },
];

const matchesFilter = (kind: TaskKind, filter: KindFilter): boolean =>
  filter === "all" || kind === filter;

function ArchivedSection({ filter }: { filter: KindFilter }) {
  const [open, setOpen] = useState(false);
  const archived = useCachedFetch("/api/tasks?archived=true", taskListSchema);
  const tasks = (archived.data?.tasks ?? []).filter((task) =>
    matchesFilter(task.kind, filter),
  );

  const unarchive = (id: number) => {
    void apiFetch(`/api/tasks/${String(id)}`, taskWithStatusSchema, {
      ...jsonInit("PATCH", { archived: false }),
    }).finally(() => {
      archived.mutate();
    });
  };

  return (
    <div className="pt-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setOpen((value) => !value);
          archived.mutate();
        }}
      >
        {open ? "Hide" : "Show"} archived ({tasks.length})
      </Button>
      {open && tasks.length > 0 && (
        <ul className="mt-2 space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <span className="truncate">{task.title}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  unarchive(task.id);
                }}
              >
                Unarchive
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TaskListPage() {
  const { data, loading, error, mutate } = useTasks();
  useTaskEvents(mutate);
  const [filter, setFilter] = useState<KindFilter>("all");

  if (loading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (error !== null || data === undefined) {
    return <p className="text-destructive">Could not load tasks.</p>;
  }

  const tasks = sortByDueSoonest(
    data.tasks.filter((task) => matchesFilter(task.kind, filter)),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <TaskForm
          defaultKind={filter === "all" ? undefined : filter}
          onSaved={mutate}
        />
      </div>
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filter by category"
      >
        {FILTERS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={filter === option.value ? "default" : "outline"}
            aria-pressed={filter === option.value}
            onClick={() => {
              setFilter(option.value);
            }}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground">No tasks here yet.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onChanged={mutate} />
          ))}
        </div>
      )}
      <ArchivedSection filter={filter} />
    </div>
  );
}
