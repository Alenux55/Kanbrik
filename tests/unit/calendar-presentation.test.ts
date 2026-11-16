import { describe, expect, it } from "vitest";
import { blockProjectId, eventText } from "../../src/lib/calendar-presentation";
import { calendarPreferenceInput } from "../../src/lib/calendar-contracts";
import type { BlockRecord } from "../../src/lib/calendar-contracts";
describe("Calendar scope compatibility and compact interval meaning", () => {
  it("keeps legacy arrays explicit, including empty, and rejects ambiguous follow bodies", () => {
    expect(calendarPreferenceInput.parse({ workspaceIds: [] })).toEqual({
      workspaceIds: [],
    });
    expect(calendarPreferenceInput.parse({ mode: "follow" })).toEqual({
      mode: "follow",
    });
    for (const body of [
      { mode: "follow", workspaceIds: ["x"] },
      { mode: "custom" },
      { mode: "other", workspaceIds: [] },
      { mode: "follow", userId: "forged" },
    ])
      expect(calendarPreferenceInput.safeParse(body).success).toBe(false);
  });
  it("derives color identity from canonical work, retaining Trash identity and neutral standalone", () => {
    const block = { projectId: "direct", task: null } as BlockRecord;
    expect(blockProjectId(block)).toBe("direct");
    expect(
      blockProjectId({
        ...block,
        task: { projectId: "parent-project" } as NonNullable<
          BlockRecord["task"]
        >,
      }),
    ).toBe("parent-project");
    expect(
      blockProjectId({
        ...block,
        task: { projectId: null } as NonNullable<BlockRecord["task"]>,
      }),
    ).toBeNull();
  });
  it("shares honest saved/preview text across midnight and DST without changing labels", () => {
    const overnight = eventText(
      "Retained block label",
      "Assigned project",
      "2030-06-03T23:45Z",
      "2030-06-04T00:45Z",
      "UTC",
    );
    expect(overnight.time).toBe("23:45–00:45 (+1 day)");
    expect(overnight.title).toBe("Retained block label");
    expect(overnight.work).toBe("Assigned project");
    expect(overnight.accessible).toContain("1 elapsed hours");
    const dst = eventText(
      "Work",
      "Work",
      "2030-11-03T01:30-07:00",
      "2030-11-03T01:30-08:00",
      "America/Los_Angeles",
    );
    expect(dst.work).toBe("");
    expect(dst.accessible).toContain("-07:00");
    expect(dst.accessible).toContain("-08:00");
    expect(dst.accessible).toContain("1 elapsed hours");
    expect(
      eventText(
        "Work",
        undefined,
        "2030-03-10T02:15",
        "2030-03-10T03:15",
        "America/Los_Angeles",
        true,
      ).accessible,
    ).toContain("Review time");
  });
});
