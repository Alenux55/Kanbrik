import "server-only";
import type { z } from "zod";
import { workspaceContent, WorkspaceDenied } from "./workspaces";
import type { createProjectInput, createTaskInput, editProjectInput, editTaskInput, taskStatusInput } from "@/lib/planning-contracts";

export class PlanningConflict extends Error {
  constructor(public current: unknown) { super("Someone saved a newer version. Your draft has been kept. Review the saved version before retrying."); }
}
export class PlanningInputError extends Error {}
const order = [{ createdAt: "asc" }, { id: "asc" }] as const;
export function listProjects(headers: Headers, workspaceId: string) {
  return workspaceContent(headers, workspaceId, tx => tx.project.findMany({ where: { workspaceId }, orderBy: [...order] }));
}
export function projectDetail(headers: Headers, workspaceId: string, id: string) {
  return workspaceContent(headers, workspaceId, async tx => {
    const project = await tx.project.findFirst({ where: { id, workspaceId } });
    if (!project) throw new WorkspaceDenied(404, "Project not found");
    return project;
  });
}
export function createProject(headers: Headers, workspaceId: string, input: z.infer<typeof createProjectInput>) {
  return workspaceContent(headers, workspaceId, tx => tx.project.create({ data: { workspaceId, ...input } }));
}
export function updateProject(headers: Headers, workspaceId: string, id: string, input: z.infer<typeof editProjectInput>) {
  return workspaceContent(headers, workspaceId, async tx => {
    const current = await tx.project.findFirst({ where: { workspaceId, id } });
    if (!current) throw new WorkspaceDenied(404, "Project not found");
    const { revision, ...values } = input;
    const result = await tx.project.updateMany({ where: { workspaceId, id, revision }, data: { ...values, revision: { increment: 1 } } });
    if (result.count !== 1) throw new PlanningConflict(current);
    return tx.project.findUniqueOrThrow({ where: { id } });
  });
}
export function listTasks(headers: Headers, workspaceId: string) {
  return workspaceContent(headers, workspaceId, tx => tx.task.findMany({ where: { workspaceId }, orderBy: [...order] }));
}
export function taskDetail(headers: Headers, workspaceId: string, id: string) {
  return workspaceContent(headers, workspaceId, async tx => {
    const task = await tx.task.findFirst({ where: { workspaceId, id } });
    if (!task) throw new WorkspaceDenied(404, "Task not found");
    return task;
  });
}
export function createTask(headers: Headers, workspaceId: string, input: z.infer<typeof createTaskInput>) {
  return workspaceContent(headers, workspaceId, async tx => {
    let projectId = input.projectId ?? null;
    if (input.parentId) {
      const parent = await tx.task.findFirst({ where: { id: input.parentId, workspaceId } });
      if (!parent) throw new WorkspaceDenied(404, "Parent task not found");
      if (parent.parentId) throw new PlanningInputError("Subtasks cannot have children.");
      if (input.projectId !== undefined && input.projectId !== parent.projectId) throw new PlanningInputError("A subtask must use its parent's project.");
      projectId = parent.projectId;
    }
    if (projectId && !await tx.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } })) throw new WorkspaceDenied(404, "Project not found");
    return tx.task.create({ data: { workspaceId, projectId, parentId: input.parentId, title: input.title, description: input.description, status: input.status } });
  });
}
export function updateTask(headers: Headers, workspaceId: string, id: string, input: z.infer<typeof editTaskInput>) {
  return workspaceContent(headers, workspaceId, async tx => {
    const current = await tx.task.findFirst({ where: { workspaceId, id } });
    if (!current) throw new WorkspaceDenied(404, "Task not found");
    const { revision, ...values } = input;
    const result = await tx.task.updateMany({ where: { workspaceId, id, revision }, data: { ...values, revision: { increment: 1 } } });
    if (result.count !== 1) throw new PlanningConflict(current);
    return tx.task.findUniqueOrThrow({ where: { id } });
  });
}

export function updateTaskStatus(headers: Headers, workspaceId: string, id: string, input: z.infer<typeof taskStatusInput>) {
  return workspaceContent(headers, workspaceId, async tx => {
    const current = await tx.task.findFirst({ where: { workspaceId, id } });
    if (!current) throw new WorkspaceDenied(404, "Task not found");
    const result = await tx.task.updateMany({ where: { workspaceId, id, revision: input.revision }, data: { status: input.status, revision: { increment: 1 } } });
    if (result.count !== 1) throw new PlanningConflict(current);
    return tx.task.findUniqueOrThrow({ where: { id } });
  });
}
