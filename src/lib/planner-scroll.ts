import type { Point } from "./calendar-drop";

export type PlannerScrollRegion =
  "projects" | "board" | "calendar" | "calendar-event";

// One bounded step; the caller owns activation, readiness and the frame lifetime.
// Saved events scroll their Calendar pane only, never FullCalendar's window target.
export function scrollPlannerRegion(
  point: Point,
  mode: PlannerScrollRegion,
  root?: HTMLElement | null,
) {
  const hit = document.elementFromPoint(point.x, point.y);
  if (mode === "calendar-event" && (!hit || !root?.contains(hit))) return;
  let target = hit?.closest<HTMLElement>(
    mode === "calendar-event"
      ? ".fc-scroller"
      : "[data-drag-scroll],.fc-scroller",
  );
  if (mode === "calendar-event" && (!target || !root?.contains(target))) return;
  if (
    target &&
    target.scrollHeight <= target.clientHeight &&
    target.scrollWidth <= target.clientWidth
  )
    target = null;
  if (
    !target &&
    mode !== "board" &&
    mode !== "calendar-event" &&
    (mode !== "calendar" || hit?.closest("[data-calendar-gesture-region]"))
  )
    target = document.scrollingElement as HTMLElement;
  if (!target) return;
  const documentScroll = target === document.scrollingElement;
  const rect = documentScroll
    ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
    : target.getBoundingClientRect();
  const left = Math.max(0, rect.left),
    right = Math.min(innerWidth, rect.right),
    top = Math.max(0, rect.top),
    bottom = Math.min(innerHeight, rect.bottom);
  if (point.x < left || point.x > right || point.y < top || point.y > bottom)
    return;
  const speed = (value: number, min: number, max: number) =>
    Math.max(
      -12,
      Math.min(
        12,
        value < min + 35
          ? -Math.ceil((min + 35 - value) / 5)
          : value > max - 35
            ? Math.ceil((value - max + 35) / 5)
            : 0,
      ),
    );
  const axis = target.dataset.dragScroll;
  target.scrollBy(
    axis === "y" || documentScroll ? 0 : speed(point.x, left, right),
    axis === "x" ? 0 : speed(point.y, top, bottom),
  );
}
