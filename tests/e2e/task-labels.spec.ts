import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import {
  post,
  personal,
  origin,
  openTask,
  cleanClose,
  closedEditor,
  retained,
  setZone,
} from "./planner-helpers";
test.setTimeout(150000);
test.use({ actionTimeout: 15000 });

test("Scoped custom tag filters compose across views without hiding child context or changing reservations", async ({
  page,
  testWorkspaces,
}) => {
  const ws = await personal(page);
  await setZone(page);
  const important = (
      await post(page, `/api/workspaces/${ws.id}/tags`, {
        name: "Important",
        color: "amber",
        requestKey: randomUUID(),
      })
    ).tag,
    urgentTag = (
      await post(page, `/api/workspaces/${ws.id}/tags`, {
        name: "Field visit",
        color: "sky",
        requestKey: randomUUID(),
      })
    ).tag;
  const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
      title: "Label project",
    }),
    parent = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Context parent",
      projectId: project.id,
    }),
    child = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Important child",
      parentId: parent.id,
      tagIds: [important.id],
    }),
    urgent = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Urgent only",
      projectId: project.id,
      tagIds: [urgentTag.id],
    }),
    both = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Both labels",
      projectId: project.id,
      tagIds: [important.id, urgentTag.id],
    });
  await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Neither label",
  });
  const unscheduled = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Unscheduled important",
    tagIds: [important.id],
  });
  const shared = await post(page, "/api/workspaces", { name: "Label shared" });
  testWorkspaces.push(shared.id);
  const sharedImportant = (
    await post(page, `/api/workspaces/${shared.id}/tags`, {
      name: "Important",
      color: "pink",
      requestKey: randomUUID(),
    })
  ).tag;
  const sharedTask = await post(page, `/api/workspaces/${shared.id}/tasks`, {
    title: "Shared important",
    tagIds: [sharedImportant.id],
  });
  for (const [index, assignment] of [
    { taskId: child.id, projectId: null },
    { taskId: child.id, projectId: null },
    { taskId: urgent.id, projectId: null },
    { taskId: both.id, projectId: null },
    { taskId: null, projectId: project.id },
    { taskId: null, projectId: null },
    { taskId: sharedTask.id, projectId: null },
  ].entries())
    await post(
      page,
      `/api/workspaces/${index === 6 ? shared.id : ws.id}/time-blocks`,
      {
        requestKey: randomUUID(),
        label: "Label reservation " + index,
        schedule: {
          startAt: `2030-06-03T${String(8 + index).padStart(2, "0")}:00Z`,
          endAt: `2030-06-03T${String(9 + index).padStart(2, "0")}:00Z`,
          timeZone: "UTC",
        },
        assignment,
      },
    );
  await page.reload();
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() !== "GET" && /\/tasks(?:\/|$)|time-blocks/.test(r.url()))
      writes++;
  });
  let filter = page.getByRole("group", {
    name: "Task tag filters",
    exact: true,
  });
  await filter
    .getByRole("checkbox", { name: /^Important \(/ })
    .first()
    .check();
  await expect(
    page.getByText("Matching tasks: 3 of 6 total.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: child.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: parent.title, exact: true }),
  ).toHaveAttribute("title", /Context for matching/);
  await expect(
    page.getByRole("button", { name: urgent.title, exact: true }),
  ).toHaveCount(0);
  await filter.getByRole("checkbox", { name: /^Field visit \(/ }).check();
  await expect(
    page.getByText("Matching tasks: 4 of 6 total.", { exact: false }),
  ).toBeVisible();
  await filter
    .getByRole("combobox", { name: "Match selected tags", exact: true })
    .selectOption("all");
  await expect(
    page.getByText("Matching tasks: 1 of 6 total.", { exact: false }),
  ).toBeVisible();
  await filter
    .getByRole("button", { name: "Clear tag filters", exact: true })
    .click();
  await page.getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("button", { name: /^Filters \(/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Board filters",
    exact: true,
  });
  await dialog.getByLabel("Label shared (shared)", { exact: true }).check();
  filter = dialog.getByRole("group", {
    name: "Task tag filters",
    exact: true,
  });
  await filter
    .getByRole("checkbox", { name: /^Important \(/ })
    .first()
    .check();
  await filter
    .getByRole("checkbox", { name: /^Important \(Label shared\)/ })
    .check();
  await dialog
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByText("Matching tasks: 4 of 7 total.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: sharedTask.title, exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.put("/api/calendar/preferences", {
        headers: { origin },
        data: { workspaceIds: [ws.id, shared.id] },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  filter = page.getByRole("group", { name: "Task tag filters", exact: true });
  await filter
    .getByRole("checkbox", { name: /^Important \(/ })
    .first()
    .check();
  await filter
    .getByRole("checkbox", { name: /^Important \(Label shared\)/ })
    .check();
  await expect(
    page.getByText("Matching Total blocks in range: 4 of 7 total", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Edit task: " + unscheduled.title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Edit project: " + project.title,
      exact: true,
    }),
  ).toHaveCount(0);
  await filter.getByRole("checkbox", { name: /^Field visit \(/ }).check();
  await expect(
    page.getByText("Matching Total blocks in range: 5 of 7 total", {
      exact: false,
    }),
  ).toBeVisible();
  await filter
    .getByRole("combobox", { name: "Match selected tags", exact: true })
    .selectOption("all");
  await expect(
    page.getByText("Matching Total blocks in range: 2 of 7 total", {
      exact: false,
    }),
  ).toBeVisible();
  await filter
    .getByRole("button", { name: "Clear tag filters", exact: true })
    .click();
  await expect(
    page.getByText("Total blocks in range: 7.", { exact: false }),
  ).toBeVisible();
  const search = page.getByRole("textbox", {
    name: "Search work and block labels",
    exact: true,
  });
  await search.fill("Context parent");
  await expect(
    page.getByText("Matching Total blocks in range: 2 of 7 total", {
      exact: false,
    }),
  ).toBeVisible();
  await search.fill("Label reservation 5");
  await expect(
    page.getByText("Matching Total blocks in range: 1 of 7 total", {
      exact: false,
    }),
  ).toBeVisible();
  const projectFilters = page.getByRole("group", {
    name: "Calendar project and text filters",
    exact: true,
  });
  await projectFilters
    .getByRole("checkbox", { name: /^Label project \(/ })
    .check();
  await expect(
    page.getByText("Matching Total blocks in range: 0 of 7 total", {
      exact: false,
    }),
  ).toBeVisible();
  await search.fill("Label project");
  await expect(
    page.getByText("Matching Total blocks in range: 5 of 7 total", {
      exact: false,
    }),
  ).toBeVisible();
  await projectFilters
    .getByRole("button", { name: "Clear Calendar filters", exact: true })
    .click();
  await expect(
    page.getByText("Total blocks in range: 7.", { exact: false }),
  ).toBeVisible();
  expect(writes).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("custom tag edits persist independently and filtered-out work/comment/list drafts remain reviewable", async ({
  page,
  context,
}) => {
  const ws = await personal(page),
    task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Editable labels",
    });
  const alpha = (
      await post(page, `/api/workspaces/${ws.id}/tags`, {
        name: "Site survey",
        color: "violet",
        requestKey: randomUUID(),
      })
    ).tag,
    beta = (
      await post(page, `/api/workspaces/${ws.id}/tags`, {
        name: "Follow up",
        color: "blue",
        requestKey: randomUUID(),
      })
    ).tag;
  await page.reload();
  await openTask(page, task.title);
  const form = page.getByRole("form", { name: "Edit task", exact: true });
  await form
    .getByRole("combobox", { name: "Find or create tag", exact: true })
    .fill("Site");
  await form
    .getByRole("option", { name: /Site survey/ })
    .getByRole("button")
    .click();
  await form
    .getByRole("combobox", { name: "Find or create tag", exact: true })
    .fill("Follow");
  await form
    .getByRole("combobox", { name: "Find or create tag", exact: true })
    .press("Enter");
  await form.getByRole("button", { name: "Save changes", exact: true }).click();
  await closedEditor(page);
  const saved = await (
    await page.request.get(`/api/workspaces/${ws.id}/tasks/${task.id}`)
  ).json();
  expect(saved).toMatchObject({
    tags: expect.arrayContaining([
      expect.objectContaining({ id: alpha.id }),
      expect.objectContaining({ id: beta.id }),
    ]),
    status: task.status,
    revision: 2,
  });
  await page.getByRole("button", { name: task.title, exact: true }).click();
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Keep filtered work");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await page
    .getByLabel("New comment text", { exact: true })
    .fill("Keep filtered comment");
  await page
    .getByRole("button", { name: "Add checklist", exact: true })
    .click();
  await page
    .getByLabel("Section name", { exact: true })
    .fill("Keep filtered list");
  await retained(page);
  await page.getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("button", { name: /^Filters \(/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Board filters",
    exact: true,
  });
  await dialog
    .getByLabel("Title search", { exact: true })
    .fill("No matching title");
  await dialog
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: task.title, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Review comment draft: " + task.title,
      exact: true,
    })
    .click();
  await expect(
    form.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Keep filtered work");
  await expect(
    page.getByLabel("New comment text", { exact: true }),
  ).toHaveValue("Keep filtered comment");
  await expect(page.getByLabel("Section name", { exact: true })).toHaveValue(
    "Keep filtered list",
  );
  await retained(page);
  const second = await context.newPage();
  await second.goto("/calendar");
  await second
    .getByRole("button", { name: "Edit task: " + task.title, exact: true })
    .click();
  await expect(
    second
      .getByRole("form", { name: "Edit task", exact: true })
      .getByRole("button", { name: "Remove Site survey", exact: true }),
  ).toBeVisible();
  await cleanClose(second);
  await second.close();
});

test("explicit tag creation offers shared colors and stable retry while preserving work and definition drafts", async ({
  page,
}) => {
  const ws = await personal(page),
    task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Tag authoring",
    });
  await page.reload();
  await openTask(page, task.title);
  const form = page.getByRole("form", { name: "Edit task", exact: true }),
    combo = form.getByRole("combobox", {
      name: "Find or create tag",
      exact: true,
    });
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Keep work while creating tag");
  let creates = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/tags")) creates++;
  });
  const name = "Custom survey " + "x".repeat(35);
  await combo.fill(name);
  expect(creates).toBe(0);
  await form
    .getByRole("button", { name: `Create tag “${name}”`, exact: true })
    .click();
  const definition = form.getByRole("region", {
    name: "Tag definition",
    exact: true,
  });
  for (const color of ["Teal", "Blue", "Violet", "Amber", "Pink", "Sky"]) {
    await definition
      .getByRole("radio", { name: new RegExp(`^${color}`) })
      .check();
    await expect(
      definition.getByRole("radio", { name: new RegExp(`^${color}`) }),
    ).toBeChecked();
  }
  await retained(page);
  await page
    .getByRole("button", {
      name: "Review retained input: new tag",
      exact: true,
    })
    .click();
  await expect(
    form.getByRole("textbox", { name: "Tag name", exact: true }),
  ).toHaveValue(name);
  let attempts = 0,
    releaseMetadata!: () => void;
  const metadataGate = new Promise<void>((resolve) => {
    releaseMetadata = resolve;
  });
  await page.route(`**/api/workspaces/${ws.id}/tags`, async (route) => {
    if (route.request().method() !== "POST") {
      if (attempts >= 2) await metadataGate;
      await route.continue();
      return;
    }
    attempts++;
    const response = await route.fetch();
    if (attempts === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  try {
    await form
      .getByRole("button", { name: "Save tag definition", exact: true })
      .click();
    await expect(
      form.getByRole("button", { name: "Retry tag save", exact: true }),
    ).toBeEnabled();
    await expect(
      form.getByRole("textbox", { name: "Tag name", exact: true }),
    ).toBeDisabled();
    await form
      .getByRole("button", { name: "Retry tag save", exact: true })
      .click();
    await expect(
      form.getByRole("region", { name: "Tag definition", exact: true }),
    ).toHaveCount(0);
    await combo.fill("survey");
    // Navigate while the authorized refresh is genuinely delayed and empty.
    // The selection must stay valid when suggestions arrive for this query.
    await combo.press("ArrowDown");
    await expect(
      form
        .getByRole("listbox", { name: "Tag suggestions", exact: true })
        .getByRole("option"),
    ).toHaveCount(0);
    releaseMetadata();
    await expect(
      form.getByRole("option", { name: new RegExp(`^${name} — Sky$`) }),
    ).toBeVisible();
    await combo.press("Enter");
    await expect(
      form.getByRole("button", { name: `Remove ${name}`, exact: true }),
    ).toBeVisible();
    await expect(
      form.getByRole("textbox", { name: "Description", exact: true }),
    ).toHaveValue("Keep work while creating tag");
    await form
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await closedEditor(page);
    const saved = await (
      await page.request.get(`/api/workspaces/${ws.id}/tasks/${task.id}`)
    ).json();
    expect(saved.tags).toHaveLength(1);
    expect(saved.tags[0]).toMatchObject({ name, color: "sky" });
    expect(saved.status).toBe(task.status);
    expect(creates).toBe(2);
    await page.getByRole("button", { name: task.title, exact: true }).click();
    await form.getByText("Manage workspace tags", { exact: true }).click();
    await form
      .getByRole("button", { name: `Edit tag ${name}`, exact: true })
      .click();
    await form
      .getByRole("textbox", { name: "Tag name", exact: true })
      .fill("Renamed survey");
    await form
      .getByRole("checkbox", { name: "Archived tag", exact: true })
      .check();
    await form.getByRole("radio", { name: /^Pink/ }).check();
    await form
      .getByRole("button", { name: "Save tag definition", exact: true })
      .click();
    await expect(
      form.getByRole("region", { name: "Tag definition", exact: true }),
    ).toHaveCount(0);
    await expect(
      form.getByText("Renamed survey (archived)", { exact: true }).first(),
    ).toBeVisible();
    await combo.fill("Renamed");
    await expect(
      form
        .getByRole("listbox", { name: "Tag suggestions", exact: true })
        .getByRole("option"),
    ).toHaveCount(0);
    await cleanClose(page);
    expect(
      (
        await (
          await page.request.get(`/api/workspaces/${ws.id}/tasks/${task.id}`)
        ).json()
      ).revision,
    ).toBe(saved.revision);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    releaseMetadata();
  }
});
