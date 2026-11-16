import type { TagRecord } from "./tag-contracts";
export type LabelFilter = {
  tagIds: string[];
  tagScopes: Record<string, string>;
  matchAll: boolean;
  projects?: string[];
  search?: string;
  createdFrom?: string;
  createdTo?: string;
  editedFrom?: string;
  editedTo?: string;
};
export const emptyLabelFilter: LabelFilter = {
  tagIds: [],
  tagScopes: {},
  matchAll: false,
  projects: [],
  search: "",
};
export function labelsActive(filter: LabelFilter) {
  return filter.tagIds.length > 0;
}
export function matchesLabels(
  task: {
    workspaceId?: string;
    tags?: Pick<TagRecord, "id" | "workspaceId">[];
  },
  filter: LabelFilter,
) {
  if (!filter.tagIds.length) return true;
  const own = filter.tagIds.filter(
    (id) => filter.tagScopes[id] === task.workspaceId,
  );
  if (!own.length) return false;
  const have = new Set((task.tags ?? []).map((t) => t.id));
  return filter.matchAll
    ? own.every((id) => have.has(id))
    : own.some((id) => have.has(id));
}
