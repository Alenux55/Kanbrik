import { z } from "zod";
const id = z.string().min(1).max(200);
export const workflowDefinition = z
  .object({
    id,
    name: z.string().trim().min(1).max(80),
    completed: z.boolean(),
    archived: z.boolean(),
  })
  .strict();
export const workflowProposal = z
  .object({
    revision: z.number().int().min(1).max(2147483646),
    defaultStatusId: id,
    definitions: z.array(workflowDefinition).min(1).max(200),
    replacements: z.record(id, id),
  })
  .strict();
export const saveWorkflowInput = workflowProposal
  .extend({
    impactDigest: z.string().regex(/^[a-f0-9]{64}$/),
    requestKey: z.uuid(),
  })
  .strict();
export type StatusDefinition = {
  id: string;
  name: string;
  position: number;
  completed: boolean;
  revision: number;
  archivedAt: string | null;
};
export type WorkflowRecord = {
  revision: number;
  defaultStatusId: string;
  definitions: StatusDefinition[];
  owner: boolean;
};
export type WorkflowProposal = z.infer<typeof workflowProposal>;
export type WorkflowImpact = {
  impactDigest: string;
  revision: number;
  changed: boolean;
  activeTaskCount: number;
  subtaskCount: number;
  trashedTaskCount: number;
  reassignments: { from: string; to: string; count: number }[];
  completionChanges: {
    name: string;
    before: boolean;
    after: boolean;
    active: number;
    trashed: number;
  }[];
};
