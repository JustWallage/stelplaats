import type { TaskKind } from "@shared/api";
import { TaskCard } from "@/components/TaskCard";
import { TaskForm } from "@/components/TaskForm";
import { useTaskEvents } from "@/context/WebSocketContext";
import { useTasks } from "@/hooks/useTasks";

const titles: Record<TaskKind, string> = {
  cleaning: "Cleaning",
  plants: "Plants",
};

export function TaskListPage({ kind }: { kind: TaskKind }) {
  const { data, loading, error, mutate } = useTasks();
  useTaskEvents(mutate);

  if (loading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (error !== null || data === undefined) {
    return <p className="text-destructive">Could not load tasks.</p>;
  }

  const tasks = data.tasks.filter((task) => task.kind === kind);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{titles[kind]}</h1>
        <TaskForm kind={kind} onCreated={mutate} />
      </div>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground">
          No tasks yet — add the first one.
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onChanged={mutate} />
          ))}
        </div>
      )}
    </div>
  );
}
