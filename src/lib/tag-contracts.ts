import { z } from "zod";
export const tagName = z.string().trim().min(1).max(60);
export const tagColorKey = z.enum([
  "teal",
  "blue",
  "violet",
  "amber",
  "pink",
  "sky",
]);
export const createTagInput = z
  .object({ name: tagName, color: tagColorKey, requestKey: z.uuid() })
  .strict();
export const editTagInput = z
  .object({
    name: tagName,
    color: tagColorKey,
    archived: z.boolean(),
    revision: z.number().int().positive(),
  })
  .strict();
export type TagRecord = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  revision: number;
  archivedAt: string | null;
};

export const tagRemovalPreviewInput = z
  .object({ revision: z.number().int().positive() })
  .strict();
export const tagRemovalReviewInput = z
  .object({ review: z.string().min(1).max(4096) })
  .strict();
export const tagRemovalInput = tagRemovalReviewInput
  .extend({ requestKey: z.uuid() })
  .strict();
export type TagUsageRow = {
  taskId: string;
  title: string;
  type: "Task" | "Subtask";
  projectId: string | null;
  project: string;
  parentId: string | null;
  parent: string;
  workspaceId: string;
  workspace: string;
  statusId: string;
  status: string;
  state: "Active" | "Trash";
  revision: number;
};
export type TagRemovalReport = {
  tagId: string;
  tagName: string;
  tagRevision: number;
  capturedAt: string;
  impactDigest: string;
  rows: TagUsageRow[];
  activeCount: number;
  trashCount: number;
};
export type TagRemovalPreview = TagRemovalReport & { review: string };
export type TagRemovalReceipt = {
  id: string;
  tagId: string;
  report: TagRemovalReport;
  removedAt: string;
};
