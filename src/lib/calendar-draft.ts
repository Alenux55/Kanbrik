import type { BlockRecord } from "./calendar-contracts";
import { DateTime } from "luxon";

export type CalendarDraft = {
  label: string;
  zone: string;
  start: string;
  end: string;
  startChoice: string;
  endChoice: string;
  assignment: string;
  revision: number;
  requestKey: string;
  dirty: boolean;
  uncertain?: "create" | "delete";
  pointerDuration?: 60;
  conflict?: BlockRecord;
  base?: BlockRecord;
};

// A repeated start chosen after a blank-slot drop still defaults to one elapsed
// hour. If that end is repeated too, the user must explicitly confirm it.
export function choosePointerStart(
  draft: CalendarDraft,
  iso: string,
): Partial<CalendarDraft> {
  if (!draft.pointerDuration || !iso) return { startChoice: iso };
  const end = DateTime.fromISO(iso, { setZone: true })
    .plus({ minutes: draft.pointerDuration })
    .setZone(draft.zone);
  return {
    startChoice: iso,
    end: end.toFormat("yyyy-MM-dd'T'HH:mm"),
    endChoice: end.getPossibleOffsets().length === 1 ? end.toISO()! : "",
  };
}

export function blockDraft(
  record: BlockRecord,
  zone = record.timeZone,
): CalendarDraft {
  const start = DateTime.fromISO(record.startAt).setZone(zone);
  const end = DateTime.fromISO(record.endAt).setZone(zone);
  return {
    label: record.label,
    zone,
    start: start.toFormat("yyyy-MM-dd'T'HH:mm"),
    end: end.toFormat("yyyy-MM-dd'T'HH:mm"),
    startChoice: start.toISO()!,
    endChoice: end.toISO()!,
    assignment: record.projectId
      ? `project:${record.projectId}`
      : record.taskId
        ? `task:${record.taskId}`
        : "",
    revision: record.revision,
    requestKey: "",
    dirty: true,
    base: record,
  };
}
