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
};
export const emptyBoardFilters: BoardFilters = {
  projects: [],
  createdFrom: "",
  createdTo: "",
  editedFrom: "",
  editedTo: "",
  search: "",
  hideDone: false,
};
export function dateBounds(from: string, to: string, zone: string) {
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
    (!filters.projects.length ||
      filters.projects.includes(task.projectId ?? "standalone")) &&
    (!filters.hideDone || task.status !== "done") &&
    task.title
      .toLocaleLowerCase()
      .includes(filters.search.toLocaleLowerCase()) &&
    inRange(task.createdAt, created) &&
    inRange(task.updatedAt, edited)
  );
}
const colors = [
  "#ccfbf1",
  "#dbeafe",
  "#ede9fe",
  "#fef3c7",
  "#fce7f3",
  "#e0f2fe",
];
export function projectColor(id: string | null) {
  let hash = 0;
  for (const char of id ?? "")
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  return id ? colors[(hash >>> 0) % colors.length] : "#f5f5f5";
}
