import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import {
  personal,
  post,
  origin,
  setZone,
  closedEditor,
} from "./planner-helpers";
import type { Page } from "@playwright/test";
test.setTimeout(150000);
test.use({ actionTimeout: 15000 });
async function advanced(page: Page) {
  await page.getByRole("button", { name: /^Advanced/ }).click();
  return page.getByRole("dialog", {
    name: "Calendar advanced filters",
    exact: true,
  });
}
async function apply(page: Page) {
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await closedEditor(page);
}
async function block(
  page: Page,
  workspaceId: string,
  label: string,
  projectId: string | null,
  taskId: string | null,
  hour = 12,
  day = "2030-06-03",
) {
  return post(page, `/api/workspaces/${workspaceId}/time-blocks`, {
    label,
    requestKey: randomUUID(),
    assignment: { projectId, taskId },
    schedule: {
      startAt: `${day}T${hour}:00Z`,
      endAt: `${day}T${hour + 1}:00Z`,
      timeZone: "UTC",
    },
  });
}

test("Follow creation, custom multi/empty scopes and explicit out-of-view creation stay distinct", async ({
  page,
  testWorkspaces,
}) => {
  const own = await personal(page),
    shared = await post(page, "/api/workspaces", { name: "Calendar selected" });
  testWorkspaces.push(shared.id);
  await setZone(page);
  const ownTask = await post(page, `/api/workspaces/${own.id}/tasks`, {
    title: "Personal palette",
  });
  const sharedTask = await post(page, `/api/workspaces/${shared.id}/tasks`, {
    title: "Selected palette",
  });
  await block(page, own.id, "Own block", null, ownTask.id);
  await block(page, shared.id, "Shared block", null, sharedTask.id);
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await expect(
    page.getByRole("button", {
      name: "Edit task: Personal palette",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Edit task: Selected palette",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Creation workspace", exact: true })
    .selectOption(shared.id);
  await expect(
    page.getByRole("button", {
      name: "Edit task: Selected palette",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Edit task: Personal palette",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByLabel("View", { exact: true }).selectOption("agenda");
  await expect(page.locator(".fc")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit block: Shared block", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit block: Own block", exact: true }),
  ).toHaveCount(0);
  let dialog = await advanced(page);
  await dialog
    .getByRole("radio", { name: "Selected workspaces", exact: true })
    .check();
  await dialog.getByLabel(`${own.name} (personal)`, { exact: true }).check();
  await apply(page);
  await page
    .getByRole("combobox", { name: "Creation workspace", exact: true })
    .selectOption(own.id);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/planner/preferences")).json())
          .defaultWorkspaceId,
    )
    .toBe(own.id);
  await expect(
    page.getByRole("button", {
      name: "Edit task: Selected palette",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  dialog = await advanced(page);
  await expect(
    dialog.getByRole("radio", { name: "Selected workspaces", exact: true }),
  ).toBeChecked();
  for (const checkbox of await dialog.getByRole("checkbox").all())
    await checkbox.uncheck();
  await apply(page);
  await expect(
    page.locator('[aria-label="Calendar work palette"]').getByRole("button"),
  ).toHaveCount(0);
  expect(
    (await (await page.request.get("/api/calendar/preferences")).json())
      .workspaceIds,
  ).toEqual([]);
  await page.getByRole("button", { name: "New block", exact: true }).click();
  const form = page.getByRole("form", {
    name: "Create time block",
    exact: true,
  });
  await form
    .getByLabel("Block label", { exact: true })
    .fill("Deliberately outside scope");
  await form
    .getByLabel("Assigned work", { exact: true })
    .selectOption(`task:${ownTask.id}`);
  await form.getByLabel("Start time", { exact: true }).fill("2030-06-03T16:00");
  await form.getByLabel("End time", { exact: true }).fill("2030-06-03T17:00");
  await form.getByRole("button", { name: "Create block", exact: true }).click();
  await closedEditor(page);
  await expect(
    page.getByText("Saved outside Calendar scope.", { exact: false }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/calendar/preferences")).json())
      .workspaceIds,
  ).toEqual([]);
  dialog = await advanced(page);
  await dialog
    .getByRole("radio", { name: "Follow creation workspace", exact: true })
    .check();
  await apply(page);
  await expect(
    page.getByRole("button", {
      name: "Edit task: Personal palette",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/board/preferences")).json())
      .workspaceIds,
  ).toEqual([own.id]);
  await expect(
    page.getByRole("button", { name: "Show creation workspace", exact: true }),
  ).toHaveCount(0);
});

test("project tints and compact Agenda agree with Board through themes and explicit keyboard/touch edits", async ({
  page,
  isMobile,
}, info) => {
  const own = await personal(page);
  await setZone(page);
  const project = await post(page, `/api/workspaces/${own.id}/projects`, {
    title: "Project color identity",
  });
  const task = await post(page, `/api/workspaces/${own.id}/tasks`, {
    title: "Colored parent",
    projectId: project.id,
  });
  const child = await post(page, `/api/workspaces/${own.id}/tasks`, {
    title: "Colored child",
    parentId: task.id,
  });
  const standalone = await post(page, `/api/workspaces/${own.id}/tasks`, {
    title: "Neutral work",
  });
  await block(page, own.id, "Reserved project label", project.id, null, 10);
  await block(page, own.id, "Reserved child label", null, child.id, 12);
  await block(page, own.id, "Neutral label", null, standalone.id, 14);
  await block(page, own.id, "Empty label", null, null, 16, "2030-06-04");
  for (const appearance of ["light", "dark", "system"]) {
    await page.emulateMedia({ colorScheme: "dark" });
    expect(
      (
        await page.request.patch("/api/planner/preferences", {
          headers: { origin },
          data: { appearance },
        })
      ).status(),
    ).toBe(200);
    await page.goto("/board");
    const boardColor = await page
      .getByRole("article", { name: task.title, exact: true })
      .getByRole("button")
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    await page.goto("/calendar");
    await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
    await page.getByLabel("View", { exact: true }).selectOption("agenda");
    const paletteColor = await page
      .getByRole("button", { name: `Edit task: ${task.title}`, exact: true })
      .locator("..")
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(paletteColor).toBe(boardColor);
    const agenda = page.getByRole("region", { name: "Agenda", exact: true });
    await expect(agenda.getByText(/^Mon 3 Jun ·/).first()).toBeVisible();
    await expect(agenda.getByText(/^Tue 4 Jun ·/)).toBeVisible();
    for (const label of await agenda
      .locator(`[data-project-id="${project.id}"]`)
      .all())
      expect(
        await label.evaluate((node) => getComputedStyle(node).backgroundColor),
      ).toBe(boardColor);
    expect(await agenda.locator('[data-project-id=""]').count()).toBe(2);
    await expect(
      page.getByText("Agenda and explicit controls", { exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await agenda.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.local/task023-${info.project.name}-${appearance}-agenda.png`,
    });
  }
  const edit = page.getByRole("button", {
    name: "Edit block: Reserved child label",
    exact: true,
  });
  if (isMobile) await edit.tap();
  else await edit.press("Enter");
  const form = page.getByRole("form", {
    name: "Edit time block Reserved child label",
    exact: true,
  });
  await expect(form.getByLabel("Assigned work", { exact: true })).toHaveValue(
    `task:${child.id}`,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await closedEditor(page);
  await page.getByLabel("View", { exact: true }).selectOption("day");
  const grid = page.getByRole("button", {
    name: "Edit block: Reserved child label",
    exact: true,
  });
  await grid.press("Enter");
  await expect(form).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("a held source hidden by a Follow scope change cannot preview or save after release", async ({
  page,
  isMobile,
  testWorkspaces,
}) => {
  test.skip(
    isMobile,
    "Held mouse only; explicit touch scheduling is verified separately",
  );
  const own = await personal(page),
    shared = await post(page, "/api/workspaces", {
      name: "New Follow destination",
    });
  testWorkspaces.push(shared.id);
  await setZone(page);
  const oldProject = await post(
    page,
    "/api/workspaces/" + own.id + "/projects",
    { title: "Old scoped source" },
  );
  await post(page, "/api/workspaces/" + shared.id + "/projects", {
    title: "New scoped source",
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByLabel("View", { exact: true }).selectOption("day");
  const grid = page.locator(".fc");
  await grid.scrollIntoViewIfNeeded();
  const row = grid.locator('.fc-timegrid-slot-lane[data-time="12:00:00"]');
  await row.evaluate((node) => {
    const scroller = node.closest<HTMLElement>(".fc-scroller")!;
    scroller.scrollTop +=
      node.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      150;
  });
  const lane = (await row.boundingBox())!,
    col = (await grid
      .locator('.fc-timegrid-col[data-date="2030-06-03"]')
      .boundingBox())!;
  const point = { x: col.x + col.width / 2, y: lane.y + lane.height * 0.75 };
  const source = (await page
    .getByRole("button", {
      name: "Edit project: " + oldProject.title,
      exact: true,
    })
    .boundingBox())!;
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/time-blocks"))
      writes++;
  });
  await page.mouse.move(source.x + 20, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(source.x + 35, source.y + 20);
  await page.mouse.move(point.x, point.y, { steps: 15 });
  await expect(page.locator("[data-calendar-drop-preview]")).toHaveAttribute(
    "data-drop-valid",
    "true",
  );
  await page
    .getByRole("combobox", { name: "Creation workspace", exact: true })
    .selectOption(shared.id);
  await expect(
    page.getByRole("button", {
      name: "Edit project: New scoped source",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Edit project: " + oldProject.title,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator("[data-calendar-drop-preview]")).toHaveCount(0);
  await page.mouse.move(point.x + 15, point.y + 15);
  await page.mouse.up();
  expect(writes).toBe(0);
  for (const workspaceId of [own.id, shared.id])
    expect(
      await (
        await page.request.get(
          "/api/workspaces/" +
            workspaceId +
            "/time-blocks?start=2030-06-03T00%3A00Z&end=2030-06-10T00%3A00Z",
        )
      ).json(),
    ).toEqual([]);
});

test("Trash tint, long labels, tag chips and overnight dates retain their canonical context", async ({
  page,
}, info) => {
  const ws = await personal(page);
  await setZone(page);
  const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Long project context " + "identity ".repeat(15),
  });
  const tag = (
    await post(page, `/api/workspaces/${ws.id}/tags`, {
      name: "Distinct tag with a longer visible label",
      color: "amber",
      requestKey: randomUUID(),
    })
  ).tag;
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Long assigned work " + "context ".repeat(16),
    projectId: project.id,
    tagIds: [tag.id],
  });
  const label = ("Preserved reservation " + "long label ".repeat(12)).trim();
  const saved = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
    label,
    requestKey: randomUUID(),
    assignment: { projectId: null, taskId: task.id },
    schedule: {
      startAt: "2030-06-03T23:45Z",
      endAt: "2030-06-04T00:45Z",
      timeZone: "UTC",
    },
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByLabel("View", { exact: true }).selectOption("agenda");
  const agenda = page.getByRole("region", { name: "Agenda", exact: true }),
    target = agenda.locator(`[data-block-id="${saved.id}"]`),
    colored = target.locator("[data-calendar-event-label]");
  await expect(colored).toHaveAttribute("data-project-id", project.id);
  await expect(colored).toContainText("23:45–00:45 (+1 day)");
  const full = await colored.getAttribute("aria-label");
  for (const fragment of [
    label,
    task.title,
    "03 Jun 2030",
    "04 Jun 2030",
    "+00:00",
    "UTC",
  ])
    expect(full).toContain(fragment);
  const tint = await colored.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  );
  await expect(agenda.getByText(tag.name, { exact: true })).toBeVisible();
  const impact = await (
    await page.request.post(`/api/workspaces/${ws.id}/trash/preview`, {
      headers: { origin },
      data: { kind: "project", id: project.id },
    })
  ).json();
  expect(
    (
      await page.request.post(`/api/workspaces/${ws.id}/trash`, {
        headers: { origin },
        data: {
          kind: "project",
          id: project.id,
          impactDigest: impact.impactDigest,
          requestKey: randomUUID(),
        },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Refresh calendar", exact: true })
    .click();
  await expect(colored).toContainText("Work in Trash");
  await expect(colored).toHaveAttribute("data-project-id", project.id);
  expect(
    await colored.evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe(tint);
  await expect(
    agenda.getByRole("link", {
      name: "Review workspace Trash / Restore",
      exact: true,
    }),
  ).toHaveAttribute("href", `/trash?workspaceId=${ws.id}`);
  await expect(agenda.getByText(tag.name, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const [unchanged] = await (
    await page.request.get(
      `/api/workspaces/${ws.id}/time-blocks?start=2030-06-03T00%3A00Z&end=2030-06-10T00%3A00Z`,
    )
  ).json();
  expect(unchanged).toMatchObject({
    id: saved.id,
    label,
    taskId: task.id,
    revision: saved.revision,
    startAt: saved.startAt,
    endAt: saved.endAt,
    workInTrash: true,
  });
  await agenda.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `.local/task023-${info.project.name}-trash-overnight.png`,
  });
});
