import type { BlockRecord } from "./calendar-contracts";
import type { ProjectRecord, TaskRecord } from "./planning-contracts";
import { labelsActive, matchesLabels, type LabelFilter } from "./task-labels";
type Work = {
  id: string;
  kind: "project" | "task";
  title: string;
  context: string;
  searchContext: readonly string[];
  record: ProjectRecord | TaskRecord;
};
const projectMatches = (id: string | null, filter: LabelFilter) =>
  !filter.projects?.length || filter.projects.includes(id ?? "standalone");
const textMatches = (values: (string | undefined)[], filter: LabelFilter) => {
  const query = (filter.search ?? "").trim().toLowerCase();
  return !query || values.some((value) => value?.toLowerCase().includes(query));
};
export function matchesCalendarWork(item: Work, filter: LabelFilter) {
  const task = item.kind === "task" ? (item.record as TaskRecord) : null;
  return (
    projectMatches(task ? task.projectId : item.id, filter) &&
    (!labelsActive(filter) || (!!task && matchesLabels(task, filter))) &&
    textMatches(
      [item.title, item.record.description, ...item.searchContext],
      filter,
    )
  );
}
export function matchesCalendarBlock(block: BlockRecord, filter: LabelFilter) {
  return (
    projectMatches(block.task?.projectId ?? block.projectId, filter) &&
    (!labelsActive(filter) ||
      (!!block.task && matchesLabels(block.task, filter))) &&
    textMatches(
      [
        block.label,
        block.task?.title,
        block.task?.description,
        block.task?.projectTitle,
        block.task?.parentTitle,
        block.project?.title,
        block.project?.description,
      ],
      filter,
    )
  );
}
