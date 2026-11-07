import { describe, expect, it } from "vitest";
import { calendarRange, validSchedule, wallOptions } from "../../src/lib/calendar-time";
import { createBlockInput, editBlockInput, rangeInput } from "../../src/lib/calendar-contracts";

describe("calendar instants and local-time policy", () => {
  it("rejects spring gaps instead of silently normalizing them", () => {
    expect(wallOptions("2026-03-08T02:30", "America/Los_Angeles")).toEqual([]);
    expect(wallOptions("2026-02-30T12:00", "UTC")).toEqual([]);
    expect(wallOptions("2026-06-01T12:00", "invalid/zone")).toEqual([]);
  });
  it("offers both fall occurrences in chronological order with distinct offsets", () => {
    const choices = wallOptions("2026-11-01T01:30", "America/Los_Angeles");
    expect(choices.map(choice => choice.offset)).toEqual(["-07:00", "-08:00"]);
    expect(Date.parse(choices[1].iso) - Date.parse(choices[0].iso)).toBe(3600000);
    for (const choice of choices) expect(validSchedule({ startAt: choice.iso, endAt: "2026-11-01T03:00:00-08:00", timeZone: "America/Los_Angeles" })).toBe(true);
  });
  it("validates the zone's actual offset at each boundary", () => {
    expect(validSchedule({ startAt: "2026-03-08T01:30-08:00", endAt: "2026-03-08T03:30-07:00", timeZone: "America/Los_Angeles" })).toBe(true);
    for (const startAt of ["2026-03-08T02:30-08:00", "2026-03-08T02:30-07:00", "2026-03-08T10:30Z", "2026-03-08T01:30"]) {
      expect(validSchedule({ startAt, endAt: "2026-03-09T03:30-07:00", timeZone: "America/Los_Angeles" })).toBe(false);
    }
  });
  it("computes local day/week boundaries with 23/25 hour days", () => {
    const hours = (range: { start: string; end: string }) => (Date.parse(range.end) - Date.parse(range.start)) / 3600000;
    expect(hours(calendarRange("2026-03-08", "America/Los_Angeles", false))).toBe(23);
    expect(hours(calendarRange("2026-11-01", "America/Los_Angeles", false))).toBe(25);
    expect(hours(calendarRange("2026-03-08", "America/Los_Angeles", true))).toBe(167);
    expect(calendarRange("2026-03-08", "UTC", false).start).not.toBe(calendarRange("2026-03-08", "Asia/Tokyo", false).start);
  });
  it("keeps elapsed duration for ordinary, overnight and DST-spanning intervals regardless of host zone", () => {
    const previous = process.env.TZ;
    try {
      for (const host of ["UTC", "Asia/Tokyo", "America/New_York"]) {
        process.env.TZ = host;
        const start = wallOptions("2026-10-31T12:00", "America/Los_Angeles")[0].iso;
        const end = wallOptions("2026-11-02T15:00", "America/Los_Angeles")[0].iso;
        expect((Date.parse(end) - Date.parse(start)) / 3600000).toBe(52);
        expect(validSchedule({ startAt: start, endAt: end, timeZone: "America/Los_Angeles" })).toBe(true);
        expect(wallOptions("2026-06-01T12:00", "America/Los_Angeles")[0].iso).toBe("2026-06-01T12:00:00.000-07:00");
      }
    } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  });
  it("requires positive bounded ranges and strict nonempty change groups", () => {
    expect(rangeInput.safeParse({ start: "2026-01-01T00:00Z", end: "2026-04-04T00:00Z" }).success).toBe(true);
    for (const end of ["2026-04-05T00:00Z", "2026-01-01T00:00Z", "2026-01-02T00:00"]) expect(rangeInput.safeParse({ start: "2026-01-01T00:00Z", end }).success).toBe(false);
    for (const changes of [{}, { taskId: "task" }, { assignment: { projectId: "p", taskId: "t" } }, { schedule: { startAt: "2026-01-01T12:00Z" } }]) expect(editBlockInput.safeParse({ revision: 1, changes }).success).toBe(false);
    expect(editBlockInput.safeParse({ revision: 1, changes: { label: " Trimmed " } }).data?.changes.label).toBe("Trimmed");
    expect(createBlockInput.safeParse({}).success).toBe(false);
  });
});
