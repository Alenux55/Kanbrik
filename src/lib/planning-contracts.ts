import { z } from "zod";
import { taskStatusIds, type TaskStatus } from "./task-statuses";

const title = z.string().trim().min(1).max(200);
const description = z.string().max(20_000);
const id = z.string().min(1).max(200);
const revision = z.number().int().min(1).max(2_147_483_646);
export const createProjectInput = z.object({ title, description: description.default("") }).strict();
export const editProjectInput = z.object({ title, description, revision }).strict();
export const createTaskInput = z.object({ title, description: description.default(""), status: z.enum(taskStatusIds).default("todo"), projectId: id.nullable().optional(), parentId: id.optional() }).strict();
export const editTaskInput = z.object({ title, description, status: z.enum(taskStatusIds), revision }).strict();
export const taskStatusInput = z.object({ status: z.enum(taskStatusIds), revision }).strict();
export const boardPreferenceInput = z.object({ workspaceIds: z.array(id) }).strict();
export type ProjectRecord = { id: string; workspaceId: string; title: string; description: string; revision: number; createdAt: string; updatedAt: string };
export type TaskRecord = ProjectRecord & { projectId: string | null; parentId: string | null; status: TaskStatus };
