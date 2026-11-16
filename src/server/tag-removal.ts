import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type {
  TagRemovalReceipt,
  TagUsageRow,
  tagRemovalInput,
} from "@/lib/tag-contracts";
import { tagUsageCSV } from "@/lib/tag-usage-csv";
import { workspaceContent, WorkspaceDenied } from "./workspaces";
import { PlanningConflict, PlanningInputError } from "./planning-errors";
import {
  configurationEvent,
  digest,
  fieldChanges,
  intent,
  remember,
} from "./extension-support";
import { actorName } from "./activity-events";
import { serverConfig } from "./config";

// One bounded transaction: never page/continue a mutation over an unreviewed set.
export const TAG_REMOVAL_LIMIT = 500;
const BATCH_MEMBER_LIMIT = 10000;
const memberSchema = z.array(
  z
    .object({
      kind: z.enum(["project", "task"]),
      id: z.string(),
      revision: z.number().int().positive(),
      parentId: z.string().nullable().optional(),
    })
    .strict(),
);
const reviewSchema = z
  .object({
    version: z.literal(1),
    workspaceId: z.string(),
    tagId: z.string(),
    actorId: z.string(),
    impactDigest: z.string().regex(/^[a-f0-9]{64}$/),
    capturedAt: z.iso.datetime(),
  })
  .strict();
