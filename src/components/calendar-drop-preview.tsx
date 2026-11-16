"use client";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
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
  const unavailable = preview.kind === "unavailable",
    viewportWidth = document.documentElement.clientWidth,
    viewportHeight = document.documentElement.clientHeight;
  const { rect } = preview,
    labelWidth = Math.min(430, viewportWidth - 16),
    left = Math.max(8, Math.min(rect.left, viewportWidth - labelWidth - 8)),
    above = rect.top >= 130,
    top = above
      ? rect.top - 8
      : Math.max(8, Math.min(rect.top + rect.height + 8, viewportHeight - 130));
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
      aria-label="Calendar drop preview"
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
          background: unavailable
            ? "var(--preview-unavailable)"
            : preview.review
              ? "var(--preview-review)"
              : "var(--preview-valid)",
        }}
      />
      <div
        data-calendar-drop-caption
        style={{
          position: "fixed",
          left,
          top,
          transform: above ? "translateY(-100%)" : undefined,
          width: labelWidth,
          maxHeight: above ? rect.top - 16 : viewportHeight - top - 8,
          zIndex: 1100,
          pointerEvents: "none",
          overflow: "hidden",
        }}
        className="break-words rounded border-2 border-neutral-800 bg-white p-2 text-sm font-semibold text-neutral-950 shadow"
      >
        {preview.label}
        {preview.clipped && (
          <span className="block">
            Highlight clipped; full interval shown above.
          </span>
        )}
      </div>
    </div>,
    document.querySelector<HTMLElement>("[data-session-state]")!,
  );
}
