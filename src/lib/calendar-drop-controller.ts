import type { DropCandidate, Point } from "./calendar-drop";
export type DropScene = {
  context: unknown;
  filter: unknown;
  ready: () => boolean;
  resolve: (source: string, point: Point) => DropCandidate | null;
};
// Presentation-only controller. No network, drafts or save locks are owned here.
export class CalendarDropController {
  private scene: DropScene | null = null;
  private active: { source: string; context: unknown; filter: unknown } | null =
    null;
  private point: Point | null = null;
  private frame: number | null = null;
  private version = 0;
  private attached = false;
  private snapshot: DropCandidate | null = null;
  private signature = "";
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => null;
  configure = (scene: DropScene) => {
    this.scene = scene;
    if (
      this.active &&
      (this.active.context !== scene.context ||
        this.active.filter !== scene.filter ||
        !scene.ready())
    )
      this.cancel();
  };
  private publish(value: DropCandidate | null) {
    const signature = JSON.stringify([
      value,
      document.documentElement.clientWidth,
      document.documentElement.clientHeight,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.snapshot = value;
    this.listeners.forEach((listener) => listener());
  }
  private tick = (version: number) => {
    if (version !== this.version) return;
    this.frame = null;
    const active = this.active,
      scene = this.scene;
    if (!this.attached || !active || !scene) return;
    if (
      !scene.ready() ||
      active.context !== scene.context ||
      active.filter !== scene.filter
    ) {
      this.cancel();
      return;
    }
    this.publish(this.point ? scene.resolve(active.source, this.point) : null);
    this.frame = requestAnimationFrame(() => this.tick(version));
  };
  start = (source: string, point: Point) => {
    this.cancel();
    if (!this.attached || !this.scene?.ready()) return;
    this.point = this.point ?? point;
    this.active = {
      source,
      context: this.scene.context,
      filter: this.scene.filter,
    };
    const version = this.version;
    this.frame = requestAnimationFrame(() => this.tick(version));
  };
  finish = (scene: DropScene) => {
    const active = this.active,
      point = this.point;
    this.cancel();
    if (
      !active ||
      !point ||
      !scene.ready() ||
      active.context !== scene.context ||
      active.filter !== scene.filter
    )
      return null;
    return scene.resolve(active.source, point);
  };
  cancel = () => {
    this.version++;
    this.active = null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.publish(null);
  };
  private move = (event: MouseEvent) => {
    this.point = { x: event.clientX, y: event.clientY };
  };
  private leave = (event: MouseEvent) => {
    if (event.relatedTarget === null) {
      this.point = null;
      this.publish(null);
    }
  };
  private key = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.cancel();
  };
  attach = () => {
    this.attached = true;
    document.addEventListener("mousemove", this.move, { passive: true });
    document.addEventListener("mouseout", this.leave);
    document.addEventListener("keydown", this.key, true);
    window.addEventListener("blur", this.cancel);
    return () => {
      this.attached = false;
      this.cancel();
      document.removeEventListener("mousemove", this.move);
      document.removeEventListener("mouseout", this.leave);
      document.removeEventListener("keydown", this.key, true);
      window.removeEventListener("blur", this.cancel);
    };
  };
}
