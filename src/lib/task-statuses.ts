export const taskStatusIds = [
  "backlog",
  "todo",
  "in_progress",
  "blocked",
  "done",
] as const;
export type TaskStatus = string;
export const taskStatusLabels: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};
// Legacy keys/labels remain only for seeded defaults and pre-workflow history.
export function statusName(task: { status: string; statusName?: string }) {
  return (
    task.statusName ?? taskStatusLabels[task.status] ?? "Unavailable status"
  );
}
export function taskCompleted(task: { completed?: boolean }) {
  return task.completed === true;
}
