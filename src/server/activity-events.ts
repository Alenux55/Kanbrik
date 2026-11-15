import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { FieldChange, WorkTarget } from "@/lib/activity-contracts";
export const targetWhere = (target: WorkTarget) => ({
  projectId: target.kind === "project" ? target.id : null,
  taskId: target.kind === "task" ? target.id : null,
});
export async function actorName(tx: Prisma.TransactionClient, userId: string) {
  return (
    (
      await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { name: true },
      })
    ).name
      .trim()
      .slice(0, 200) || "Member"
  );
}
type Work = {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  revision: number;
  status?: string;
  statusName?: string;
  tags?: { id: string; name: string }[];
};
export async function workEvent(
  tx: Prisma.TransactionClient,
  userId: string,
  kind: WorkTarget["kind"],
  before: Work | null,
  after: Work,
  action = "work_updated",
) {
  const changes: FieldChange[] = [];
  for (const field of [
    "title",
    "description",
    ...(kind === "task" ? (["status"] as const) : []),
  ] as const) {
    const previous = before?.[field] ?? null,
      next = after[field] ?? null;
    if (previous !== next)
      changes.push({
        field,
        before: previous === null ? null : String(previous),
        after: next === null ? null : String(next),
      });
  }
  for (const change of changes)
    if (change.field === "status") {
      if (change.before !== null)
        change.beforeLabel =
          before?.statusName ??
          (
            await tx.workspaceStatus.findUniqueOrThrow({
              where: {
                workspaceId_id: {
                  workspaceId: after.workspaceId,
                  id: change.before,
                },
              },
            })
          ).name;
      if (change.after !== null)
        change.afterLabel =
          after.statusName ??
          (
            await tx.workspaceStatus.findUniqueOrThrow({
              where: {
                workspaceId_id: {
                  workspaceId: after.workspaceId,
                  id: change.after,
                },
              },
            })
          ).name;
    }
  if (kind === "task" && after.tags) {
    const beforeIds = (before?.tags ?? []).map((t) => t.id).sort(),
      afterIds = after.tags.map((t) => t.id).sort();
    if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds))
      changes.push({
        field: "tags",
        before: JSON.stringify(beforeIds),
        after: JSON.stringify(afterIds),
        beforeLabel:
          (before?.tags ?? []).map((t) => t.name).join(", ") || "None",
        afterLabel: after.tags.map((t) => t.name).join(", ") || "None",
      });
  }
  if (!changes.length) return;
  await tx.workActivity.create({
    data: {
      workspaceId: after.workspaceId,
      ...targetWhere({ kind, id: after.id }),
      actorId: userId,
      actorName: await actorName(tx, userId),
      occurredAt: new Date(),
      eventKey: `${kind}/${after.id}/work/${after.revision}`,
      action: before ? action : "work_created",
      workRevision: after.revision,
      changes,
    },
  });
}
export async function lifecycleEvents(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
  rows: {
    kind: WorkTarget["kind"];
    id: string;
    revision: number;
    deletedAt: Date | null;
    statusChange?: FieldChange;
  }[],
  operation: {
    id: string;
    rootId: string;
    rootTitle: string;
    rootKind: string;
  },
  deletedAt: Date | null,
) {
  const name = await actorName(tx, userId),
    occurredAt = new Date();
  if (!rows.length) return;
  await tx.workActivity.createMany({
    data: rows.map((row) => ({
      workspaceId,
      ...targetWhere(row),
      actorId: userId,
      actorName: name,
      occurredAt,
      eventKey: `${row.kind}/${row.id}/work/${row.revision + 1}`,
      action: deletedAt ? "work_trashed" : "work_restored",
      workRevision: row.revision + 1,
      operationId: operation.id,
      operationTitle: operation.rootTitle,
      operationKind: operation.rootKind,
      cascade: row.kind !== operation.rootKind || row.id !== operation.rootId,
      changes: [
        {
          field: "deletedAt",
          before: row.deletedAt?.toISOString() ?? null,
          after: deletedAt?.toISOString() ?? null,
        },
        ...(row.statusChange ? [row.statusChange] : []),
      ],
    })),
  });
}
