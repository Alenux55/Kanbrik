import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { WorkTarget, FieldChange } from "@/lib/activity-contracts";
import { activeProject, activeTask } from "./active-work";
import { WorkspaceDenied } from "./workspaces";
import { PlanningInputError } from "./planning-errors";
import { actorName, targetWhere } from "./activity-events";
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function digest(value: unknown) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
export async function workReadOnly(
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
    throw new WorkspaceDenied(404, "Work unavailable. Your input is kept.");
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
export async function intent(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  key: string,
  kind: string,
  payload: object,
) {
  const prior = await tx.workspaceIntent.findUnique({
    where: { workspaceId_id: { workspaceId, id: key } },
  });
  if (!prior) return null;
  if (
    prior.actorId !== userId ||
    prior.kind !== kind ||
    canonical(prior.payload) !== canonical(payload)
  )
    throw new PlanningInputError(
      "That request key belongs to a different operation. Review the original input before retrying.",
    );
  return prior.result as Record<string, unknown>;
}
export function remember(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  key: string,
  kind: string,
  payload: object,
  result: object,
) {
  return tx.workspaceIntent.create({
    data: {
      workspaceId,
      id: key,
      actorId: userId,
      kind,
      payload: payload as Prisma.InputJsonObject,
      result: result as Prisma.InputJsonObject,
    },
  });
}
export async function configurationEvent(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  action: string,
  id: string,
  revision: number,
  changes: FieldChange[],
) {
  return tx.workspaceActivity.create({
    data: {
      workspaceId,
      actorId: userId,
      actorName: await actorName(tx, userId),
      action,
      subjectId: id,
      revision,
      eventKey: `${action}/${id}/${revision}`,
      changes,
    },
  });
}
export async function supplementalEvent(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  target: WorkTarget,
  action: string,
  subjectKind: string,
  id: string,
  revision: number,
  changes: FieldChange[],
) {
  if (!changes.length) return;
  return tx.workActivity.create({
    data: {
      workspaceId,
      ...targetWhere(target),
      actorId: userId,
      actorName: await actorName(tx, userId),
      action,
      subjectKind,
      subjectId: id,
      subjectRevision: revision,
      eventKey: `${subjectKind}/${id}/${revision}`,
      changes,
    },
  });
}
export function fieldChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  keys: string[],
  labels: Record<string, string> = {},
): FieldChange[] {
  return keys.flatMap((field) => {
    const old = before?.[field] ?? null,
      next = after[field] ?? null;
    return canonical(old) === canonical(next)
      ? []
      : [
          {
            field,
            label: labels[field],
            before: old === null ? null : String(old),
            after: next === null ? null : String(next),
          },
        ];
  });
}
export async function assertOwner(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
) {
  const member = await tx.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (member?.role !== "owner")
    throw new WorkspaceDenied(
      403,
      "Only the workspace owner can configure its workflow.",
    );
}
