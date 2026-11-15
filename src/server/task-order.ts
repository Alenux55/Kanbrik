import "server-only";
import type { Prisma, Task } from "@/generated/prisma/client";
import type { z } from "zod";
import type { reorderTaskInput } from "@/lib/task-order-contracts";
import { workspaceContent, WorkspaceDenied } from "./workspaces";
import { activeTask } from "./active-work";
import { PlanningConflict, PlanningInputError } from "./planning-errors";
import {
  intent,
  remember,
  supplementalEvent,
  canonical,
} from "./extension-support";
export function taskOrderKey(task: {
  projectId: string | null;
  parentId: string | null;
}) {
  return task.parentId
    ? "task/" + task.parentId
    : task.projectId
      ? "project/" + task.projectId
      : null;
}
export async function appendTaskOrder(
  tx: Prisma.TransactionClient,
  task: Task,
) {
  const scopeKey = taskOrderKey(task);
  if (!scopeKey) return;
  const prior = await tx.taskOrderScope.findUnique({
    where: {
      workspaceId_scopeKey: { workspaceId: task.workspaceId, scopeKey },
    },
  });
  if (prior) {
    if (!prior.ids.includes(task.id))
      await tx.taskOrderScope.update({
        where: {
          workspaceId_scopeKey: { workspaceId: task.workspaceId, scopeKey },
          revision: prior.revision,
        },
        data: { ids: { push: task.id }, revision: { increment: 1 } },
      });
    return;
  }
  const siblings = await tx.task.findMany({
    where: {
      workspaceId: task.workspaceId,
      ...(task.parentId
        ? { parentId: task.parentId }
        : { projectId: task.projectId, parentId: null }),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  await tx.taskOrderScope.create({
    data: {
      workspaceId: task.workspaceId,
      scopeKey,
      projectId: task.parentId ? null : task.projectId,
      parentId: task.parentId,
      ids: siblings.map((t) => t.id),
    },
  });
}
export async function touchTaskOrders(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  tasks: { projectId: string | null; parentId: string | null }[],
) {
  const keys = [
    ...new Set(tasks.map(taskOrderKey).filter((key): key is string => !!key)),
  ];
  if (keys.length)
    await tx.taskOrderScope.updateMany({
      where: { workspaceId, scopeKey: { in: keys } },
      data: { revision: { increment: 1 } },
    });
}
async function snapshot(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  scopeKey: string,
) {
  const scope = await tx.taskOrderScope.findUniqueOrThrow({
    where: { workspaceId_scopeKey: { workspaceId, scopeKey } },
  });
  const active = await tx.task.findMany({
      where: { workspaceId, ...activeTask, id: { in: scope.ids } },
      select: { id: true },
    }),
    ids = new Set(active.map((t) => t.id));
  return {
    scopeKey: scope.scopeKey,
    revision: scope.revision,
    ids: scope.ids.filter((id) => ids.has(id)),
  };
}
export function readTaskOrders(headers: Headers, workspaceId: string) {
  return workspaceContent(headers, workspaceId, async (tx) => {
    const scopes = await tx.taskOrderScope.findMany({
      where: { workspaceId },
      orderBy: { scopeKey: "asc" },
    });
    const active = await tx.task.findMany({
        where: { workspaceId, ...activeTask },
        select: { id: true },
      }),
      ids = new Set(active.map((t) => t.id));
    return scopes.map((scope) => ({
      scopeKey: scope.scopeKey,
      revision: scope.revision,
      ids: scope.ids.filter((id) => ids.has(id)),
    }));
  });
}
export function reorderTask(
  headers: Headers,
  workspaceId: string,
  input: z.infer<typeof reorderTaskInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const task = await tx.task.findFirst({
      where: { workspaceId, id: input.taskId },
    });
    if (!task)
      throw new WorkspaceDenied(404, "Task not found in this workspace.");
    const scopeKey = taskOrderKey(task);
    if (!scopeKey)
      throw new PlanningInputError(
        "Standalone root task ordering is not assigned. Choose project siblings or children of one task.",
      );
    const prior = await intent(
      tx,
      workspaceId,
      userId,
      input.requestKey,
      "task_reorder",
      input,
    );
    if (prior)
      return {
        scope: await snapshot(tx, workspaceId, scopeKey),
        replayed: true,
        changed: prior.changed,
      };
    if (
      !(await tx.task.findFirst({
        where: { workspaceId, id: task.id, ...activeTask },
      }))
    )
      throw new WorkspaceDenied(409, "Restore the work before reordering it.");
    const scope = await tx.taskOrderScope.findUniqueOrThrow({
        where: { workspaceId_scopeKey: { workspaceId, scopeKey } },
      }),
      current = await snapshot(tx, workspaceId, scopeKey);
    if (scope.revision !== input.revision) throw new PlanningConflict(current);
    if (input.beforeId && !current.ids.includes(input.beforeId))
      throw new PlanningInputError(
        "The destination must be an active sibling in this same project or parent task. Reload order before choosing another destination.",
      );
    const next =
      input.beforeId === task.id
        ? [...current.ids]
        : current.ids.filter((id) => id !== task.id);
    if (input.beforeId !== task.id)
      next.splice(
        input.beforeId === null ? next.length : next.indexOf(input.beforeId),
        0,
        task.id,
      );
    if (canonical(next) === canonical(current.ids)) {
      await remember(
        tx,
        workspaceId,
        userId,
        input.requestKey,
        "task_reorder",
        input,
        { changed: false },
      );
      return { scope: current, changed: false, replayed: false };
    }
    const activeIds = new Set(current.ids);
    let index = 0;
    const ids = scope.ids.map((id) => (activeIds.has(id) ? next[index++] : id));
    const saved = await tx.taskOrderScope.update({
      where: {
        workspaceId_scopeKey: { workspaceId, scopeKey },
        revision: input.revision,
      },
      data: { ids, revision: { increment: 1 } },
    });
    await supplementalEvent(
      tx,
      workspaceId,
      userId,
      { kind: "task", id: task.id },
      "task_reordered",
      "order",
      scopeKey,
      saved.revision,
      [
        {
          field: "sibling_position",
          label: task.parentId
            ? "Position within parent task"
            : "Position within project",
          before: String(current.ids.indexOf(task.id) + 1),
          after: String(next.indexOf(task.id) + 1),
        },
      ],
    );
    await remember(
      tx,
      workspaceId,
      userId,
      input.requestKey,
      "task_reorder",
      input,
      { changed: true, revision: saved.revision },
    );
    return {
      scope: await snapshot(tx, workspaceId, scopeKey),
      changed: true,
      replayed: false,
    };
  });
}
