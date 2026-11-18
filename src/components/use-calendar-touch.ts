"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { dragActivation, NativeGestureLease } from "@/lib/planner-drag";
import { scrollPlannerRegion } from "@/lib/planner-scroll";
import { usePlannerSession } from "./planner-session";

// FullCalendar owns saved-event touch dragging. Retire its pending timers by
// replacing only an interrupted grid, never the ordinary completed-save path.
export function useCalendarTouch({
  root,
  parts,
  enabled,
  active,
  canceled,
  suppressClick,
  onTap,
}: {
  root: RefObject<HTMLDivElement | null>;
  parts: unknown[];
  enabled: boolean;
  active: RefObject<boolean>;
  canceled: RefObject<boolean>;
  suppressClick: RefObject<boolean>;
  onTap: (id: string) => void;
}) {
  const session = usePlannerSession();
  const [revision, setRevision] = useState(0);
  const [lease] = useState(session.capture);
  const [native] = useState(() => new NativeGestureLease());
  const [presses] = useState(() => new WeakMap<Event, { moved: boolean }>());
  const state = useRef<{
    source: HTMLElement;
    x: number;
    y: number;
    point: { x: number; y: number };
    at: number;
    touch: boolean;
    moved: boolean;
    resize: boolean;
    token: number;
    selected: boolean;
    timer?: ReturnType<typeof setTimeout>;
  } | null>(null);
  const ended = useRef<{ token: number; moved: boolean } | null>(null);
  const tapHandler = useRef(onTap);
  const previous = useRef<unknown[]>([]);
  const ready = useRef<() => boolean>(() => false);
  const savedScroll = useRef<{
    x: number;
    y: number;
    panes: { top: number; left: number }[];
  } | null>(null);
  const retire = useRef((replace: boolean) => {
    void replace;
  });
  useLayoutEffect(() => {
    retire.current = (replace) => {
      native.invalidate();
      const press = state.current;
      if (!press) return;
      clearTimeout(press.timer);
      ended.current = press;
      state.current = null;
      canceled.current = true;
      suppressClick.current = true;
      active.current = false;
      if (replace) {
        savedScroll.current = {
          x: scrollX,
          y: scrollY,
          panes: [
            ...root.current!.querySelectorAll<HTMLElement>(".fc-scroller"),
          ].map((node) => ({ top: node.scrollTop, left: node.scrollLeft })),
        };
        setRevision((value) => value + 1);
      } else if (press.touch) {
        // v6 has no public cancelDrag API. Its native touchcancel listener
        // clears the pending delay; keep the real scroll target/stream intact.
        // Set the application cancellation guard before delivering that end.
        const touch = new Touch({
          identifier: 0,
          target: press.source,
          clientX: press.x,
          clientY: press.y,
          pageX: press.x + scrollX,
          pageY: press.y + scrollY,
        });
        press.source.dispatchEvent(
          new TouchEvent("touchcancel", {
            bubbles: true,
            changedTouches: [touch],
          }),
        );
      }
    };
    ready.current = () =>
      enabled &&
      session.isCurrent(lease) &&
      session.getSnapshot().phase === "ready" &&
      !document.querySelector("dialog[open]");
    tapHandler.current = onTap;
    if (
      parts.length !== previous.current.length ||
      parts.some((part, i) => part !== previous.current[i]) ||
      !ready.current()
    )
      retire.current(true);
    previous.current = parts;
  });
  useLayoutEffect(() => {
    const saved = savedScroll.current;
    if (!saved) return;
    root.current
      ?.querySelectorAll<HTMLElement>(".fc-scroller")
      .forEach((node, index) => {
        node.scrollTop = saved.panes[index]?.top ?? 0;
        node.scrollLeft = saved.panes[index]?.left ?? 0;
      });
    window.scrollTo(saved.x, saved.y);
    savedScroll.current = null;
  }, [revision, root]);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (
        state.current &&
        (!state.current.source.isConnected || !ready.current())
      )
        retire.current(true);
      if (state.current) {
        if (active.current && state.current.moved && !canceled.current)
          scrollPlannerRegion(
            state.current.point,
            "calendar-event",
            root.current,
          );
        frame = requestAnimationFrame(tick);
      }
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === "touch" && !event.isPrimary) {
        retire.current(true);
        return;
      }
      const source = (event.target as Element).closest<HTMLElement>(
        ".fc-event[data-calendar-block-id]",
      );
      if (!source || !root.current?.contains(source) || !ready.current())
        return;
      canceled.current = false;
      suppressClick.current = false;
      state.current = {
        source,
        x: event.clientX,
        y: event.clientY,
        point: { x: event.clientX, y: event.clientY },
        at: performance.now(),
        touch: event.pointerType === "touch",
        moved: false,
        resize: !!(event.target as Element).closest(".fc-event-resizer"),
        token: native.begin(),
        selected: source.classList.contains("fc-event-selected"),
      };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const move = (event: PointerEvent) => {
      const press = state.current;
      if (press) press.point = { x: event.clientX, y: event.clientY };
      if (
        press &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) >
          dragActivation.tolerance
      )
        press.moved = true;
      if (
        press?.touch &&
        !active.current &&
        performance.now() - press.at < dragActivation.touchDelay &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) >
          dragActivation.tolerance
      )
        retire.current(false);
    };
    const up = () => {
      const press = state.current;
      clearTimeout(press?.timer);
      if (press?.touch)
        suppressClick.current =
          press.resize ||
          press.moved ||
          performance.now() - press.at >= dragActivation.touchDelay;
      if (
        press?.touch &&
        !suppressClick.current &&
        ready.current() &&
        press.source.isConnected
      ) {
        const id = press.source.dataset.calendarBlockId!;
        retire.current(false);
        press.source.focus({ preventScroll: true });
        tapHandler.current(id);
        cancelAnimationFrame(frame);
        return;
      }
      if (press) ended.current = press;
      active.current = false;
      state.current = null;
      cancelAnimationFrame(frame);
    };
    const cancel = () => retire.current(true);
    const touchCancel = () => retire.current(active.current);
    const scroll = () => {
      if (state.current && !active.current) retire.current(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    const second = (event: TouchEvent) => {
      if (event.touches.length > 1) cancel();
    };
    const stamp = (event: Event) => {
      const press = state.current ?? ended.current;
      if (press) {
        native.stamp(event, press.token);
        presses.set(event, press);
      }
      const selected = state.current;
      if (
        event.type === "touchstart" &&
        event.isTrusted &&
        (event as TouchEvent).touches.length > 1 &&
        (event.target as Element).closest(".fc-event[data-calendar-block-id]")
      ) {
        cancel();
        event.stopPropagation();
      } else if (
        event.type === "touchstart" &&
        event.isTrusted &&
        selected?.touch &&
        selected.selected
      ) {
        // v6 otherwise skips its delay for an already selected event. Keep a
        // real pre-hold swipe native, then give its engine the qualified press.
        event.stopPropagation();
        const original = event as TouchEvent;
        selected.timer = setTimeout(() => {
          if (
            state.current !== selected ||
            !ready.current() ||
            !selected.source.isConnected
          ) {
            cancel();
            return;
          }
          const replay = new TouchEvent("touchstart", {
            bubbles: true,
            cancelable: true,
            touches: [...original.touches],
            targetTouches: [...original.targetTouches],
            changedTouches: [...original.changedTouches],
          });
          native.stamp(replay, selected.token);
          presses.set(replay, selected);
          original.target!.dispatchEvent(replay);
        }, dragActivation.touchDelay);
      }
      if (["mouseup", "touchend", "touchcancel"].includes(event.type))
        ended.current = null;
    };
    const unsubscribe = session.subscribe(() => {
      if (!ready.current()) cancel();
    });
    document.addEventListener("pointerdown", down, true);
    for (const type of [
      "mousedown",
      "mousemove",
      "mouseup",
      "touchstart",
      "touchmove",
      "touchend",
      "touchcancel",
    ])
      document.addEventListener(type, stamp, true);
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", touchCancel, true);
    document.addEventListener("touchcancel", touchCancel, true);
    document.addEventListener("touchstart", second, true);
    document.addEventListener("scroll", scroll, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", cancel);
    window.addEventListener("orientationchange", cancel);
    window.addEventListener("popstate", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      clearTimeout(state.current?.timer);
      state.current = null;
      ended.current = null;
      native.invalidate();
      for (const type of [
        "mousedown",
        "mousemove",
        "mouseup",
        "touchstart",
        "touchmove",
        "touchend",
        "touchcancel",
      ])
        document.removeEventListener(type, stamp, true);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", touchCancel, true);
      document.removeEventListener("touchcancel", touchCancel, true);
      document.removeEventListener("touchstart", second, true);
      document.removeEventListener("scroll", scroll, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("orientationchange", cancel);
      window.removeEventListener("popstate", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, [session, root, active, canceled, suppressClick, native, presses]);
  return {
    revision,
    owns: native.owns,
    moved: (event?: Event) =>
      !!event && native.owns(event) && presses.get(event)?.moved === true,
  };
}
