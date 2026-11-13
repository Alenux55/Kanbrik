import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma, TrashBatch } from "@/generated/prisma/client";
import type {
  TrashTarget,
  TrashMember,
  moveToTrashInput,
  restoreTrashInput,
} from "@/lib/trash-contracts";
import { workspaceContent, WorkspaceDenied } from "./workspaces";
import { activeProject, activeTask } from "./active-work";

export class TrashConflict extends Error {
  constructor(
    message: string,
    public current: unknown,
  ) {
    super(message);
  }
}
const membersSchema = z.array(
  z
    .object({
      kind: z.enum(["project", "task"]),
      id: z.string(),
      revision: z.number().int(),
      parentId: z.string().nullable().optional(),
    })
    .strict(),
);
function members(batch: TrashBatch): TrashMember[] {
  return membersSchema.parse(batch.members);
}
function summary(batch: TrashBatch) {
  const rows = members(batch);
  return {
    id: batch.id,
    workspaceId: batch.workspaceId,
    rootKind: batch.rootKind,
    rootId: batch.rootId,
    rootTitle: batch.rootTitle,
    revision: batch.revision,
    createdAt: batch.createdAt,
    restoredAt: batch.restoredAt,
    projectCount: rows.filter((row) => row.kind === "project").length,
    taskCount: rows.filter((row) => row.kind === "task" && !row.parentId)
      .length,
    subtaskCount: rows.filter((row) => row.kind === "task" && row.parentId)
      .length,
  };
}
async function scope(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  target: TrashTarget,
) {
  const project =
    target.kind === "project"
      ? await tx.project.findFirst({
          where: { workspaceId, id: target.id, ...activeProject },
        })
      : null;
  const task =
    target.kind === "task"
      ? await tx.task.findFirst({
          where: { workspaceId, id: target.id, ...activeTask },
        })
      : null;
  if (!project && !task)
    throw new WorkspaceDenied(
      404,
      "Active work not found. Check workspace Trash.",
    );
  const projects = project ? [project] : [];
  const tasks = await tx.task.findMany({
    where: {
      workspaceId,
      ...activeTask,
      ...(project
        ? { projectId: project.id }
        : { OR: [{ id: task!.id }, { parentId: task!.id }] }),
    },
    orderBy: { id: "asc" },
  });
  const ancestors = task
    ? [
        ...(task.projectId
          ? [
              await tx.project.findUniqueOrThrow({
                where: { id: task.projectId },
              }),
            ]
          : []),
        ...(task.parentId
          ? [await tx.task.findUniqueOrThrow({ where: { id: task.parentId } })]
          : []),
      ].map((row) => ({
        id: row.id,
        revision: row.revision,
        deletedAt: row.deletedAt,
      }))
    : [];
  const blocks = await tx.timeBlock.findMany({
    where: {
      workspaceId,
      OR: [
        { projectId: { in: projects.map((row) => row.id) } },
        { taskId: { in: tasks.map((row) => row.id) } },
      ],
    },
    select: { id: true, revision: true },
    orderBy: { id: "asc" },
  });
  const fingerprint = {
    target,
    projects: projects.map((row) => ({ id: row.id, revision: row.revision })),
    tasks: tasks.map((row) => ({ id: row.id, revision: row.revision })),
    ancestors,
    blocks,
  };
  const impact = {
    ...target,
    title: (project ?? task)!.title,
    impactDigest: createHash("sha256")
      .update(JSON.stringify(fingerprint))
      .digest("hex"),
    projectCount: projects.length,
    taskCount: tasks.filter((row) => !row.parentId).length,
    subtaskCount: tasks.filter((row) => !!row.parentId).length,
    blockCount: blocks.length,
  };
  return { projects, tasks, impact };
}
export function previewTrash(
  headers: Headers,
  workspaceId: string,
  target: TrashTarget,
) {
  return workspaceContent(
    headers,
    workspaceId,
    async (tx) => (await scope(tx, workspaceId, target)).impact,
  );
}
export function listTrash(headers: Headers, workspaceId: string) {
  return workspaceContent(headers, workspaceId, async (tx) =>
    (
      await tx.trashBatch.findMany({
        where: { workspaceId, restoredAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      })
    ).map(summary),
  );
}
async function findBatch(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
) {
  const batch = await tx.trashBatch.findUnique({
    where: { workspaceId_id: { workspaceId, id } },
  });
  if (!batch) throw new WorkspaceDenied(404, "Trash operation not found");
  return batch;
}
export function trashDetail(headers: Headers, workspaceId: string, id: string) {
  return workspaceContent(headers, workspaceId, async (tx) => {
    const batch = await findBatch(tx, workspaceId, id);
    const rows = members(batch);
    return {
      ...summary(batch),
      projects: await tx.project.findMany({
        where: {
          workspaceId,
          id: {
            in: rows
              .filter((row) => row.kind === "project")
              .map((row) => row.id),
          },
        },
      }),
      tasks: await tx.task.findMany({
        where: {
          workspaceId,
          id: {
            in: rows.filter((row) => row.kind === "task").map((row) => row.id),
          },
        },
      }),
    };
  });
}
async function retirement(tx: Prisma.TransactionClient, batch: TrashBatch) {
  if (batch.restoredAt) return [];
  const projects = await tx.project.findMany({
    where: {
      workspaceId: batch.workspaceId,
      trashBatchId: batch.id,
      deletedAt: { not: null },
    },
    select: { id: true },
  });
  const tasks = await tx.task.findMany({
    where: {
      workspaceId: batch.workspaceId,
      trashBatchId: batch.id,
      deletedAt: { not: null },
    },
    select: { id: true },
  });
  return [
    ...projects.map((row) => ({ kind: "project" as const, id: row.id })),
    ...tasks.map((row) => ({ kind: "task" as const, id: row.id })),
  ];
}
export function moveToTrash(
  headers: Headers,
  workspaceId: string,
  input: z.infer<typeof moveToTrashInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const prior = await tx.trashBatch.findUnique({
      where: { workspaceId_id: { workspaceId, id: input.requestKey } },
    });
    if (prior) {
      if (
        prior.rootKind !== input.kind ||
        prior.rootId !== input.id ||
        prior.impactDigest !== input.impactDigest
      )
        throw new TrashConflict(
          "That operation key was already used. Review current Trash before creating a new action.",
          summary(prior),
        );
      return {
        batch: summary(prior),
        replayed: true,
        retired: await retirement(tx, prior),
      };
    }
    const current = await scope(tx, workspaceId, {
      kind: input.kind,
      id: input.id,
    });
    if (current.impact.impactDigest !== input.impactDigest)
      throw new TrashConflict(
        "Work or scheduled references changed after confirmation. Review the updated impact before another explicit move.",
        current.impact,
      );
    const rows: TrashMember[] = [
      ...current.projects.map((row) => ({
        kind: "project" as const,
        id: row.id,
        revision: row.revision + 1,
      })),
      ...current.tasks.map((row) => ({
        kind: "task" as const,
        id: row.id,
        revision: row.revision + 1,
        parentId: row.parentId,
      })),
    ];
    const batch = await tx.trashBatch.create({
      data: {
        workspaceId,
        id: input.requestKey,
        rootKind: input.kind,
        rootId: input.id,
        rootTitle: current.impact.title,
        impactDigest: input.impactDigest,
        members: rows,
        createdById: userId,
      },
    });
    const deletedAt = new Date();
    const changedProjects = await tx.project.updateMany({
      where: {
        workspaceId,
        id: { in: current.projects.map((row) => row.id) },
        deletedAt: null,
      },
      data: { deletedAt, trashBatchId: batch.id, revision: { increment: 1 } },
    });
    const changedTasks = await tx.task.updateMany({
      where: {
        workspaceId,
        id: { in: current.tasks.map((row) => row.id) },
        deletedAt: null,
      },
      data: { deletedAt, trashBatchId: batch.id, revision: { increment: 1 } },
    });
    if (
      changedProjects.count !== current.projects.length ||
      changedTasks.count !== current.tasks.length
    )
      throw new TrashConflict(
        "Work changed during this operation. Nothing was moved; review again.",
        current.impact,
      );
    return {
      batch: summary(batch),
      replayed: false,
      retired: rows.map((row) => ({ kind: row.kind, id: row.id })),
    };
  });
}
export function restoreTrash(
  headers: Headers,
  workspaceId: string,
  id: string,
  input: z.infer<typeof restoreTrashInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx) => {
    const batch = await findBatch(tx, workspaceId, id);
    if (batch.restoredAt && batch.revision === input.revision + 1)
      return { batch: summary(batch), replayed: true };
    if (batch.restoredAt || batch.revision !== input.revision)
      throw new TrashConflict(
        "Trash state changed. Refresh before restoring.",
        summary(batch),
      );
    const rows = members(batch);
    const projects = await tx.project.findMany({
      where: {
        workspaceId,
        id: {
          in: rows.filter((row) => row.kind === "project").map((row) => row.id),
        },
      },
    });
    const tasks = await tx.task.findMany({
      where: {
        workspaceId,
        id: {
          in: rows.filter((row) => row.kind === "task").map((row) => row.id),
        },
      },
    });
    for (const row of rows) {
      const current = (row.kind === "project" ? projects : tasks).find(
        (item) => item.id === row.id,
      );
      if (
        !current ||
        !current.deletedAt ||
        current.trashBatchId !== batch.id ||
        current.revision !== row.revision
      )
        throw new TrashConflict(
          "A member of this Trash operation changed. Refresh and review; nothing was restored.",
          summary(batch),
        );
    }
    const projectIds = new Set(projects.map((row) => row.id)),
      taskIds = new Set(tasks.map((row) => row.id));
    for (const task of tasks) {
      if (task.projectId && !projectIds.has(task.projectId)) {
        const ancestor = await tx.project.findFirst({
          where: { workspaceId, id: task.projectId },
        });
        if (!ancestor || ancestor.deletedAt)
          throw new TrashConflict(
            "Restore the required project first. Work is not moved or reparented.",
            { requires: ancestor?.trashBatchId ?? null, ...summary(batch) },
          );
      }
      if (task.parentId && !taskIds.has(task.parentId)) {
        const ancestor = await tx.task.findFirst({
          where: { workspaceId, id: task.parentId },
        });
        if (!ancestor || ancestor.deletedAt)
          throw new TrashConflict(
            "Restore the required parent task first. Work is not moved or reparented.",
            { requires: ancestor?.trashBatchId ?? null, ...summary(batch) },
          );
      }
    }
    const changedProjects = await tx.project.updateMany({
      where: { workspaceId, trashBatchId: batch.id },
      data: { deletedAt: null, trashBatchId: null, revision: { increment: 1 } },
    });
    const changedTasks = await tx.task.updateMany({
      where: { workspaceId, trashBatchId: batch.id },
      data: { deletedAt: null, trashBatchId: null, revision: { increment: 1 } },
    });
    if (
      changedProjects.count !== projects.length ||
      changedTasks.count !== tasks.length
    )
      throw new TrashConflict(
        "Batch membership changed. Nothing was restored.",
        summary(batch),
      );
    const restored = await tx.trashBatch.update({
      where: { workspaceId_id: { workspaceId, id } },
      data: { restoredAt: new Date(), revision: { increment: 1 } },
    });
    return { batch: summary(restored), replayed: false };
  });
}
