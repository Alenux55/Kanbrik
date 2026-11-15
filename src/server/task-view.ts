import "server-only";
import type { Prisma, Task } from "@/generated/prisma/client";
import { PlanningInputError } from "./planning-errors";
export const taskStatusSelection = {
  name: true,
  completed: true,
  archivedAt: true,
};
export function taskView<
  T extends Task & {
    workflowStatus: {
      name: string;
      completed: boolean;
      archivedAt: Date | null;
    };
  },
>(row: T) {
  const { workflowStatus, tagLinks, ...task } = row as T & {
    tagLinks?: { tag: import("@/generated/prisma/client").WorkspaceTag }[];
  };
  return {
    ...task,
    tags: (tagLinks ?? [])
      .map((link) => link.tag)
      .sort((a, b) => a.id.localeCompare(b.id)),
    statusName: workflowStatus.name,
    completed: workflowStatus.completed,
    statusArchived: !!workflowStatus.archivedAt,
  };
}
export async function taskWithStatus(tx: Prisma.TransactionClient, id: string) {
  return taskView(
    await tx.task.findUniqueOrThrow({
      where: { id },
      include: {
        workflowStatus: { select: taskStatusSelection },
        tagLinks: { include: { tag: true } },
      },
    }),
  );
}
export async function resolveStatus(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  id?: string,
) {
  const target =
    id ??
    (await tx.workspaceWorkflow.findUniqueOrThrow({ where: { workspaceId } }))
      .defaultStatusId;
  const status = await tx.workspaceStatus.findUnique({
    where: { workspaceId_id: { workspaceId, id: target } },
  });
  if (!status || status.archivedAt)
    throw new PlanningInputError(
      "That status is unavailable in this workspace. Refresh context and choose an active status.",
    );
  return target;
}
