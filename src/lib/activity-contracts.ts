import { z } from "zod";
export type WorkKind = "project" | "task";
export type WorkTarget = { kind: WorkKind; id: string };
export const commentText = z.string().trim().min(1).max(10000);
export const createCommentInput = z
  .object({ text: commentText, requestKey: z.uuid() })
  .strict();
export const editCommentInput = z
  .object({
    text: commentText,
    revision: z.number().int().min(1).max(2147483646),
  })
  .strict();
export const activityPageInput = z
  .object({
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
export type CommentRecord = {
  id: string;
  text: string;
  revision: number;
  createdAt: string;
  editedAt: string | null;
  author: { name: string; available: boolean; isYou: boolean };
};
export type FieldChange = {
  field: string;
  label?: string;
  beforeLabel?: string;
  afterLabel?: string;
  before: string | null;
  after: string | null;
};
export type ActivityRecord = {
  id: string;
  occurredAt: string;
  action: string;
  actor: { name: string; available: boolean };
  workRevision: number | null;
  commentRevision: number | null;
  commentId: string | null;
  changes: FieldChange[];
  operationId: string | null;
  operationTitle: string | null;
  operationKind: string | null;
  cascade: boolean;
};
export type ActivityPage<T> = {
  items: T[];
  nextCursor: string | null;
  readOnly: boolean;
  availableSince: string;
  hasCreationEvent: boolean;
};
