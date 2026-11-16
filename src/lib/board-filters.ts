import { projectPalette } from "./project-palette";
import { matchesLabels } from "./task-labels";
import { DateTime } from "luxon";
import type { TaskRecord } from "./planning-contracts";
export type BoardFilters = {
  projects: string[];
  createdFrom: string;
  createdTo: string;
  editedFrom: string;
  editedTo: string;
  search: string;
  hideDone: boolean;
  tagIds: string[];
  tagScopes: Record<string, string>;
  matchAll: boolean;
};
export const emptyBoardFilters: BoardFilters = {
  projects: [],
  createdFrom: "",
  createdTo: "",
  editedFrom: "",
  editedTo: "",
  search: "",
  hideDone: false,
  tagIds: [],
  tagScopes: {},
  matchAll: false,
};
export function dateBounds(from: string, to: string, zone: string) {
  if (
    (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) ||
    (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))
  )
    return null;
  const start = from ? DateTime.fromISO(from, { zone }).startOf("day") : null;
  const end = to
    ? DateTime.fromISO(to, { zone }).plus({ days: 1 }).startOf("day")
    : null;
  if (
    (start && !start.isValid) ||
    (end && !end.isValid) ||
    (start && end && start >= end)
  )
    return null;
  return { start: start?.toMillis(), end: end?.toMillis() };
}
export function matchesBoard(
  task: TaskRecord,
  filters: BoardFilters,
  zone: string,
) {
  const created = dateBounds(filters.createdFrom, filters.createdTo, zone),
    edited = dateBounds(filters.editedFrom, filters.editedTo, zone);
  if (!created || !edited) return false;
  const inRange = (
    iso: string,
    range: NonNullable<ReturnType<typeof dateBounds>>,
  ) =>
    (range.start === undefined || Date.parse(iso) >= range.start) &&
    (range.end === undefined || Date.parse(iso) < range.end);
  return (
    matchesLabels(task, filters) &&
    (!filters.projects.length ||
      filters.projects.includes(task.projectId ?? "standalone")) &&
    (!filters.hideDone || task.completed !== true) &&
    task.title
      .toLocaleLowerCase()
      .includes(filters.search.toLocaleLowerCase()) &&
    inRange(task.createdAt, created) &&
    inRange(task.updatedAt, edited)
  );
}
const colors = projectPalette.map((c) => c.color);
export function projectColor(id: string | null) {
  let hash = 0;
  for (const char of id ?? "")
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return id ? colors[(hash >>> 0) % colors.length] : "#f5f5f5";
}
