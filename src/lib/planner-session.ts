"use client";
import { authClient } from "./auth-client";
import { expectedAccountHeader } from "./session-contract";

type Snapshot = { phase: "checking" | "ready" | "error" | "changing"; path: string };
export type SessionLease = { epoch: number; userId: string };
export class SessionUnavailable extends Error {
  constructor() { super("Session verification is required. Please retry the session check."); }
}

// One coordinator per mounted authenticated document, not a global identity or
// auth cache. Signals invalidate checks; only the server confirms an identity.
export class PlannerSession {
  private snapshot: Snapshot = { phase: "checking", path: "" };
  private listeners = new Set<() => void>();
  private invalidators = new Set<() => void>();
  private version = 0;
  private epoch = 0;
  private path = "";
  private leaving = false;
  private mounted = true;
  private controller = new AbortController();
  private flight?: { version: number; promise: Promise<SessionLease | null> };
  constructor(private userId: string, private changed: (userId: string | null) => void) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  onInvalidate = (listener: () => void) => { this.invalidators.add(listener); return () => { this.invalidators.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  isLeaving = () => this.leaving;
  capture = (): SessionLease => ({ epoch: this.epoch, userId: this.userId });
  dispose = () => { this.leaving = true; this.epoch++; this.controller.abort(); };
  attach = () => { this.mounted = true; };
  detach = () => {
    this.mounted = false;
    // Strict Mode reattaches immediately; a real unmount abandons this scope.
    queueMicrotask(() => { if (!this.mounted) this.dispose(); });
  };
  isCurrent = (lease: SessionLease) => this.mounted && !this.leaving && lease.epoch === this.epoch && lease.userId === this.userId;
  private phase(phase: Snapshot["phase"]) {
    this.snapshot = { phase, path: this.path };
    this.listeners.forEach(listener => listener());
  }
  invalidate = (userId: string | null) => {
    if (this.leaving) return;
    this.leaving = true; this.epoch++; this.phase("changing");
    this.controller.abort(); this.invalidators.forEach(listener => listener());
    if (this.mounted) this.changed(userId);
  };
  navigate = (path: string) => { this.path = path; this.revalidate(); };
  revalidate = () => {
    if (this.leaving) return;
    ++this.version; this.phase("checking"); void this.verify();
  };
  verify = (blocking = true): Promise<SessionLease | null> => {
    if (this.leaving) return Promise.resolve(null);
    if (blocking) this.phase("checking");
    const version = this.version;
    if (this.flight?.version === version) return this.flight.promise;
    const request = { version, promise: Promise.resolve(null) as Promise<SessionLease | null> };
    request.promise = (async () => {
      try {
        const result = await authClient.getSession({ query: { disableCookieCache: true }, fetchOptions: { cache: "no-store", signal: AbortSignal.timeout(10_000) } });
        if (this.leaving) return null;
        if (version !== this.version) return this.verify(false);
        if (result.error || result.data === undefined) throw new SessionUnavailable();
        const userId = result.data?.user.id ?? null;
        if (userId !== this.userId) { this.invalidate(userId); return null; }
        this.phase("ready"); return this.capture();
      } catch {
        if (this.leaving) return null;
        if (version !== this.version) return this.verify(false);
        this.phase("error"); return null;
      } finally { if (this.flight === request) this.flight = undefined; }
    })();
    this.flight = request;
    return request.promise;
  };
  fetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const mutation = init.method !== undefined && init.method !== "GET";
    const lease = await this.verify(mutation);
    if (!lease || !this.isCurrent(lease)) throw new SessionUnavailable();
    const headers = new Headers(init.headers); headers.set(expectedAccountHeader, lease.userId);
    const response = await fetch(path, { ...init, headers, cache: "no-store", signal: init.signal ? AbortSignal.any([this.controller.signal, init.signal]) : this.controller.signal });
    // Consume the network body before checking context. A held A-era response
    // must not later run callbacks against a newly authenticated document.
    const body = await response.arrayBuffer();
    if (!this.isCurrent(lease)) throw new SessionUnavailable();
    if (response.status === 401 || response.status === 412) this.revalidate();
    const current = await this.verify(false);
    if (!current || !this.isCurrent(lease)) throw new SessionUnavailable();
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
}
