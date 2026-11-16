"use client";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { CalendarEventLabel } from "./calendar-event-label";
import { createPortal } from "react-dom";
import {
  CalendarDropController,
  type DropScene,
} from "@/lib/calendar-drop-controller";
import type { DropCandidate, Point } from "@/lib/calendar-drop";
import type { PlannerSession, SessionLease } from "@/lib/planner-session";
export function useCalendarDropPreview({
  root,
  session,
  lease,
  context,
  filter,
  resolve,
}: {
  root: RefObject<HTMLDivElement | null>;
  session: PlannerSession;
  lease: SessionLease;
  context: unknown;
  filter: unknown;
  resolve: (source: string, point: Point) => DropCandidate | null;
}) {
  const [controller] = useState(() => new CalendarDropController());
  const scene: DropScene = {
    context,
    filter,
    ready: () =>
      !!root.current &&
      session.isCurrent(lease) &&
      session.getSnapshot().phase === "ready" &&
      !document.querySelector("dialog[open]"),
    resolve,
  };
  useEffect(() => {
    controller.configure(scene);
  });
  useEffect(() => {
    const detach = controller.attach(),
      unsubscribe = session.subscribe(() => {
        if (
          session.getSnapshot().phase !== "ready" ||
          !session.isCurrent(lease)
        )
          controller.cancel();
      });
    return () => {
      unsubscribe();
      detach();
    };
  }, [controller, session, lease]);
  return { controller, scene };
}
export function CalendarDropPreview({
  controller,
}: {
  controller: CalendarDropController;
}) {
  const preview = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  if (!preview) return null;
  const unavailable = preview.kind === "unavailable";
  const { rect } = preview;
  return createPortal(
    <div
      data-calendar-drop-preview
      data-drop-kind={preview.kind}
      data-drop-valid={!unavailable && !preview.review}
      data-preview-start={preview.start}
      data-preview-end={preview.end}
      data-review-required={preview.review}
      data-clipped={preview.clipped}
      role="status"
      aria-label={"Calendar drop preview · " + preview.label}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        pointerEvents: "none",
      }}
    >
      <div
        data-calendar-drop-boundary
        style={{
          position: "fixed",
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          zIndex: 30,
          pointerEvents: "none",
          boxSizing: "border-box",
          border: `3px ${preview.review ? "dashed" : "solid"} ${unavailable ? "var(--error-text)" : preview.review ? "var(--warning-text)" : "var(--focus)"}`,
          overflow: "hidden",
        }}
      >
        <div data-calendar-drop-caption className="h-full overflow-hidden">
          <CalendarEventLabel
            title={preview.title ?? "Time block"}
            work={preview.workTitle}
            start={preview.start}
            end={preview.end}
            zone={preview.zone ?? "UTC"}
            projectId={preview.projectId ?? null}
            review={preview.review}
            unavailable={unavailable}
          />
        </div>
      </div>
      <span className="sr-only">
        {preview.label}
        {preview.clipped
          ? " · Highlight clipped; full interval available in this description."
          : ""}
      </span>
    </div>,
    document.querySelector<HTMLElement>("[data-session-state]")!,
  );
}

export function CalendarDragTitle({
  controller,
  title,
}: {
  controller: CalendarDropController;
  title: string;
}) {
  const preview = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  return preview ? null : (
    <div
      data-drag-preview
      className="max-w-[min(12rem,80vw)] truncate rounded border bg-white px-2 py-1 text-sm shadow"
    >
      {title}
    </div>
  );
}
