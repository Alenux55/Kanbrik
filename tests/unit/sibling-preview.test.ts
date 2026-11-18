import { describe, expect, it, vi } from "vitest";
import { insertSibling, siblingInsertion } from "../../src/lib/sibling-preview";
import {
  PlannerDragGuard,
  NativeGestureLease,
} from "../../src/lib/planner-drag";

describe("transient sibling placement", () => {
  it("previews the owner's 1/3/2 example after the last sibling without changing canonical input", () => {
    const ids = ["1", "3", "2"];
    const index = siblingInsertion([25, 125], 140, 1);
    expect(insertSibling(ids, "3", index)).toEqual(["1", "2", "3"]);
    expect(ids).toEqual(["1", "3", "2"]);
  });
  it("handles first insertion and upward movement across variable-height rows", () => {
    expect(siblingInsertion([50, 300, 370], 20, 3)).toBe(0);
    expect(insertSibling(["a", "b", "c", "d"], "d", 0)).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });
  it("keeps a no-op placement and uses hysteresis across repeated midpoint crossings", () => {
    let index = 1;
    for (const y of [121, 124, 119, 125])
      index = siblingInsertion([25, 125], y, index);
    expect(index).toBe(1);
    index = siblingInsertion([25, 125], 132, index);
    expect(index).toBe(2);
    expect(siblingInsertion([25, 125], 122, index)).toBe(2);
    expect(siblingInsertion([25, 125], 118, index)).toBe(1);
    expect(insertSibling(["1", "3", "2"], "3", 1)).toEqual(["1", "3", "2"]);
  });
  it("supports a singleton without inventing another anchor", () => {
    expect(siblingInsertion([], 200, 0)).toBe(0);
    expect(insertSibling(["only"], "only", 0)).toEqual(["only"]);
  });
});

describe("gesture context ownership", () => {
  it("rejects an old native completion after cancellation or a newer press", () => {
    const lease = new NativeGestureLease();
    const old = lease.begin(),
      reply = new Event("touchend");
    lease.stamp(reply, old);
    expect(lease.owns(reply)).toBe(true);
    lease.invalidate();
    const current = lease.begin(),
      currentReply = new Event("touchend");
    lease.stamp(currentReply, current);
    expect(lease.owns(reply)).toBe(false);
    expect(lease.owns(undefined)).toBe(false);
    expect(lease.owns(currentReply)).toBe(true);
    lease.begin();
    expect(lease.owns(currentReply)).toBe(false);
  });
  it("retires a press when its scope or eligibility changes and preserves an unchanged scope", () => {
    const guard = new PlannerDragGuard(),
      cancel = vi.fn(),
      scope = {};
    guard.configure([scope, "filter"], () => true);
    guard.cancel = cancel;
    guard.configure([scope, "filter"], () => true);
    expect(cancel).not.toHaveBeenCalled();
    guard.configure([scope, "different"], () => true);
    expect(cancel).toHaveBeenCalledTimes(1);
    guard.configure([scope, "different"], () => false);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(guard.ready()).toBe(false);
  });
});
