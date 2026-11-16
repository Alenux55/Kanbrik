import { assignTags, validateTags } from "./tags";
import { appendTaskOrder } from "./task-order";
import "server-only";
import type { z } from "zod";
import { workspaceContent, WorkspaceDenied } from "./workspaces";
import { workEvent } from "./activity-events";
import { activeProject, activeTask } from "./active-work";
import type {
  createProjectInput,
  createTaskInput,
  editProjectInput,
  editTaskInput,
  taskStatusInput,
} from "@/lib/planning-contracts";

import { PlanningConflict } from "./planning-errors";
export { PlanningConflict, PlanningInputError } from "./planning-errors";
import { PlanningInputError } from "./planning-errors";
import {
  taskStatusSelection,
  taskView,
  taskWithStatus,
  resolveStatus,
} from "./task-view";
const order = [{ createdAt: "asc" }, { id: "asc" }] as const;
export function listProjects(headers: Headers, workspaceId: string) {
  return workspaceContent(headers, workspaceId, (tx) =>
    tx.project.findMany({
      where: { workspaceId, ...activeProject },
      orderBy: [...order],
    }),
  );
}
export function projectDetail(
  headers: Headers,
  workspaceId: string,
  id: string,
) {
  return workspaceContent(headers, workspaceId, async (tx) => {
    const project = await tx.project.findFirst({
      where: { id, workspaceId, ...activeProject },
    });
    if (!project) throw new WorkspaceDenied(404, "Project not found");
    return project;
  });
}
export function createProject(
  headers: Headers,
  workspaceId: string,
  input: z.infer<typeof createProjectInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const project = await tx.project.create({
      data: { workspaceId, ...input },
    });
    await workEvent(tx, userId, "project", null, project);
    return project;
  });
}
export function updateProject(
  headers: Headers,
  workspaceId: string,
  id: string,
  input: z.infer<typeof editProjectInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const current = await tx.project.findFirst({
      where: { workspaceId, id, ...activeProject },
    });
    if (!current) throw new WorkspaceDenied(404, "Project not found");
    const { revision, ...values } = input;
    if (current.revision !== revision) throw new PlanningConflict(current);
    if (
      Object.entries(values).every(
        ([key, value]) => (current as Record<string, unknown>)[key] === value,
      )
    )
      return current;
    const result = await tx.project.updateMany({
      where: { workspaceId, id, revision, ...activeProject },
      data: { ...values, revision: { increment: 1 } },
    });
    if (result.count !== 1) throw new PlanningConflict(current);
    const saved = await tx.project.findUniqueOrThrow({ where: { id } });
    await workEvent(tx, userId, "project", current, saved);
    return saved;
  });
}
export function listTasks(headers: Headers, workspaceId: string) {
  return workspaceContent(headers, workspaceId, async (tx) =>
    (
      await tx.task.findMany({
        where: { workspaceId, ...activeTask },
        orderBy: [...order],
        include: {
          workflowStatus: { select: taskStatusSelection },
          tagLinks: { include: { tag: true } },
        },
      })
    ).map(taskView),
  );
}
export function taskDetail(headers: Headers, workspaceId: string, id: string) {
  return workspaceContent(headers, workspaceId, async (tx) => {
    const task = await tx.task.findFirst({
      where: { workspaceId, id, ...activeTask },
    });
    if (!task) throw new WorkspaceDenied(404, "Task not found");
    return taskWithStatus(tx, task.id);
  });
}
export function createTask(
  headers: Headers,
  workspaceId: string,
  input: z.infer<typeof createTaskInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    let projectId = input.projectId ?? null;
    if (input.parentId) {
      const parent = await tx.task.findFirst({
        where: { id: input.parentId, workspaceId, ...activeTask },
      });
      if (!parent) throw new WorkspaceDenied(404, "Parent task not found");
      if (parent.parentId)
        throw new PlanningInputError("Subtasks cannot have children.");
      if (input.projectId !== undefined && input.projectId !== parent.projectId)
        throw new PlanningInputError(
          "A subtask must use its parent's project.",
        );
      projectId = parent.projectId;
    }
    if (
      projectId &&
      !(await tx.project.findFirst({
        where: { id: projectId, workspaceId, ...activeProject },
        select: { id: true },
      }))
    )
      throw new WorkspaceDenied(404, "Project not found");
    await validateTags(tx, workspaceId, input.tagIds, []);
    const saved = await tx.task.create({
      data: {
        workspaceId,
        projectId,
        parentId: input.parentId,
        title: input.title,
        description: input.description,
        status: await resolveStatus(tx, workspaceId, input.status),
      },
    });
    await assignTags(tx, workspaceId, saved.id, input.tagIds);
    await appendTaskOrder(tx, saved);
    await workEvent(
      tx,
      userId,
      "task",
      null,
      await taskWithStatus(tx, saved.id),
    );
    return taskWithStatus(tx, saved.id);
  });
}
export function updateTask(
  headers: Headers,
  workspaceId: string,
  id: string,
  input: z.infer<typeof editTaskInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const current = await tx.task.findFirst({
      where: { workspaceId, id, ...activeTask },
    });
    if (!current) throw new WorkspaceDenied(404, "Task not found");
    const { revision, tagIds, ...values } = input;
    const before = await taskWithStatus(tx, current.id);
    // Reviewed bulk removal can retire a formerly valid selection. Show the
    // newer canonical task before validating a retained draft against metadata.
    if (current.revision !== revision) throw new PlanningConflict(before);
    const previousIds = before.tags.map((t) => t.id);
    if (tagIds) await validateTags(tx, workspaceId, tagIds, previousIds);
    const changedTags =
      tagIds !== undefined &&
      JSON.stringify([...tagIds].sort()) !== JSON.stringify(previousIds.sort());
    await resolveStatus(tx, workspaceId, input.status);
    if (
      !changedTags &&
      Object.entries(values).every(
        ([key, value]) => (current as Record<string, unknown>)[key] === value,
      )
    )
      return taskWithStatus(tx, current.id);
    const result = await tx.task.updateMany({
      where: { workspaceId, id, revision, ...activeTask },
      data: { ...values, revision: { increment: 1 } },
    });
    if (result.count !== 1) throw new PlanningConflict(current);
    const saved = await tx.task.findUniqueOrThrow({ where: { id } });
    if (tagIds) await assignTags(tx, workspaceId, id, tagIds);
    await workEvent(
      tx,
      userId,
      "task",
      before,
      await taskWithStatus(tx, saved.id),
    );
    return taskWithStatus(tx, saved.id);
  });
}

