import { DateTime } from "luxon";
import { wallOptions } from "./calendar-time";
import { calendarDropTarget, visibleCalendarRect } from "./calendar-hit";
import type { BlockRecord } from "./calendar-contracts";
export type Point = { x: number; y: number };
export type PreviewRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export function calendarDropTiming(wall: string, zone: string) {
  const options = wallOptions(wall, zone),
    first = options[0] ? DateTime.fromISO(options[0].iso) : null,
    end = first?.plus({ minutes: 60 }).setZone(zone);
  return {
    start: wall,
    end: end?.toFormat("yyyy-MM-dd'T'HH:mm") ?? wall,
    startChoice: options.length === 1 ? options[0].iso : "",
    endChoice:
      options.length === 1 && end!.getPossibleOffsets().length === 1
        ? end!.toISO()!
        : "",
    pointerDuration: 60 as const,
  };
}
export type DropCandidate = {
  sourceId: string;
  kind: "blank" | "block" | "unavailable";
  message?: string;
  workspaceId: string;
  wall?: string;
  block?: BlockRecord;
  start: string;
  end: string;
  review: boolean;
  label: string;
  rect: PreviewRect;
  clipped: boolean;
};
export function calendarWorkDrop({
  root,
  point,
  sourceId,
  workspaceId,
  workspaceName,
  zone,
  blocks,
  newBlocked,
  blockBlocked,
}: {
  root: HTMLElement;
  point: Point;
  sourceId: string;
  workspaceId: string;
  workspaceName: string;
  zone: string;
  blocks: BlockRecord[];
  newBlocked: boolean;
  blockBlocked: (block: BlockRecord) => boolean;
}): DropCandidate | null {
  const hit = calendarDropTarget(root, point.x, point.y);
  if (!hit) return null;
  if ("blockId" in hit) {
    const block = blocks.find((b) => b.id === hit.blockId);
    if (!block) return null;
    const message =
      block.workspaceId !== workspaceId || block.projectId || block.taskId
        ? "No assignment saved. Use an empty block in the same workspace, or explicitly replace its assignment in the form."
        : blockBlocked(block)
          ? "This block has a retained draft or pending save. Review it before a gesture."
          : undefined;
    const element = document
      .elementsFromPoint(point.x, point.y)
      .map((el) => el.closest<HTMLElement>("[data-block-id],.fc-event"))
      .find(
        (el) =>
          el &&
          root.contains(el) &&
          (el.dataset.blockId ?? el.dataset.calendarBlockId) === block.id,
      );
    if (!element) return null;
    const frame = element.closest<HTMLElement>(".fc-event") ?? element,
      rect = visibleCalendarRect(frame);
    if (!rect) return null;
    return {
      sourceId,
      kind: message ? "unavailable" : "block",
      message,
      workspaceId,
      block,
      start: block.startAt,
      end: block.endAt,
      review: false,
      label: message
        ? `Unavailable · ${message}`
        : `Assign empty block · ${workspaceName} · ${interval(block.startAt, block.endAt, zone)}`,
      rect,
      clipped: rect.height < frame.getBoundingClientRect().height - 1,
    };
  }
  const [date, time] = hit.wall.split("T"),
    column = [
      ...root.querySelectorAll<HTMLElement>(".fc-timegrid-col[data-date]"),
    ].find((el) => el.dataset.date === date);
  const [hour, minute] = time.split(":").map(Number),
    rowTime = `${String(hour).padStart(2, "0")}:${minute < 30 ? "00" : "30"}:00`,
    row = root.querySelector<HTMLElement>(
      `.fc-timegrid-slot-lane[data-time="${rowTime}"]`,
    );
  if (!column || !row) return null;
  const col = visibleCalendarRect(column);
  if (!col) return null;
  const timing = calendarDropTiming(hit.wall, zone),
    review = !timing.startChoice || !timing.endChoice;
  const lane = row.getBoundingClientRect(),
    top = lane.top + ((minute % 30) / 30) * lane.height;
  // Slats express wall time. An elapsed hour across a DST gap can span two
  // displayed clock hours; use the actual endpoint's rendered row when known.
  let bottom = top + lane.height * 2;
  if (!review) {
    const [endDate, endTime] = timing.end.split("T"),
      [endHour, endMinute] = endTime.split(":").map(Number);
    if (endDate === date) {
      const endRow = root.querySelector<HTMLElement>(
        `.fc-timegrid-slot-lane[data-time="${String(endHour).padStart(2, "0")}:${endMinute < 30 ? "00" : "30"}:00"]`,
      );
      if (endRow)
        bottom =
          endRow.getBoundingClientRect().top +
          ((endMinute % 30) / 30) * endRow.getBoundingClientRect().height;
    } else
      bottom =
        column.getBoundingClientRect().bottom +
        ((endHour * 60 + endMinute) / 30) * lane.height;
  }
  const rect = {
    left: col.left,
    top: Math.max(top, col.top),
    width: col.width,
    height: Math.max(
      0,
      Math.min(bottom, col.top + col.height) - Math.max(top, col.top),
    ),
  };
  if (!rect.height) return null;
  const label = review
    ? `Review local time before saving · ${workspaceName} · ${timing.start} → ${timing.end} · ${zone} · proposed 60 minutes; occurrence or valid-time choice required`
    : `New one-hour block · ${workspaceName} · ${interval(timing.startChoice, timing.endChoice, zone)}`;
  return {
    sourceId,
    kind: newBlocked ? "unavailable" : "blank",
    message: newBlocked
      ? "Review or discard the retained new-block intent before scheduling another."
      : undefined,
    workspaceId,
    wall: hit.wall,
    start: timing.startChoice || timing.start,
    end: timing.endChoice || timing.end,
    review,
    label: newBlocked
      ? "Unavailable · Review or discard the retained new-block intent before scheduling another."
      : label,
    rect,
    clipped: bottom > col.top + col.height + 1 || top < col.top - 1,
  };
}
function interval(start: string, end: string, zone: string) {
  return `${DateTime.fromISO(start).setZone(zone).toFormat("dd LLL yyyy HH:mm ZZ")} → ${DateTime.fromISO(end).setZone(zone).toFormat("dd LLL yyyy HH:mm ZZ")} · ${zone}`;
}
