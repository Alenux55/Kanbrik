import type { BlockRecord } from "./calendar-contracts";
import { DateTime } from "luxon";

export type CalendarDraft = {
  label: string; zone: string; start: string; end: string;
  startChoice: string; endChoice: string; assignment: string;
  revision: number; requestKey: string; dirty: boolean;
  uncertain?: "create" | "delete";
  conflict?: BlockRecord;
  base?: BlockRecord;
};

export function blockDraft(record: BlockRecord): CalendarDraft {
  const start = DateTime.fromISO(record.startAt).setZone(record.timeZone);
  const end = DateTime.fromISO(record.endAt).setZone(record.timeZone);
  return {
    label: record.label, zone: record.timeZone, start: start.toFormat("yyyy-MM-dd'T'HH:mm"), end: end.toFormat("yyyy-MM-dd'T'HH:mm"),
    startChoice: start.toISO()!, endChoice: end.toISO()!,
    assignment: record.projectId ? `project:${record.projectId}` : record.taskId ? `task:${record.taskId}` : "",
    revision: record.revision, requestKey: "", dirty: true,
    base: record,
  };
}
