import { eventText } from "@/lib/calendar-presentation";
import { projectColor } from "@/lib/board-filters";
import { themedTint } from "@/lib/project-palette";
export function CalendarEventLabel({
  title,
  work,
  start,
  end,
  zone,
  projectId,
  review = false,
  unavailable = false,
}: {
  title: string;
  work?: string;
  start: string;
  end: string;
  zone: string;
  projectId: string | null;
  review?: boolean;
  unavailable?: boolean;
}) {
  const text = eventText(title, work, start, end, zone, review);
  return (
    <div
      data-calendar-event-label
      data-project-id={projectId ?? ""}
      title={text.accessible}
      aria-label={text.accessible}
      className="h-full min-h-0 min-w-0 overflow-hidden rounded px-1 text-xs text-neutral-950"
      style={{ backgroundColor: themedTint(projectColor(projectId)) }}
    >
      <span className="block truncate font-semibold">
        {unavailable ? "Unavailable" : review ? "Review time" : text.time}
      </span>
      <span className="block truncate font-semibold">{text.title}</span>
      {text.work && <span className="block truncate">{text.work}</span>}
    </div>
  );
}
