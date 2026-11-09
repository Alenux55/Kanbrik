import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { assignmentInput, createBlockInput, editBlockInput, calendarPreferenceInput } from "@/lib/calendar-contracts";
import { workspaceContent, WorkspaceDenied, Unauthenticated, accessibleWorkspaces } from "./workspaces";
import { PlanningConflict, PlanningInputError } from "./planning";
import { verifiedSession } from "./auth";
import { database } from "./db";
const include = { project: { select: { id: true, title: true } }, task: { select: { id: true, title: true, status: true, parentId: true } } } as const;
async function linked(tx: Prisma.TransactionClient, workspaceId: string, assignment: z.infer<typeof assignmentInput>) {
  if (assignment.projectId && !await tx.project.findFirst({ where: { id: assignment.projectId, workspaceId } })) throw new WorkspaceDenied(404, "Project not found");
  if (assignment.taskId && !await tx.task.findFirst({ where: { id: assignment.taskId, workspaceId } })) throw new WorkspaceDenied(404, "Task not found");
}
export function blocks(headers: Headers, workspaceId: string, range: { start: string; end: string }) {
  return workspaceContent(headers, workspaceId, tx => tx.timeBlock.findMany({ where: { workspaceId, startAt: { lt: new Date(range.end) }, endAt: { gt: new Date(range.start) } }, include, orderBy: [{ startAt: "asc" }, { id: "asc" }] }));
}
export function createBlock(headers: Headers, workspaceId: string, input: z.infer<typeof createBlockInput>) {
  return workspaceContent(headers, workspaceId, async tx => {
    const payload = JSON.stringify(input);
    const intent = await tx.calendarCreateIntent.findUnique({ where: { workspaceId_requestKey: { workspaceId, requestKey: input.requestKey } } });
    if (intent) {
      if (intent.payload !== payload) throw new PlanningInputError("Create intent already used with different input");
      const saved = await tx.timeBlock.findFirst({ where: { workspaceId, id: intent.blockId }, include });
      if (!saved) throw new WorkspaceDenied(404, "Original block was removed; this intent cannot create another");
      return saved;
    }
    await linked(tx, workspaceId, input.assignment);
    const block = await tx.timeBlock.create({ data: { workspaceId, label: input.label, ...input.assignment, startAt: new Date(input.schedule.startAt), endAt: new Date(input.schedule.endAt), timeZone: input.schedule.timeZone }, include });
    await tx.calendarCreateIntent.create({ data: { workspaceId, requestKey: input.requestKey, payload, blockId: block.id } });
    return block;
  });
}
export function changeBlock(headers: Headers, workspaceId: string, id: string, input: z.infer<typeof editBlockInput> | { revision: number }, remove = false) {
  return workspaceContent(headers, workspaceId, async tx => {
    const current = await tx.timeBlock.findFirst({ where: { workspaceId, id }, include });
    if (!current) throw new WorkspaceDenied(404, "Time block not found");
    if (current.revision !== input.revision) throw new PlanningConflict(current);
    if (remove) { await tx.timeBlock.delete({ where: { id } }); return { deleted: true, id }; }
    if (!("changes" in input)) throw new PlanningInputError("Changes required");
    const { label, schedule, assignment } = input.changes;
    if (assignment) await linked(tx, workspaceId, assignment);
    return tx.timeBlock.update({ where: { id, revision: input.revision }, data: { ...(label !== undefined ? { label } : {}), ...assignment, ...(schedule ? { startAt: new Date(schedule.startAt), endAt: new Date(schedule.endAt), timeZone: schedule.timeZone } : {}), revision: { increment: 1 } }, include });
  });
}
export async function calendarPreferences(headers: Headers) {
  const session = await verifiedSession(headers); if (!session) throw new Unauthenticated();
  const workspaces = await accessibleWorkspaces(headers);
  const saved = await database().calendarPreference.findUnique({ where: { userId: session.user.id } });
  return { workspaces, workspaceIds: saved ? saved.workspaceIds.filter(id => workspaces.some(item => item.id === id)) : workspaces.filter(item => item.kind === "personal").map(item => item.id), timeZone: (await database().plannerPreference.findUnique({ where: { userId: session.user.id } }))?.timeZone ?? null };
}
export async function saveCalendarPreferences(headers: Headers, input: z.infer<typeof calendarPreferenceInput>) {
  const session = await verifiedSession(headers); if (!session) throw new Unauthenticated();
  const workspaces = await accessibleWorkspaces(headers);
  const workspaceIds = [...new Set(input.workspaceIds)];
  if (workspaceIds.some(id => !workspaces.some(item => item.id === id))) throw new WorkspaceDenied(404, "Workspace not found");
  await database().calendarPreference.upsert({ where: { userId: session.user.id }, create: { userId: session.user.id, workspaceIds, timeZone: input.timeZone ?? "UTC" }, update: { workspaceIds } });
  return { workspaceIds, timeZone: (await database().plannerPreference.findUnique({ where: { userId: session.user.id } }))?.timeZone ?? null };
}