type Review = z.infer<typeof reviewSchema>;
function signature(body: string) {
  return createHmac("sha256", serverConfig().secret)
    .update("kanbrik/tag-removal/v1\n" + body)
    .digest();
}
function sign(review: Review) {
  const body = Buffer.from(JSON.stringify(review)).toString("base64url");
  return body + "." + signature(body).toString("base64url");
}
function verify(
  token: string,
  workspaceId: string,
  tagId: string,
  actorId: string,
) {
  const [body, mac, ...rest] = token.split(".");
  if (!body || !mac || rest.length)
    throw new PlanningInputError("Review this tag's removal impact first.");
  const supplied = Buffer.from(mac, "base64url"),
    expected = signature(body);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw new PlanningInputError(
      "The removal review is invalid. Review the impact again.",
    );
  const parsed = reviewSchema.safeParse(
    JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
  );
  if (
    !parsed.success ||
    parsed.data.workspaceId !== workspaceId ||
    parsed.data.tagId !== tagId ||
    parsed.data.actorId !== actorId
  )
    throw new PlanningInputError(
      "The removal review belongs to a different account, workspace or tag.",
    );
  return parsed.data;
}
async function impact(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  tagId: string,
) {
  const tag = await tx.workspaceTag.findFirst({
    where: { workspaceId, id: tagId },
  });
  if (!tag) throw new WorkspaceDenied(404, "Tag unavailable.");
  const tasks = await tx.task.findMany({
    where: { workspaceId, tagLinks: { some: { tagId } } },
    take: TAG_REMOVAL_LIMIT + 1,
    orderBy: { id: "asc" },
    include: {
      project: true,
      parent: true,
      workflowStatus: true,
      tagLinks: { include: { tag: true } },
    },
  });
  if (tasks.length > TAG_REMOVAL_LIMIT)
    throw new PlanningInputError(
      `This tag affects more than ${TAG_REMOVAL_LIMIT} tasks. Atomic removal is unavailable; nothing changed. Reduce its usage through ordinary reviewed task edits first.`,
    );
  for (const task of tasks)
    task.tagLinks.sort((a, b) => a.tagId.localeCompare(b.tagId));
  const workspace = await tx.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
  });
  const batchIds = [
    ...new Set(tasks.filter((t) => t.deletedAt).map((t) => t.trashBatchId)),
  ];
  if (batchIds.includes(null))
    throw new PlanningInputError(
      "A trashed task has no recoverable batch. Nothing changed; administrator review is required.",
    );
  const batches = await tx.trashBatch.findMany({
    where: { workspaceId, id: { in: batchIds as string[] } },
    orderBy: { id: "asc" },
  });
  if (batches.length !== batchIds.length)
    throw new PlanningInputError(
      "A Trash batch is unavailable. Nothing changed.",
    );
  let total = 0;
  const validated = [];
  for (const batch of batches) {
    const parsed = memberSchema.safeParse(batch.members);
    if (!parsed.success || batch.restoredAt)
      throw new PlanningInputError(
        "A Trash batch cannot be reconciled. Nothing changed.",
      );
    const members = parsed.data;
    total += members.length;
    if (total > BATCH_MEMBER_LIMIT)
      throw new PlanningInputError(
        `Affected Trash batches exceed ${BATCH_MEMBER_LIMIT} members. Atomic removal is unavailable; nothing changed.`,
      );
    const projects = await tx.project.findMany({
      where: { workspaceId, trashBatchId: batch.id },
      take: BATCH_MEMBER_LIMIT + 1,
      select: { id: true, revision: true, deletedAt: true },
    });
    const children = await tx.task.findMany({
      where: { workspaceId, trashBatchId: batch.id },
      take: BATCH_MEMBER_LIMIT + 1,
      select: { id: true, revision: true, parentId: true, deletedAt: true },
    });
    const actual = [
      ...projects.map((p) => ({ ...p, kind: "project" })),
      ...children.map((t) => ({ ...t, kind: "task" })),
    ];
    const identities = new Set(members.map((m) => m.kind + "/" + m.id)),
      actualById = new Map(actual.map((a) => [a.kind + "/" + a.id, a]));
    if (
      identities.size !== members.length ||
      actual.length !== members.length ||
      members.some((m) => {
        const a = actualById.get(m.kind + "/" + m.id);
        return (
          !a ||
          !a.deletedAt ||
          a.revision !== m.revision ||
          (m.kind === "task" &&
            (!("parentId" in a) || (m.parentId ?? null) !== a.parentId))
        );
      })
    )
      throw new PlanningInputError(
        "A Trash batch's exact members changed. Nothing changed; refresh Trash or request administrator review.",
      );
    validated.push({ batch, members });
  }
  const rows: TagUsageRow[] = tasks.map((t) => ({
    taskId: t.id,
    title: t.title,
    type: t.parentId ? "Subtask" : "Task",
    projectId: t.projectId,
    project: t.project?.title ?? "",
    parentId: t.parentId,
    parent: t.parent?.title ?? "",
    workspaceId,
    workspace: workspace.name,
    statusId: t.status,
    status: t.workflowStatus.name,
    state: t.deletedAt ? "Trash" : "Active",
    revision: t.revision,
  }));
  const impactDigest = digest({
    workspaceId,
    workspace: workspace.name,
    tag: {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      revision: tag.revision,
      archivedAt: tag.archivedAt?.toISOString() ?? null,
    },
    rows,
    tasks: tasks.map((t) => ({
      id: t.id,
      tagIds: t.tagLinks.map((l) => l.tagId).sort(),
      projectRevision: t.project?.revision,
      parentRevision: t.parent?.revision,
    })),
    batches: validated.map(({ batch, members }) => ({
      id: batch.id,
      revision: batch.revision,
      members,
    })),
  });
  return {
    tag,
    tasks,
    validated,
    report: {
      tagId: tag.id,
      tagName: tag.name,
      tagRevision: tag.revision,
      impactDigest,
      rows,
      activeCount: rows.filter((r) => r.state === "Active").length,
      trashCount: rows.filter((r) => r.state === "Trash").length,
    },
  };
}
export function previewTagRemoval(
  headers: Headers,
  workspaceId: string,
  tagId: string,
  revision: number,
) {
  return workspaceContent(headers, workspaceId, async (tx, actorId) => {
    const current = await impact(tx, workspaceId, tagId);
    if (current.tag.revision !== revision)
      throw new PlanningConflict(current.tag);
    if (current.tag.archivedAt && !current.tasks.length)
      throw new PlanningInputError(
        "This definition is already archived. Restore it to assign it again; prior removal reports remain available.",
      );
    const capturedAt = new Date().toISOString();
    return {
      ...current.report,
      capturedAt,
      review: sign({
        version: 1,
        workspaceId,
        tagId,
        actorId,
        capturedAt,
        impactDigest: current.report.impactDigest,
      }),
    };
  });
}
export function exportTagReview(
  headers: Headers,
  workspaceId: string,
  tagId: string,
  review: string,
) {
  return workspaceContent(headers, workspaceId, async (tx, actorId) => {
    const claims = verify(review, workspaceId, tagId, actorId),
      current = await impact(tx, workspaceId, tagId);
    if (current.report.impactDigest !== claims.impactDigest)
      throw new PlanningConflict({ reviewRequired: true });
    return tagUsageCSV({ ...current.report, capturedAt: claims.capturedAt });
  });
}
export function removeTag(
  headers: Headers,
  workspaceId: string,
  tagId: string,
  input: z.infer<typeof tagRemovalInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const payload = { tagId, ...input };
    // Receipt lookup precedes all lifecycle/revision checks, so later changes cannot
    // reapply an old removal or erase a deliberate reattachment after restoration.
    const prior = await intent(
      tx,
      workspaceId,
      userId,
      input.requestKey,
      "tag_remove",
      payload,
    );
    if (prior) return { receipt: prior as TagRemovalReceipt, replayed: true };
    const review = verify(input.review, workspaceId, tagId, userId),
      current = await impact(tx, workspaceId, tagId);
    if (current.report.impactDigest !== review.impactDigest)
      throw new PlanningConflict({ reviewRequired: true });
    if (current.tag.archivedAt && !current.tasks.length)
      throw new PlanningInputError("This definition is already archived.");
    const removedAt = new Date(),
      name = await actorName(tx, userId);
    const ids = current.tasks.map((t) => t.id);
    const detached = await tx.taskTag.deleteMany({
      where: { workspaceId, tagId, taskId: { in: ids } },
    });
    const changed = await tx.task.updateMany({
      where: { workspaceId, id: { in: ids } },
      data: { revision: { increment: 1 } },
    });
    if (detached.count !== ids.length || changed.count !== ids.length)
      throw new PlanningConflict({ reviewRequired: true });
    // One event per real tag-set change, preserving original ID and label snapshots.
    await tx.workActivity.createMany({
      data: current.tasks.map((t) => ({
        workspaceId,
        taskId: t.id,
        actorId: userId,
        actorName: name,
        occurredAt: removedAt,
        eventKey: `task/${t.id}/work/${t.revision + 1}`,
        action: "tag_removed",
        workRevision: t.revision + 1,
        operationId: input.requestKey,
        operationTitle: current.tag.name,
        operationKind: "tag",
        changes: [
          {
            field: "tags",
            before: JSON.stringify(t.tagLinks.map((l) => l.tagId).sort()),
            after: JSON.stringify(
              t.tagLinks
                .filter((l) => l.tagId !== tagId)
                .map((l) => l.tagId)
                .sort(),
            ),
            beforeLabel: t.tagLinks.map((l) => l.tag.name).join(", ") || "None",
            afterLabel:
              t.tagLinks
                .filter((l) => l.tagId !== tagId)
                .map((l) => l.tag.name)
                .join(", ") || "None",
          },
        ],
      })),
    });
    const affected = new Set(ids);
    for (const { batch, members } of current.validated)
      await tx.trashBatch.update({
        where: { workspaceId_id: { workspaceId, id: batch.id } },
        data: {
          members: members.map((m) =>
            m.kind === "task" && affected.has(m.id)
              ? { ...m, revision: m.revision + 1 }
              : m,
          ),
          revision: { increment: 1 },
        },
      });
    const tag = await tx.workspaceTag.update({
      where: { id: tagId },
      data: {
        archivedAt: current.tag.archivedAt ?? removedAt,
        revision: { increment: 1 },
      },
    });
    await configurationEvent(
      tx,
      workspaceId,
      userId,
      "tag_removed",
      tagId,
      tag.revision,
      [
        ...fieldChanges(
          { archived: !!current.tag.archivedAt },
          { archived: true },
          ["archived"],
        ),
        ...(ids.length
          ? [
              {
                field: "assignments",
                before: String(ids.length),
                after: "0",
                label: "Detached task assignments",
              },
            ]
          : []),
      ],
    );
    const receipt: TagRemovalReceipt = {
      id: input.requestKey,
      tagId,
      removedAt: removedAt.toISOString(),
      report: { ...current.report, capturedAt: review.capturedAt },
    };
    await remember(
      tx,
      workspaceId,
      userId,
      input.requestKey,
      "tag_remove",
      payload,
      receipt,
    );
    return { receipt, replayed: false };
  });
}
export function tagRemovalHistory(
  headers: Headers,
  workspaceId: string,
  tagId: string,
  cursor?: string,
) {
  return workspaceContent(headers, workspaceId, async (tx) => {
    if (
      !(await tx.workspaceTag.findFirst({ where: { workspaceId, id: tagId } }))
    )
      throw new WorkspaceDenied(404, "Tag unavailable.");
    const where = {
      workspaceId,
      kind: "tag_remove",
      result: { path: ["tagId"], equals: tagId },
    };
    const anchor = cursor
      ? await tx.workspaceIntent.findFirst({ where: { ...where, id: cursor } })
      : null;
    if (cursor && !anchor)
      throw new WorkspaceDenied(404, "Removal report unavailable.");
    const rows = await tx.workspaceIntent.findMany({
      where: {
        ...where,
        ...(anchor
          ? {
              OR: [
                { createdAt: { lt: anchor.createdAt } },
                { createdAt: anchor.createdAt, id: { lt: anchor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
    });
    return {
      rows: rows.slice(0, 20).map((row) => {
        const r = row.result as unknown as TagRemovalReceipt;
        return {
          id: r.id,
          removedAt: r.removedAt,
          tagName: r.report.tagName,
          activeCount: r.report.activeCount,
          trashCount: r.report.trashCount,
        };
      }),
      nextCursor: rows.length > 20 ? rows[19].id : null,
    };
  });
}
export function tagRemovalReport(
  headers: Headers,
  workspaceId: string,
  tagId: string,
  operationId: string,
) {
  return workspaceContent(headers, workspaceId, async (tx) => {
    const row = await tx.workspaceIntent.findFirst({
      where: {
        workspaceId,
        id: operationId,
        kind: "tag_remove",
        result: { path: ["tagId"], equals: tagId },
      },
    });
    if (!row) throw new WorkspaceDenied(404, "Removal report unavailable.");
    return row.result as unknown as TagRemovalReceipt;
  });
}
