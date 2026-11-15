import { z } from "zod";
import type { ProjectRecord, TaskRecord } from "./planning-contracts";
const id = z.string().min(1).max(200);
export const trashTargetInput = z
  .object({ kind: z.enum(["project", "task"]), id })
  .strict();
export const moveToTrashInput = trashTargetInput
  .extend({
    impactDigest: z.string().regex(/^[a-f0-9]{64}$/),
    requestKey: z.uuid(),
  })
  .strict();
export const restoreTrashInput = z
  .object({
    revision: z.number().int().min(1).max(2147483646),
    statusImpactDigest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    statusReplacements: z.record(id, id).optional(),
  })
  .strict();
export type TrashTarget = z.infer<typeof trashTargetInput>;
export type TrashMember = {
  kind: "project" | "task";
  id: string;
  revision: number;
  parentId?: string | null;
};
export type TrashImpact = TrashTarget & {
  title: string;
  impactDigest: string;
  projectCount: number;
  taskCount: number;
  subtaskCount: number;
  blockCount: number;
};
export type TrashBatchRecord = {
  id: string;
  workspaceId: string;
  rootKind: "project" | "task";
  rootId: string;
  rootTitle: string;
  revision: number;
  createdAt: string;
  restoredAt: string | null;
  projectCount: number;
  taskCount: number;
  subtaskCount: number;
};
export type TrashDetail = TrashBatchRecord & {
  projects: (ProjectRecord & {
    deletedAt: string | null;
    trashBatchId: string | null;
  })[];
  tasks: (TaskRecord & {
    deletedAt: string | null;
    trashBatchId: string | null;
  })[];
};

export type RestoreStatusResolution = {
  impactDigest: string;
  requirements: { statusId: string; name: string; count: number }[];
  choices: { id: string; name: string; completed: boolean }[];
};
