import { DateTime } from "luxon";
import type { BlockRecord } from "./calendar-contracts";
export function blockProjectId(block: Pick<BlockRecord, "task" | "projectId">) {
  return block.task ? (block.task.projectId ?? null) : block.projectId;
}
export function eventText(
  label: string,
  work: string | undefined,
  start: string,
  end: string,
  zone: string,
  review = false,
) {
  const a = DateTime.fromISO(start, { zone }).setZone(zone),
    b = DateTime.fromISO(end, { zone }).setZone(zone);
  const days =
    a.isValid && b.isValid
      ? Math.round(b.startOf("day").diff(a.startOf("day"), "days").days)
      : 0;
  const time = `${review ? start.slice(11, 16) : a.toFormat("HH:mm")}–${review ? end.slice(11, 16) : b.toFormat("HH:mm")}${days ? ` (+${days} ${days === 1 ? "day" : "days"})` : ""}`;
  return {
    title: label,
    work: work && work !== label ? work : "",
    time,
    accessible: review
      ? `${label} · ${work ?? ""} · ${start} → ${end} · ${zone} · Review time; occurrence or valid-time choice required`
      : `${label} · ${work ?? ""} · ${a.toFormat("dd LLL yyyy HH:mm ZZ")} → ${b.toFormat("dd LLL yyyy HH:mm ZZ")} · ${zone} · ${b.diff(a, "hours").hours} elapsed hours`,
  };
}
