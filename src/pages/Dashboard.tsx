import type { TaskWithStatus } from "@shared/api";
import { TaskCard } from "@/components/TaskCard";
import { useTaskEvents } from "@/context/WebSocketContext";
import { useTasks } from "@/hooks/useTasks";

function Section({
  title,
  tasks,
  onChanged,
}: {
  title: string;
  tasks: TaskWithStatus[];
  onChanged: () => void;
}) {
  if (tasks.length === 0) {
    return null;
  }
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} onChanged={onChanged} />
      ))}
    </section>
  );
}

export function Dashboard() {
  const { data, loading, error, mutate } = useTasks();
  useTaskEvents(mutate);

  if (loading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (error !== null || data === undefined) {
    return <p className="text-destructive">Could not load tasks.</p>;
  }

  const overdue = data.tasks.filter((task) => task.due.status === "overdue");
  const due = data.tasks.filter((task) => task.due.status === "due");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Today</h1>
      {overdue.length === 0 && due.length === 0 ? (
        <p className="text-muted-foreground">
          All caught up — nothing is due. 🎉
        </p>
      ) : (
        <>
          <Section title="Overdue" tasks={overdue} onChanged={mutate} />
          <Section title="Due" tasks={due} onChanged={mutate} />
        </>
      )}
    </div>
  );
}