export function updateTaskStatus(
  headers: Headers,
  workspaceId: string,
  id: string,
  input: z.infer<typeof taskStatusInput>,
) {
  return workspaceContent(headers, workspaceId, async (tx, userId) => {
    const current = await tx.task.findFirst({
      where: { workspaceId, id, ...activeTask },
    });
    if (!current) throw new WorkspaceDenied(404, "Task not found");
    if (
      input.statusWorkspaceId !== undefined &&
      input.statusWorkspaceId !== workspaceId
    )
      throw new WorkspaceDenied(
        403,
        "A task cannot move to another workspace workflow.",
      );
    if (current.revision !== input.revision)
      throw new PlanningConflict(await taskWithStatus(tx, current.id));
    await resolveStatus(tx, workspaceId, input.status);
    if (current.status === input.status) return taskWithStatus(tx, current.id);
    const result = await tx.task.updateMany({
      where: { workspaceId, id, revision: input.revision, ...activeTask },
      data: { status: input.status, revision: { increment: 1 } },
    });
    if (result.count !== 1) throw new PlanningConflict(current);
    const saved = await tx.task.findUniqueOrThrow({ where: { id } });
    await workEvent(tx, userId, "task", current, saved, "status_changed");
    return taskWithStatus(tx, saved.id);
  });
}
