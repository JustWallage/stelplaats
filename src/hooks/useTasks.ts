import { taskListSchema, type TaskList } from "@shared/api";
import { useCachedFetch, type CachedFetch } from "./useCachedFetch";

export function useTasks(): CachedFetch<TaskList> {
  return useCachedFetch("/api/tasks", taskListSchema);
}
