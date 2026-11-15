// DOM hit testing follows the rendered, scrolled time-grid. Foreground events
// always win, including occupied/foreign events; they cannot become blank slots.
export function calendarDropTarget(
  root: HTMLElement,
  x: number,
  y: number,
): { blockId: string } | { wall: string } | null {
  for (const element of document.elementsFromPoint(x, y)) {
    if (!root.contains(element)) continue;
    const event = element.closest<HTMLElement>("[data-block-id], .fc-event");
    if (event && root.contains(event)) {
      const id = event.dataset.blockId ?? event.dataset.calendarBlockId;
      return id ? { blockId: id } : null;
    }
  }
  const column = [
    ...root.querySelectorAll<HTMLElement>(".fc-timegrid-col[data-date]"),
  ].find((el) => {
    const r = visibleCalendarRect(el);
    return (
      !!r &&
      x >= r.left &&
      x < r.left + r.width &&
      y >= r.top &&
      y < r.top + r.height
    );
  });
  if (!column) return null;
  const clip = column
    .closest<HTMLElement>(".fc-scroller")
    ?.getBoundingClientRect();
  if (
    !clip ||
    x < clip.left ||
    x >= clip.right ||
    y < clip.top ||
    y >= clip.bottom
  )
    return null;
  const slot = [
    ...root.querySelectorAll<HTMLElement>(".fc-timegrid-slot-lane[data-time]"),
  ].find((el) => {
    const r = el.getBoundingClientRect();
    return y >= r.top && y < r.bottom;
  });
  if (!slot) return null;
  const rect = slot.getBoundingClientRect();
  const [hour, minute] = slot.dataset.time!.split(":").map(Number);
  const total = hour * 60 + minute + (y >= rect.top + rect.height / 2 ? 15 : 0);
  if (total >= 1440) return null;
  return {
    wall:
      column.dataset.date +
      "T" +
      String(Math.floor(total / 60)).padStart(2, "0") +
      ":" +
      String(total % 60).padStart(2, "0"),
  };
}

// Intersect every scroll/clip ancestor, including narrow week-view overflow.
export function visibleCalendarRect(element: HTMLElement) {
  let { left, top, right, bottom } = element.getBoundingClientRect();
  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(document.documentElement.clientWidth, right);
  bottom = Math.min(document.documentElement.clientHeight, bottom);
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent),
      r = parent.getBoundingClientRect();
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
      left = Math.max(left, r.left);
      right = Math.min(right, r.right);
    }
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    }
  }
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : null;
}
