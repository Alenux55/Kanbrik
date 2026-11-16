import type { ProjectRecord, TaskRecord } from "./planning-contracts";
import { dateBounds } from "./board-filters";
import { matchesLabels, type LabelFilter } from "./task-labels";

// Older account-memory filters had only tag fields. Add empty restrictions
// without replacing their identities, match mode, or any unrelated draft.
export function normalizeProjectsFilter(filter: LabelFilter): LabelFilter {
  return {
    ...filter,
    projects: filter.projects ?? [],
    search: filter.search ?? "",
    createdFrom: filter.createdFrom ?? "",
    createdTo: filter.createdTo ?? "",
    editedFrom: filter.editedFrom ?? "",
    editedTo: filter.editedTo ?? "",
  };
}

export function projectsFiltered(filter: LabelFilter) {
  return !!(
    filter.projects?.length ||
    filter.tagIds.length ||
    filter.search?.trim() ||
    filter.createdFrom ||
    filter.createdTo ||
    filter.editedFrom ||
    filter.editedTo
  );
}
export function taskDatesMatch(
  task: TaskRecord,
  filter: LabelFilter,
  zone: string,
) {
  const created = dateBounds(
    filter.createdFrom ?? "",
    filter.createdTo ?? "",
    zone,
  );
  const edited = dateBounds(
    filter.editedFrom ?? "",
    filter.editedTo ?? "",
    zone,
  );
  if (!created || !edited) return false;
  const within = (iso: string, range: NonNullable<typeof created>) =>
    (range.start === undefined || Date.parse(iso) >= range.start) &&
    (range.end === undefined || Date.parse(iso) < range.end);
  return within(task.createdAt, created) && within(task.updatedAt, edited);
}
export function matchesProjectsTask(
  task: TaskRecord,
  filter: LabelFilter,
  zone: string,
) {
  return (
    (!filter.projects?.length ||
      filter.projects.includes(task.projectId ?? "standalone")) &&
    matchesLabels(task, filter) &&
    taskDatesMatch(task, filter, zone) &&
    task.title
      .toLowerCase()
      .includes((filter.search ?? "").trim().toLowerCase())
  );
}
export function matchesProjectsProject(
  project: ProjectRecord,
  tasks: TaskRecord[],
  filter: LabelFilter,
  zone: string,
) {
  if (filter.projects?.length && !filter.projects.includes(project.id))
    return false;
  if (
    tasks.some(
      (task) =>
        task.projectId === project.id &&
        matchesProjectsTask(task, filter, zone),
    )
  )
    return true;
  const taskRestriction =
    filter.tagIds.length ||
    filter.createdFrom ||
    filter.createdTo ||
    filter.editedFrom ||
    filter.editedTo;
  return (
    !taskRestriction &&
    project.title
      .toLowerCase()
      .includes((filter.search ?? "").trim().toLowerCase())
  );
}
