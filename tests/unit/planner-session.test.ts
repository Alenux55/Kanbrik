import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PlannerSession,
  SessionUnavailable,
} from "../../src/lib/planner-session";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const identity = (userId: string | null = "A") => Response.json({ userId });
afterEach(() => vi.unstubAllGlobals());

describe("planner verification ownership", () => {
  it.each([200, 401, 412])(
    "does not let an older %s read reopen a newer failed session gate",
    async (status) => {
      const body = deferred<Response>(),
        dispatched = deferred<void>();
      let probes = 0;
      const network = vi.fn(async (path: string) => {
        if (path === "/api/planner-session")
          return ++probes === 2
            ? new Response(null, { status: 503 })
            : identity();
        dispatched.resolve();
        return body.promise;
      });
      vi.stubGlobal("fetch", network);
      const session = new PlannerSession("A", vi.fn());
      const reading = session.fetch("/work");
      await dispatched.promise;
      session.revalidate();
      await session.verify(false);
      expect(session.getSnapshot().phase).toBe("error");
      body.resolve(Response.json({ title: "Older A read" }, { status }));
      await expect(reading).rejects.toBeInstanceOf(SessionUnavailable);
      expect(probes).toBe(2);
      expect(session.getSnapshot().phase).toBe("error");
      await expect(
        session.fetch("/work", { method: "PATCH" }),
      ).rejects.toBeInstanceOf(SessionUnavailable);
      expect(probes).toBe(2);
      session.revalidate();
      await session.verify(false);
      expect(session.getSnapshot().phase).toBe("ready");
      expect(probes).toBe(3);
    },
  );

  it("a superseded positive probe cannot lift a newer pending or failed verification", async () => {
    const old = deferred<Response>(),
      current = deferred<Response>();
    let probes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => (++probes === 1 ? old.promise : current.promise)),
    );
    const session = new PlannerSession("A", vi.fn());
    const earlier = session.verify();
    session.revalidate();
    const latest = session.verify(false);
    old.resolve(identity());
    await Promise.resolve();
    expect(session.getSnapshot().phase).toBe("checking");
    current.resolve(new Response(null, { status: 503 }));
    expect(await earlier).toBeNull();
    expect(await latest).toBeNull();
    expect(session.getSnapshot().phase).toBe("error");
    expect(probes).toBe(2);
  });

  it("verifies before dispatch and rejects an A body held across a B account change", async () => {
    const before = deferred<Response>(),
      body = deferred<Response>(),
      dispatched = deferred<void>();
    const changed = vi.fn();
    let probes = 0,
      writes = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, init: RequestInit) => {
        if (path === "/api/planner-session")
          return ++probes === 1 ? before.promise : identity("B");
        writes++;
        expect(new Headers(init.headers).get("X-Kanbrik-Account")).toBe("A");
        dispatched.resolve();
        return body.promise;
      }),
    );
    const session = new PlannerSession("A", changed),
      lease = session.capture();
    const writing = session.fetch("/work", { method: "PATCH" });
    expect(writes).toBe(0);
    before.resolve(identity());
    await dispatched.promise;
    session.revalidate();
    await session.verify(false);
    expect(changed).toHaveBeenCalledWith("B");
    expect(session.isCurrent(lease)).toBe(false);
    body.resolve(Response.json({ title: "A save" }));
    await expect(writing).rejects.toBeInstanceOf(SessionUnavailable);
    expect(writes).toBe(1);
  });
});
