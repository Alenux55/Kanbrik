import { describe, expect, it } from "vitest";
import {
  matchesProjectsTask,
  matchesProjectsProject,
  projectsFiltered,
  normalizeProjectsFilter,
} from "../../src/lib/projects-filters";
import {
  matchesBoard,
  emptyBoardFilters,
  dateBounds,
} from "../../src/lib/board-filters";
import { matchesCalendarBlock } from "../../src/lib/calendar-filters";
import { emptyLabelFilter } from "../../src/lib/task-labels";
import type {
  ProjectRecord,
  TaskRecord,
} from "../../src/lib/planning-contracts";
import type { BlockRecord } from "../../src/lib/calendar-contracts";
const project = { id: "p", title: "Survey", workspaceId: "w" } as ProjectRecord;
const parent = {
  id: "parent",
  title: "Parent",
  workspaceId: "w",
  projectId: "p",
  createdAt: "2030-03-09T12:00Z",
  updatedAt: "2030-03-09T12:00Z",
  tags: [],
} as unknown as TaskRecord;
const child = {
  ...parent,
  id: "child",
  parentId: "parent",
  title: "Visit",
  createdAt: "2030-03-11T06:59:59Z",
  updatedAt: "2030-03-11T07:00Z",
  tags: [{ id: "tag", workspaceId: "w" }],
} as TaskRecord;
describe("compact view filter contracts", () => {
  it("composes project/title/task restrictions without treating ancestry as another match", () => {
    const filter = {
      ...emptyLabelFilter,
      projects: ["p"],
      search: "visit",
      tagIds: ["tag"],
      tagScopes: { tag: "w" },
    };
    expect(matchesProjectsTask(child, filter, "UTC")).toBe(true);
    expect(matchesProjectsTask(parent, filter, "UTC")).toBe(false);
    expect(
      matchesProjectsProject(project, [parent, child], filter, "UTC"),
    ).toBe(true);
    expect(
      matchesProjectsProject(
        project,
        [parent, child],
        { ...filter, search: "Survey" },
        "UTC",
      ),
    ).toBe(false);
    expect(
      matchesProjectsProject(
        project,
        [],
        { ...emptyLabelFilter, search: "survey" },
        "UTC",
      ),
    ).toBe(true);
    expect(
      matchesProjectsProject(
        project,
        [],
        { ...emptyLabelFilter, projects: ["other"] },
        "UTC",
      ),
    ).toBe(false);
    expect(matchesProjectsProject(project, [], emptyLabelFilter, "UTC")).toBe(
      true,
    );
  });
  it("keeps child dates independent with inclusive viewing-zone DST days", () => {
    const filter = {
      ...emptyLabelFilter,
      createdFrom: "2030-03-10",
      createdTo: "2030-03-10",
    };
    expect(matchesProjectsTask(child, filter, "America/Los_Angeles")).toBe(
      true,
    );
    expect(matchesProjectsTask(parent, filter, "America/Los_Angeles")).toBe(
      false,
    );
    expect(
      matchesProjectsTask(
        child,
        { ...filter, editedTo: "2030-03-10" },
        "America/Los_Angeles",
      ),
    ).toBe(false);
    expect(matchesProjectsTask(child, filter, "UTC")).toBe(false);
    for (const from of ["bad", "2030-02-30", "2030-03-10T00:00Z"])
      expect(dateBounds(from, "", "UTC")).toBeNull();
    expect(dateBounds("2030-03-11", "2030-03-10", "UTC")).toBeNull();
  });
  it("treats every active Projects restriction as partial and converts old optional state without resetting it", () => {
    expect(projectsFiltered(emptyLabelFilter)).toBe(false);
    for (const restriction of [
      { projects: ["p"] },
      { tagIds: ["tag"] },
      { search: "text" },
      { createdFrom: "2030-01-01" },
      { editedTo: "2030-01-01" },
    ])
      expect(projectsFiltered({ ...emptyLabelFilter, ...restriction })).toBe(
        true,
      );
    const old = { tagIds: ["tag"], tagScopes: { tag: "w" }, matchAll: true };
    expect(matchesProjectsTask(child, old, "UTC")).toBe(true);
    expect(old.tagIds).toEqual(["tag"]);
    expect(normalizeProjectsFilter(old)).toEqual({
      ...old,
      projects: [],
      search: "",
      createdFrom: "",
      createdTo: "",
      editedFrom: "",
      editedTo: "",
    });
    expect(
      matchesProjectsTask(
        { ...child, projectId: null },
        { ...emptyLabelFilter, projects: ["standalone"] },
        "UTC",
      ),
    ).toBe(true);
  });
  it("uses workflow completion metadata across identities and names, never labels", () => {
    for (const status of ["done", "custom-wont-do", "renamed"]) {
      const task = {
        ...child,
        status,
        statusName: "Any label",
        completed: true,
      };
      expect(matchesBoard(task, emptyBoardFilters, "UTC")).toBe(true);
      expect(
        matchesBoard(task, { ...emptyBoardFilters, hideDone: true }, "UTC"),
      ).toBe(false);
    }
    expect(
      matchesBoard(
        { ...child, status: "done", statusName: "Done", completed: false },
        { ...emptyBoardFilters, hideDone: true },
        "UTC",
      ),
    ).toBe(true);
  });
  it("keeps own-workspace Any/All identities and excludes tagless Calendar reservations", () => {
    const filter = {
      ...emptyLabelFilter,
      tagIds: ["tag", "foreign"],
      tagScopes: { tag: "w", foreign: "elsewhere" },
      matchAll: true,
    };
    expect(matchesProjectsTask(child, filter, "UTC")).toBe(true);
    expect(
      matchesProjectsTask({ ...child, workspaceId: "other" }, filter, "UTC"),
    ).toBe(false);
    const block = {
      task: child,
      projectId: "p",
      project,
      label: "Visit",
    } as unknown as BlockRecord;
    expect(matchesCalendarBlock(block, filter)).toBe(true);
    expect(matchesCalendarBlock({ ...block, task: null }, filter)).toBe(false);
    expect(
      matchesCalendarBlock(
        { ...block, task: null, project: null, projectId: null },
        { ...emptyLabelFilter, search: "visit" },
      ),
    ).toBe(true);
  });
});
