export const taskStatusIds = ["backlog", "todo", "in_progress", "blocked", "done"] as const;
export type TaskStatus = typeof taskStatusIds[number];
export const taskStatusLabels: Record<TaskStatus, string> = {
  backlog: "Backlog", todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done",
};
export function taskCompleted(status: TaskStatus) { return status === "done"; }
