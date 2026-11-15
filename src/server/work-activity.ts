import "server-only";
import type { Prisma, WorkComment } from "@/generated/prisma/client";
import type { z } from "zod";
import type {
  activityPageInput,
  createCommentInput,
  editCommentInput,
  WorkTarget,
} from "@/lib/activity-contracts";
import { workspaceContent, WorkspaceDenied } from "./workspaces";
import { activeProject, activeTask } from "./active-work";
import { actorName, targetWhere } from "./activity-events";
import { PlanningConflict, PlanningInputError } from "./planning";

async function targetState(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  target: WorkTarget,
) {
  const exists =
    target.kind === "project"
      ? await tx.project.findFirst({
          where: { workspaceId, id: target.id },
          select: { id: true },
        })
      : await tx.task.findFirst({
          where: { workspaceId, id: target.id },
          select: { id: true },
        });
  if (!exists)
    throw new WorkspaceDenied(
      404,
      "Work not found. Your draft is kept; check workspace Trash.",
    );
  const active =
    target.kind === "project"
      ? await tx.project.findFirst({
          where: { workspaceId, id: target.id, ...activeProject },
          select: { id: true },
        })
      : await tx.task.findFirst({
          where: { workspaceId, id: target.id, ...activeTask },
          select: { id: true },
        });
  return !active;
}
function record(comment: WorkComment, userId: string) {
  return {
    id: comment.id,
    text: comment.text,
    revision: comment.revision,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    author: {
      name: comment.authorName,
      available: !!comment.authorId,
      isYou: comment.authorId === userId,
    },
  };
}
type Page = z.infer<typeof activityPageInput>;
export function readActivity(
  headers: Headers,
  workspaceId: string,
  target: WorkTarget,
  input: Page,
  type: "comments" | "history",
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const readOnly = await targetState(tx, workspaceId, target);
    const boundary = await tx.activityBoundary.findUniqueOrThrow({
      where: { id: "work_activity" },
    });
    const hasCreationEvent = !!(await tx.workActivity.findUnique({
      where: {
        workspaceId_eventKey: {
          workspaceId,
          eventKey: `${target.kind}/${target.id}/work/1`,
        },
      },
      select: { id: true },
    }));
    const where = { workspaceId, ...targetWhere(target) };
    if (type === "comments") {
      const cursor = input.cursor
        ? await tx.workComment.findFirst({
            where: { ...where, id: input.cursor },
          })
        : null;
      if (input.cursor && !cursor)
        throw new WorkspaceDenied(
          404,
          "Comment cursor not found for this work.",
        );
      const rows = await tx.workComment.findMany({
        where: {
          ...where,
          ...(cursor
            ? {
                OR: [
                  { createdAt: { gt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: input.limit + 1,
      });
      const items = rows.slice(0, input.limit);
      return {
        items: items.map((row) => record(row, userId)),
        nextCursor: rows.length > input.limit ? items.at(-1)!.id : null,
        readOnly,
        availableSince: boundary.activatedAt,
        hasCreationEvent,
      };
    }
    const cursor = input.cursor
      ? await tx.workActivity.findFirst({
          where: { ...where, id: input.cursor },
        })
      : null;
    if (input.cursor && !cursor)
      throw new WorkspaceDenied(
        404,
        "Activity cursor not found for this work.",
      );
    const rows = await tx.workActivity.findMany({
      where: {
        ...where,
        ...(cursor
          ? {
              OR: [
                { occurredAt: { lt: cursor.occurredAt } },
                { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
    });
    const items = rows.slice(0, input.limit);
    return {
      items: items.map((row) => ({
        id: row.id,
        occurredAt: row.occurredAt,
        action: row.action,
        actor: { name: row.actorName, available: !!row.actorId },
        workRevision: row.workRevision,
        commentRevision: row.commentRevision,
        commentId: row.commentId,
        changes: row.changes,
        operationId: row.operationId,
        operationTitle: row.operationTitle,
        operationKind: row.operationKind,
        cascade: row.cascade,
      })),
      nextCursor: rows.length > input.limit ? items.at(-1)!.id : null,
      readOnly,
      availableSince: boundary.activatedAt,
      hasCreationEvent,
    };
  });
}
async function commentEvent(
  tx: Prisma.TransactionClient,
  userId: string,
  target: WorkTarget,
  saved: WorkComment,
  before: string | null,
) {
  await tx.workActivity.create({
    data: {
      workspaceId: saved.workspaceId,
      ...targetWhere(target),
      actorId: userId,
      actorName: await actorName(tx, userId),
      occurredAt: new Date(),
      eventKey: `comment/${saved.id}/${saved.revision}`,
      action: before === null ? "comment_created" : "comment_edited",
      commentId: saved.id,
      commentRevision: saved.revision,
      changes: [{ field: "text", before, after: saved.text }],
    },
  });
}
export function postComment(
  headers: Headers,
  workspaceId: string,
  target: WorkTarget,
  input: z.infer<typeof createCommentInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const readOnly = await targetState(tx, workspaceId, target);
    const prior = await tx.workComment.findUnique({
      where: {
        workspaceId_requestKey: { workspaceId, requestKey: input.requestKey },
      },
    });
    if (prior) {
      const refs = targetWhere(target);
      if (
        prior.authorId !== userId ||
        prior.projectId !== refs.projectId ||
        prior.taskId !== refs.taskId ||
        prior.createText !== input.text
      )
        throw new PlanningInputError(
          "That comment request key was already used. Reconcile the original input before posting another comment.",
        );
      return { comment: record(prior, userId), replayed: true, readOnly };
    }
    if (readOnly)
      throw new WorkspaceDenied(
        409,
        "Work is in Trash. Restore it before posting a new comment.",
      );
    const saved = await tx.workComment.create({
      data: {
        workspaceId,
        ...targetWhere(target),
        authorId: userId,
        authorName: await actorName(tx, userId),
        requestKey: input.requestKey,
        createText: input.text,
        text: input.text,
        createdAt: new Date(),
      },
    });
    await commentEvent(tx, userId, target, saved, null);
    return { comment: record(saved, userId), replayed: false, readOnly: false };
  });
}
export function changeComment(
  headers: Headers,
  workspaceId: string,
  target: WorkTarget,
  id: string,
  input: z.infer<typeof editCommentInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const readOnly = await targetState(tx, workspaceId, target);
    const current = await tx.workComment.findFirst({
      where: { workspaceId, ...targetWhere(target), id },
    });
    if (!current)
      throw new WorkspaceDenied(404, "Comment not found for this work.");
    if (current.authorId !== userId)
      throw new WorkspaceDenied(403, "Only the comment's author can edit it.");
    if (readOnly)
      throw new WorkspaceDenied(
        409,
        "Work is in Trash. Restore it before editing comments.",
      );
    if (current.revision !== input.revision)
      throw new PlanningConflict(record(current, userId));
    if (current.text === input.text)
      return { comment: record(current, userId), changed: false };
    const saved = await tx.workComment.update({
      where: { id, revision: input.revision },
      data: {
        text: input.text,
        editedAt: new Date(),
        revision: { increment: 1 },
      },
    });
    await commentEvent(tx, userId, target, saved, current.text);
    return { comment: record(saved, userId), changed: true };
  });
}
