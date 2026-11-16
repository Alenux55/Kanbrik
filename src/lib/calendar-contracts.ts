import { z } from "zod";
import { instant, validSchedule, validZone } from "./calendar-time";
const id = z.string().min(1).max(200);
const revision = z.number().int().min(1).max(2147483646);
export const zoneInput = z.string().max(100).refine(validZone, "Use a valid IANA zone");
export const scheduleInput = z.object({ startAt: z.string().max(60), endAt: z.string().max(60), timeZone: zoneInput }).strict().refine(validSchedule, "Invalid interval or zone/offset mismatch");
export const assignmentInput = z.object({ projectId: id.nullable(), taskId: id.nullable() }).strict().refine(value => !(value.projectId && value.taskId), "Choose one assignment");
export const createBlockInput = z.object({ requestKey: z.uuid(), label: z.string().trim().min(1).max(200), schedule: scheduleInput, assignment: assignmentInput }).strict();
export const editBlockInput = z.object({ revision, changes: z.object({ label: z.string().trim().min(1).max(200).optional(), schedule: scheduleInput.optional(), assignment: assignmentInput.optional() }).strict().refine(value => Object.keys(value).length > 0) }).strict();
export const deleteBlockInput = z.object({ revision }).strict();
export const calendarPreferenceInput = z.union([
  z
    .object({
      mode: z.literal("follow"),
      workspaceIds: z.array(id).max(0).optional(),
      timeZone: zoneInput.optional(),
    })
    .strict(),
  // The original API body remains an explicit custom selection.
  z
    .object({
      mode: z.literal("custom").optional(),
      workspaceIds: z.array(id),
      timeZone: zoneInput.optional(),
    })
    .strict(),
]);
export const rangeInput = z.object({ start: z.string().max(60), end: z.string().max(60) }).strict().refine(value => {
  const start = instant(value.start), end = instant(value.end);
  return !!start && !!end && end.toMillis() > start.toMillis() && end.toMillis() - start.toMillis() <= 93 * 86400000;
});
export type BlockRecord = { id: string; workspaceId: string; label: string; startAt: string; endAt: string; timeZone: string; projectId: string | null; taskId: string | null; revision: number; workInTrash?: boolean; project: { id: string; title: string;description?:string; trashed?: boolean } | null; task: { id: string; title: string; status: string; statusName?:string;completed?:boolean;workspaceId?:string;description?:string;projectId?:string|null;projectTitle?:string;parentTitle?:string;tags?:import("./tag-contracts").TagRecord[]; parentId: string | null; trashed?: boolean } | null };
