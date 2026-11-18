import type { Activators, SensorProps } from "@dnd-kit/core";
import type { Point } from "./calendar-drop";
import { scrollPlannerRegion } from "./planner-scroll";

export const dragActivation = {
  touchDelay: 350,
  tolerance: 8,
  mouseDistance: 8,
  hysteresis: 6,
};

// A library may finish an old mirror asynchronously, after another press began.
export class NativeGestureLease {
  private epoch = 0;
  private events = new WeakMap<Event, number>();
  begin = () => ++this.epoch;
  invalidate = () => {
    ++this.epoch;
  };
  stamp = (event: Event, token: number) => {
    this.events.set(event, token);
  };
  owns = (event?: Event) => !!event && this.events.get(event) === this.epoch;
}

export function eventPoint(event: Event): Point {
  if ("touches" in event) {
    const touch =
      (event as TouchEvent).touches[0] ??
      (event as TouchEvent).changedTouches[0];
    return { x: touch.clientX, y: touch.clientY };
  }
  return { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
}

// Gesture lifetime only. This is not an identity cache, saved order or mutation owner.
export class PlannerDragGuard {
  point: Point | null = null;
  start: Point | null = null;
  cancel: (() => void) | null = null;
  ready = () => false;
  private parts: unknown[] = [];
  configure(parts: unknown[], ready: () => boolean) {
    if (
      parts.length !== this.parts.length ||
      parts.some((part, i) => part !== this.parts[i])
    )
      this.cancel?.();
    this.parts = parts;
    this.ready = ready;
    if (!ready()) this.cancel?.();
  }
}

function eligible(target: EventTarget | null, node: HTMLElement | null) {
  if (!(target instanceof Element) || !node) return false;
  const activator = target.closest<HTMLElement>("[data-drag-activator]");
  if (!activator || !node.contains(activator) || node.closest("[inert]"))
    return false;
  // A nested row and its controls never activate an ancestor's sensor.
  if (
    activator.closest("[data-order-task]") !== node.closest("[data-order-task]")
  )
    return false;
  const control = target.closest(
    "button,a,input,textarea,select,summary,[data-no-drag],[contenteditable=true]",
  );
  return (
    !control || control === activator || control.hasAttribute("data-drag-edit")
  );
}

export type PlannerSensorOptions = {
  guard: PlannerDragGuard;
  scroll: "projects" | "board" | "calendar";
};

// Uses dnd-kit's public sensor lifecycle. Native touch scrolling is left alone
// until a stationary hold activates; every timer/listener belongs to this press.
export class PlannerSensor {
  autoScrollEnabled = false;
  private active = false;
  private finished = false;
  private moved = false;
  private touch: boolean;
  private start: Point;
  private source: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private frame = 0;
  private remove: (() => void)[] = [];
  constructor(private props: SensorProps<PlannerSensorOptions>) {
    this.touch = "touches" in props.event;
    this.start = eventPoint(props.event);
    this.source = props.activeNode.node.current!;
    document
      .querySelectorAll<HTMLDetailsElement>("details[data-drag-actions][open]")
      .forEach((menu) => {
        menu.open = false;
      });
    props.options.guard.cancel?.();
    props.options.guard.cancel = this.cancel;
    props.options.guard.point = this.start;
    props.options.guard.start = this.start;
    this.listen(document, this.touch ? "touchmove" : "mousemove", this.move, {
      passive: false,
    });
    this.listen(document, this.touch ? "touchend" : "mouseup", this.end);
    this.listen(document, "touchcancel", this.cancel);
    this.listen(document, "pointercancel", this.cancel);
    this.listen(
      document,
      "touchstart",
      (event) => {
        if ((event as TouchEvent).touches.length > 1) this.cancel();
      },
      true,
    );
    this.listen(
      document,
      "keydown",
      (event) => {
        if ((event as KeyboardEvent).key === "Escape") this.cancel();
      },
      true,
    );
    this.listen(
      document,
      "scroll",
      () => {
        if (!this.active) this.cancel();
      },
      true,
    );
    this.listen(document, "visibilitychange", this.cancel);
    this.listen(window, "resize", this.cancel);
    this.listen(window, "orientationchange", this.cancel);
    this.listen(window, "popstate", this.cancel);
    this.listen(window, "blur", this.cancel);
    this.listen(this.source, "dragstart", (event) => event.preventDefault());
    this.listen(this.source, "contextmenu", (event) => event.preventDefault());
    if (this.touch)
      this.timer = setTimeout(this.activate, dragActivation.touchDelay);
    this.frame = requestAnimationFrame(this.tick);
  }
  private listen(
    target: EventTarget,
    name: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions,
  ) {
    target.addEventListener(name, handler, options);
    this.remove.push(() => target.removeEventListener(name, handler, options));
  }
  private valid = () =>
    this.source.isConnected &&
    !this.source.closest("[inert]") &&
    this.props.options.guard.ready();
  private activate = () => {
    if (this.finished || !this.valid()) return this.cancel();
    this.active = true;
    this.source.dataset.gestureActive = "true";
    const selection = document.getSelection();
    if (selection?.anchorNode && this.source.contains(selection.anchorNode))
      selection.removeAllRanges();
    this.props.onStart(this.start);
  };
  private move = (event: Event) => {
    if (this.finished || !this.valid()) return this.cancel();
    if (this.touch && (event as TouchEvent).touches.length !== 1)
      return this.cancel();
    const point = eventPoint(event);
    this.props.options.guard.point = point;
    const distance = Math.hypot(point.x - this.start.x, point.y - this.start.y);
    this.moved ||= distance > dragActivation.tolerance;
    if (!this.active) {
      if (this.touch) {
        if (this.moved) this.cancel();
        return;
      }
      if (distance < dragActivation.mouseDistance) return;
      this.activate();
    }
    if (this.finished) return;
    if (event.cancelable) event.preventDefault();
    this.props.onMove(point);
  };
  private tick = () => {
    if (this.finished) return;
    if (!this.valid()) return this.cancel();
    if (this.active && this.props.options.guard.point)
      scrollPlannerRegion(
        this.props.options.guard.point,
        this.props.options.scroll,
      );
    this.frame = requestAnimationFrame(this.tick);
  };
  private suppressReleaseClick() {
    const click = (event: Event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") clear();
    };
    const clear = () => {
      clearTimeout(timeout);
      document.removeEventListener("click", click, true);
      document.removeEventListener("pointerdown", clear, true);
      document.removeEventListener("touchstart", clear, true);
      document.removeEventListener("keydown", key, true);
    };
    const timeout = setTimeout(clear, 800);
    document.addEventListener("click", click, true);
    document.addEventListener("pointerdown", clear, true);
    document.addEventListener("touchstart", clear, true);
    document.addEventListener("keydown", key, true);
  }
  private detach() {
    this.finished = true;
    clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
    this.remove.forEach((remove) => remove());
    delete this.source.dataset.gestureActive;
    if (this.props.options.guard.cancel === this.cancel)
      this.props.options.guard.cancel = null;
    if (this.active || this.moved) this.suppressReleaseClick();
    if (!this.active) this.props.onAbort(this.props.active);
  }
  private end = (event: Event) => {
    if (this.finished) return;
    if (!this.valid()) return this.cancel();
    this.props.options.guard.point = eventPoint(event);
    this.detach();
    this.props.onEnd();
  };
  private cancel = () => {
    if (this.finished) return;
    this.moved = true;
    this.detach();
    this.props.onCancel();
  };
  static activators: Activators<PlannerSensorOptions> = [
    {
      eventName: "onMouseDown",
      handler: ({ nativeEvent }, { guard }, { active }) =>
        nativeEvent.button === 0 &&
        guard.ready() &&
        eligible(nativeEvent.target, active.node.current),
    },
    {
      eventName: "onTouchStart",
      handler: ({ nativeEvent }, { guard }, { active }) =>
        nativeEvent.touches.length === 1 &&
        guard.ready() &&
        eligible(nativeEvent.target, active.node.current),
    },
  ];
  static setup() {
    const noop = () => {};
    window.addEventListener("touchmove", noop, { passive: false });
    return () => window.removeEventListener("touchmove", noop);
  }
}
