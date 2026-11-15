import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarDropTiming } from "../../src/lib/calendar-drop";
import {
  CalendarDropController,
  type DropScene,
} from "../../src/lib/calendar-drop-controller";
import type { DropCandidate } from "../../src/lib/calendar-drop";
import {
  matchesCalendarBlock,
  matchesCalendarWork,
} from "../../src/lib/calendar-filters";
import { emptyLabelFilter } from "../../src/lib/task-labels";
import type { TaskRecord } from "../../src/lib/planning-contracts";
import type { BlockRecord } from "../../src/lib/calendar-contracts";
afterEach(() => vi.unstubAllGlobals());
describe("Calendar drop timing and guarded presentation", () => {
  it("preserves one elapsed hour across dates and zone transitions while leaving folds/gaps for review", () => {
    const cross = calendarDropTiming("2030-06-03T23:45", "Europe/London");
    expect(cross.startChoice).toBe("2030-06-03T23:45:00.000+01:00");
    expect(cross.end).toBe("2030-06-04T00:45");
    expect(Date.parse(cross.endChoice) - Date.parse(cross.startChoice)).toBe(
      3600000,
    );
    const fold = calendarDropTiming("2030-11-03T01:45", "America/Los_Angeles");
    expect(fold.startChoice).toBe("");
    expect(fold.endChoice).toBe("");
    expect(fold.end).toBe("2030-11-03T01:45");
    const gap = calendarDropTiming("2030-03-10T02:15", "America/Los_Angeles");
    expect(gap.startChoice).toBe("");
    expect(gap.endChoice).toBe("");
    const beforeGap = calendarDropTiming(
      "2030-03-10T01:45",
      "America/Los_Angeles",
    );
    expect(beforeGap.end).toBe("2030-03-10T03:45");
    expect(
      Date.parse(beforeGap.endChoice) - Date.parse(beforeGap.startChoice),
    ).toBe(3600000);
  });
  it("keeps presentation and targeting on the same own-workspace/project/text predicate", () => {
    const tag = {
      id: "tag",
      workspaceId: "ws",
      name: "Visit",
      color: "teal",
      revision: 1,
      archivedAt: null,
    };
    const task = {
      id: "task",
      workspaceId: "ws",
      projectId: "p",
      parentId: "parent",
      title: "Child",
      description: "Survey",
      tags: [tag],
    } as TaskRecord;
    const filter = {
      ...emptyLabelFilter,
      tagIds: ["tag"],
      tagScopes: { tag: "ws" },
      projects: ["p"],
      search: "survey",
    };
    expect(
      matchesCalendarWork(
        {
          id: "task",
          kind: "task",
          title: "Child",
          context: "Blocked · Project · Subtask of Parent",
          searchContext: ["Project", "Parent"],
          record: task,
        },
        filter,
      ),
    ).toBe(true);
    const block = {
      workspaceId: "ws",
      projectId: null,
      label: "Reservation",
      task: { ...task, projectTitle: "Project", parentTitle: "Parent" },
      project: null,
    } as unknown as BlockRecord;
    expect(matchesCalendarBlock(block, filter)).toBe(true);
    const work = {
      id: "task",
      kind: "task" as const,
      title: task.title,
      context: "Blocked · Project · Subtask of Parent",
      searchContext: ["Project", "Parent"],
      record: task,
    };
    for (const search of ["Project", "Parent"]) {
      expect(matchesCalendarWork(work, { ...filter, search })).toBe(true);
      expect(matchesCalendarBlock(block, { ...filter, search })).toBe(true);
    }
    expect(matchesCalendarWork(work, { ...filter, search: "blocked" })).toBe(
      false,
    );
    expect(
      matchesCalendarBlock(
        { ...block, task: { ...block.task!, statusName: "Blocked" } },
        { ...filter, search: "blocked" },
      ),
    ).toBe(false);

    expect(matchesCalendarBlock({ ...block, task: null }, filter)).toBe(false);
    expect(
      matchesCalendarWork(
        {
          id: "task",
          kind: "task",
          title: "Child",
          context: "Blocked · Project · Subtask of Parent",
          searchContext: ["Project", "Parent"],
          record: { ...task, workspaceId: "other" },
        },
        filter,
      ),
    ).toBe(false);
    expect(
      matchesCalendarBlock(
        { ...block, task: null, label: "Survey" },
        { ...emptyLabelFilter, search: "survey" },
      ),
    ).toBe(true);
  });
  it("cannot publish an old frame or finish an invalidated context/session gesture", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let number = 0;
    vi.stubGlobal("document", {
      documentElement: { clientWidth: 1200, clientHeight: 800 },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
      frames.set(++number, f);
      return number;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    let ready = true;
    const context = {},
      filter = {},
      resolve = vi.fn(
        (sourceId: string) =>
          ({
            sourceId,
            kind: "blank",
            workspaceId: "ws",
            wall: "2030-06-03T12:00",
            start: "start",
            end: "end",
            review: false,
            label: sourceId,
            rect: { left: 1, top: 1, width: 20, height: 20 },
            clipped: false,
          }) as DropCandidate,
      ),
      scene: DropScene = { context, filter, ready: () => ready, resolve };
    const controller = new CalendarDropController(),
      detach = controller.attach();
    controller.configure(scene);
    controller.start("A", { x: 1, y: 2 });
    const old = frames.get(number)!;
    controller.cancel();
    controller.start("B", { x: 3, y: 4 });
    old(0);
    expect(resolve).not.toHaveBeenCalled();
    frames.get(number)!(0);
    expect(controller.getSnapshot()?.sourceId).toBe("B");
    controller.configure({ ...scene, filter: {} });
    expect(controller.getSnapshot()).toBeNull();
    expect(controller.finish(scene)).toBeNull();
    controller.configure(scene);
    controller.start("C", { x: 5, y: 6 });
    ready = false;
    frames.get(number)!(0);
    expect(controller.getSnapshot()).toBeNull();
    ready = true;
    expect(controller.finish(scene)).toBeNull();
    controller.start("D", { x: 7, y: 8 });
    expect(controller.finish(scene)?.sourceId).toBe("D");
    expect(controller.getSnapshot()).toBeNull();
    detach();
  });
});
