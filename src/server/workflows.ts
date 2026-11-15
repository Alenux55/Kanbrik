import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type {
  WorkflowProposal,
  saveWorkflowInput,
} from "@/lib/workflow-contracts";
import { workspaceContent } from "./workspaces";
import { activeTask } from "./active-work";
import { PlanningConflict, PlanningInputError } from "./planning-errors";
import {
  digest,
  assertOwner,
  intent,
  remember,
  configurationEvent,
  canonical,
} from "./extension-support";
import { workEvent } from "./activity-events";
export async function workflowSnapshot(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
) {
  const cfg = await tx.workspaceWorkflow.findUniqueOrThrow({
      where: { workspaceId },
    }),
    definitions = await tx.workspaceStatus.findMany({
      where: { workspaceId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    }),
    member = await tx.membership.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
  return {
    revision: cfg.revision,
    defaultStatusId: cfg.defaultStatusId,
    definitions,
    owner: member.role === "owner",
  };
}
export function readWorkflow(headers: Headers, workspaceId: string) {
  return workspaceContent(headers, workspaceId, (tx, userId) =>
    workflowSnapshot(tx, workspaceId, userId),
  );
}
async function plan(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  input: WorkflowProposal,
) {
  const current = await workflowSnapshot(tx, workspaceId, userId);
  if (current.revision !== input.revision) throw new PlanningConflict(current);
  const ids = new Set(input.definitions.map((d) => d.id));
  if (ids.size !== input.definitions.length)
    throw new PlanningInputError(
      "Each workflow definition must have its own stable identity.",
    );
  if (current.definitions.some((d) => !ids.has(d.id)))
    throw new PlanningInputError(
      "Retain all saved definitions; archive a status instead of removing its identity.",
    );
  const old = new Map(current.definitions.map((d) => [d.id, d])),
    active = input.definitions.filter((d) => !d.archived),
    names = active.map((d) => d.name.toLocaleLowerCase());
  if (
    !active.length ||
    active.length > 50 ||
    new Set(names).size !== names.length
  )
    throw new PlanningInputError(
      "Keep 1–50 active statuses with distinct names, ignoring case.",
    );
  for (const d of input.definitions)
    if (!old.has(d.id) && !z.uuid().safeParse(d.id).success)
      throw new PlanningInputError(
        "New statuses require a stable generated identity.",
      );
  const selected = active.find((d) => d.id === input.defaultStatusId);
  if (!selected || selected.completed)
    throw new PlanningInputError(
      "Choose an active incomplete status as the creation default.",
    );
  // Clear duplicate-name handling: name swaps are two deliberate renames, never a hidden temporary label.
  for (const d of active) {
    const occupied = current.definitions.find(
      (o) =>
        !o.archivedAt &&
        o.id !== d.id &&
        o.name.toLocaleLowerCase() === d.name.toLocaleLowerCase(),
    );
    if (
      occupied &&
      !input.definitions.find((n) => n.id === occupied.id)!.archived
    )
      throw new PlanningInputError(
        "That name is currently used by another active status. Rename it first before reusing the name.",
      );
  }
  const retiring = current.definitions
    .filter(
      (d) =>
        !d.archivedAt && input.definitions.find((n) => n.id === d.id)!.archived,
    )
    .map((d) => d.id);
  if (Object.keys(input.replacements).some((id) => !retiring.includes(id)))
    throw new PlanningInputError(
      "Replacement choices must refer to statuses being retired in this proposal.",
    );
  const tasks = await tx.task.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    }),
    live = await tx.task.findMany({
      where: { workspaceId, ...activeTask },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
    liveIds = new Set(live.map((t) => t.id));
  const moving = tasks.filter(
    (t) => liveIds.has(t.id) && retiring.includes(t.status),
  );
  for (const id of retiring) {
    const choice = input.replacements[id];
    if (moving.some((t) => t.status === id) && !choice)
      throw new PlanningInputError(
        "Choose an explicit replacement for every occupied status being retired.",
      );
    if (choice && !active.some((d) => d.id === choice))
      throw new PlanningInputError(
        "Replacement statuses must be active in this workspace.",
      );
  }
  const changes =
    input.definitions.some((d, index) => {
      const o = old.get(d.id);
      return (
        !o ||
        o.name !== d.name ||
        o.completed !== d.completed ||
        !!o.archivedAt !== d.archived ||
        o.position !== index
      );
    }) || current.defaultStatusId !== input.defaultStatusId;
  const reassignments = retiring.map((id) => ({
    from: old.get(id)!.name,
    to:
      active.find((d) => d.id === input.replacements[id])?.name ??
      "No active work",
    count: moving.filter((t) => t.status === id).length,
  }));
  const completionChanges = input.definitions
    .filter((d) => old.has(d.id) && old.get(d.id)!.completed !== d.completed)
    .map((d) => ({
      name: d.name,
      before: old.get(d.id)!.completed,
      after: d.completed,
      active: tasks.filter((t) => t.status === d.id && liveIds.has(t.id))
        .length,
      trashed: tasks.filter((t) => t.status === d.id && !liveIds.has(t.id))
        .length,
    }));
  const impactDigest = digest({
    input,
    current: current.definitions,
    default: current.defaultStatusId,
    tasks: tasks.map((t) => [t.id, t.revision, t.status, liveIds.has(t.id)]),
  });
  return {
    current,
    old,
    moving,
    impact: {
      impactDigest,
      revision: current.revision,
      changed: changes,
      activeTaskCount: moving.length,
      subtaskCount: moving.filter((t) => t.parentId).length,
      trashedTaskCount: tasks.filter(
        (t) => !liveIds.has(t.id) && retiring.includes(t.status),
      ).length,
      reassignments,
      completionChanges,
    },
  };
}
export function previewWorkflow(
  headers: Headers,
  workspaceId: string,
  input: WorkflowProposal,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    await assertOwner(tx, workspaceId, userId);
    return (await plan(tx, workspaceId, userId, input)).impact;
  });
}
export function saveWorkflow(
  headers: Headers,
  workspaceId: string,
  input: z.infer<typeof saveWorkflowInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    await assertOwner(tx, workspaceId, userId);
    const prior = await intent(
      tx,
      workspaceId,
      userId,
      input.requestKey,
      "workflow_save",
      input,
    );
    if (prior)
      return {
        workflow: await workflowSnapshot(tx, workspaceId, userId),
        replayed: true,
        changed: prior.changed,
      };
    const { impactDigest, requestKey, ...proposal } = input,
      checked = await plan(tx, workspaceId, userId, proposal);
    if (impactDigest !== checked.impact.impactDigest)
      throw new PlanningConflict(
        await workflowSnapshot(tx, workspaceId, userId),
      );
    if (!checked.impact.changed) {
      await remember(
        tx,
        workspaceId,
        userId,
        requestKey,
        "workflow_save",
        input,
        { changed: false },
      );
      return { workflow: checked.current, changed: false, replayed: false };
    }
    const saveDefinition = async (
      d: WorkflowProposal["definitions"][number],
      position: number,
    ) => {
      const old = checked.old.get(d.id);
      if (!old) {
        await tx.workspaceStatus.create({
          data: {
            workspaceId,
            id: d.id,
            name: d.name,
            position,
            completed: d.completed,
            archivedAt: d.archived ? new Date() : null,
          },
        });
        return;
      }
      if (
        old.name === d.name &&
        old.position === position &&
        old.completed === d.completed &&
        !!old.archivedAt === d.archived
      )
        return;
      await tx.workspaceStatus.update({
        where: {
          workspaceId_id: { workspaceId, id: d.id },
          revision: old.revision,
        },
        data: {
          name: d.name,
          position,
          completed: d.completed,
          archivedAt: d.archived ? (old.archivedAt ?? new Date()) : null,
          revision: { increment: 1 },
        },
      });
    };
    for (const [i, d] of proposal.definitions.entries())
      if (d.archived) await saveDefinition(d, i);
    for (const [i, d] of proposal.definitions.entries())
      if (!d.archived) await saveDefinition(d, i);
    await tx.workspaceWorkflow.update({
      where: { workspaceId, revision: proposal.revision },
      data: {
        defaultStatusId: proposal.defaultStatusId,
        revision: { increment: 1 },
      },
    });
    for (const task of checked.moving) {
      const replacement = proposal.replacements[task.status],
        saved = await tx.task.update({
          where: { id: task.id, revision: task.revision },
          data: { status: replacement, revision: { increment: 1 } },
        });
      await workEvent(
        tx,
        userId,
        "task",
        { ...task, statusName: checked.old.get(task.status)!.name },
        {
          ...saved,
          statusName: proposal.definitions.find((d) => d.id === replacement)!
            .name,
        },
        "status_changed",
      );
    }
    const after = await workflowSnapshot(tx, workspaceId, userId);
    const readable = (
      definitions: {
        id: string;
        name: string;
        completed: boolean;
        archivedAt: Date | null;
      }[],
      defaultId: string,
    ) =>
      definitions
        .map(
          (d) =>
            `${d.name}: ${d.archivedAt ? "archived" : d.completed ? "completed" : "open"}${d.id === defaultId ? ", creation default" : ""}`,
        )
        .join("\n");
    await configurationEvent(
      tx,
      workspaceId,
      userId,
      "workflow_updated",
      workspaceId,
      after.revision,
      [
        {
          field: "workflow",
          label: "Workspace workflow",
          before: canonical(checked.current),
          after: canonical(after),
          beforeLabel: readable(
            checked.current.definitions,
            checked.current.defaultStatusId,
          ),
          afterLabel: readable(after.definitions, after.defaultStatusId),
        },
      ],
    );
    await remember(
      tx,
      workspaceId,
      userId,
      requestKey,
      "workflow_save",
      input,
      { changed: true, revision: after.revision },
    );
    return { workflow: after, replayed: false, changed: true };
  });
}
