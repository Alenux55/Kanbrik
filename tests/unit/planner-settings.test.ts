import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  dateBounds,
  matchesBoard,
  emptyBoardFilters,
  projectColor,
} from "../../src/lib/board-filters";
import { blockDraft, choosePointerStart } from "../../src/lib/calendar-draft";
import { wallOptions } from "../../src/lib/calendar-time";
import type { TaskRecord } from "../../src/lib/planning-contracts";
import type { BlockRecord } from "../../src/lib/calendar-contracts";
describe("user-zone filters and shared instant representations", () => {
  it("inclusive local dates span 23/25-hour DST days and exclude the next midnight", () => {
    const spring = dateBounds(
      "2030-03-10",
      "2030-03-10",
      "America/Los_Angeles",
    )!;
    expect((spring.end! - spring.start!) / 3600000).toBe(23);
    const fall = dateBounds("2030-11-03", "2030-11-03", "America/Los_Angeles")!;
    expect((fall.end! - fall.start!) / 3600000).toBe(25);
    const task = {
      projectId: null,
      status: "todo",
      title: "Work",
      createdAt: new Date(spring.end! - 1).toISOString(),
      updatedAt: new Date(spring.end!).toISOString(),
    } as TaskRecord;
    expect(
      matchesBoard(
        task,
        {
          ...emptyBoardFilters,
          createdFrom: "2030-03-10",
          createdTo: "2030-03-10",
        },
        "America/Los_Angeles",
      ),
    ).toBe(true);
    expect(
      matchesBoard(
        task,
        {
          ...emptyBoardFilters,
          editedFrom: "2030-03-10",
          editedTo: "2030-03-10",
        },
        "America/Los_Angeles",
      ),
    ).toBe(false);
    expect(dateBounds("2030-06-03", "2030-06-01", "UTC")).toBeNull();
  });
  it("preserves an instant across midnight, different DST schedules and two users' edit zones", () => {
    const record = {
      startAt: "2030-03-20T00:30:23.123Z",
      endAt: "2030-03-20T01:30:23.456Z",
      timeZone: "Asia/Tokyo",
      label: "Shared",
      revision: 7,
      projectId: null,
      taskId: null,
    } as BlockRecord;
    const a = blockDraft(record, "America/New_York"),
      b = blockDraft(record, "Europe/London");
    expect(a.start).toBe("2030-03-19T20:30");
    expect(b.start).toBe("2030-03-20T00:30");
    expect(a.end).toBe("2030-03-19T21:30");
    expect(b.end).toBe("2030-03-20T01:30");
    expect(Date.parse(a.endChoice)).toBe(Date.parse(b.endChoice));
    expect(Date.parse(a.endChoice)).toBe(Date.parse(record.endAt));
    expect(Date.parse(a.startChoice)).toBe(Date.parse(b.startChoice));
    expect(Date.parse(a.startChoice)).toBe(Date.parse(record.startAt));
    expect(a.base).toBe(record);
    expect(DateTime.fromISO(record.startAt).setZone("Asia/Tokyo").hour).toBe(9);
    expect(wallOptions("2030-03-10T02:30", "America/Los_Angeles")).toEqual([]);
    expect(wallOptions("2030-11-03T01:30", "America/Los_Angeles")).toHaveLength(
      2,
    );
  });
  it("retains a one-hour default after choosing the second repeated start", () => {
    const choices = wallOptions("2030-11-03T01:30", "America/Los_Angeles");
    const draft = {
      pointerDuration: 60 as const,
      zone: "America/Los_Angeles",
    } as import("../../src/lib/calendar-draft").CalendarDraft;
    const first = choosePointerStart(draft, choices[0].iso);
    expect(first.end).toBe("2030-11-03T01:30");
    expect(first.endChoice).toBe("");
    const second = choosePointerStart(draft, choices[1].iso);
    expect(second.end).toBe("2030-11-03T02:30");
    expect(Date.parse(second.endChoice!) - Date.parse(choices[1].iso)).toBe(
      3600000,
    );
  });
  it("uses stable project identity colors regardless of ordering", () => {
    const before = projectColor("a");
    ["b", "c", "new"].forEach(projectColor);
    expect(projectColor("a")).toBe(before);
    expect(projectColor(null)).toBe("#f5f5f5");
  });
});
