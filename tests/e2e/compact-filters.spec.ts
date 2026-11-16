import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { personal, post, origin, setZone } from "./planner-helpers";
import { picker, finishPicker } from "./filter-helpers";
import type { Page } from "@playwright/test";
test.setTimeout(150000);
test.use({ actionTimeout: 15000 });
const advanced = (page: Page) =>
  page.getByRole("button", { name: /^Advanced/ });
const clear = (page: Page) =>
  page.getByRole("button", { name: "Clear filters", exact: true });
const apply = (page: Page) =>
  page.getByRole("button", { name: "Apply filters", exact: true });

test("compact multi-pickers preserve hierarchy, keyboard/Back focus, ordering and account view memory", async ({
  page,
  isMobile,
}, info) => {
  const ws = await personal(page);
  await setZone(page, "America/Los_Angeles");
  const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Compact survey",
  });
  const empty = await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Empty survey",
  });
  const parent = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Context ancestor",
    projectId: project.id,
  });
  const tag = (
    await post(page, `/api/workspaces/${ws.id}/tags`, {
      name: "Long tag " + "W".repeat(50),
      color: "blue",
      requestKey: randomUUID(),
    })
  ).tag;
  for (let index = 0; index < 18; index++)
    await post(page, `/api/workspaces/${ws.id}/tags`, {
      name: "Picker choice " + index,
      color: "teal",
      requestKey: randomUUID(),
    });
  const child = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Matching child",
    parentId: parent.id,
    tagIds: [tag.id],
  });
  await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Other sibling",
    projectId: project.id,
  });
  await page.reload();
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      /\/(tasks|projects|time-blocks|task-order)(\/|$)/.test(
        new URL(request.url()).pathname,
      )
    )
      writes++;
  });
  const trigger = page.getByRole("button", { name: /^Project( \([0-9]+\))?$/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  let popup = page.getByRole("dialog", {
    name: "Project filters",
    exact: true,
  });
  await expect(popup.getByRole("textbox")).toBeFocused();
  await popup.getByLabel(project.title, { exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(popup.getByLabel(project.title, { exact: true })).toBeChecked();
  await popup.getByLabel(empty.title, { exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Project (2)", exact: true }),
  ).toBeVisible();
  popup = await picker(page, "Tags");
  await popup.getByRole("textbox").fill("Long tag");
  if (isMobile) await popup.getByRole("checkbox").tap();
  else await popup.getByRole("checkbox").check();
  const bounds = await popup.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await finishPicker(page);
  await expect(
    page.getByRole("button", { name: child.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: parent.title, exact: true }),
  ).toContainText("Context for matching subtasks");
  await expect(
    page.getByRole("button", {
      name: "Move down: Context ancestor",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByText("Matching tasks: 1 of 3 total.", { exact: false }),
  ).toBeVisible();
  const search = page.getByRole("textbox", {
    name: "Search project and task titles",
    exact: true,
  });
  await search.focus();
  await expect(search).toHaveAttribute(
    "placeholder",
    "Search project and task titles",
  );
  await search.fill("Matching");
  await advanced(page).click();
  await page.getByLabel("Created from", { exact: true }).fill("2030-06-04");
  await page.getByLabel("Created through", { exact: true }).fill("2030-06-03");
  await expect(apply(page)).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(search).toHaveValue("Matching");
  await picker(page, "Tags");
  await page.getByRole("link", { name: "Board", exact: true }).click();
  await expect(page).toHaveURL(/\/board$/);
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(search).toHaveValue("Matching");
  await picker(page, "Tags");
  await page.goBack();
  await expect(
    page.getByRole("dialog", { name: "Tags filters", exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/projects$/);
  await clear(page).click();
  await expect(
    page.getByRole("button", {
      name: "Move down: Context ancestor",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Expand project: " + project.title,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Move down: Context ancestor",
      exact: true,
    }),
  ).toBeEnabled();
  expect(writes).toBe(0);
  for (const appearance of ["light", "dark", "system"]) {
    expect(
      (
        await page.request.patch("/api/planner/preferences", {
          headers: { origin },
          data: { appearance },
        })
      ).status(),
    ).toBe(200);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    const choices = await picker(page, "Tags");
    expect(
      await choices
        .getByRole("group", { name: "Tags choices", exact: true })
        .evaluate((node) => node.scrollHeight > node.clientHeight),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/task022-${info.project.name}-projects-${appearance}.png`,
    });
    await finishPicker(page);
    if (appearance === "system") {
      await page
        .locator('[aria-label="Planner filters"]')
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `.local/task022-${info.project.name}-projects-closed.png`,
      });
    }
    for (const view of ["Board", "Calendar"]) {
      await page.getByRole("link", { name: view, exact: true }).click();
      await picker(page, "Tags");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `.local/task022-${info.project.name}-${view.toLowerCase()}-${appearance}.png`,
      });
      await finishPicker(page);
      if (appearance === "system") {
        await page
          .locator('[aria-label="Planner filters"]')
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `.local/task022-${info.project.name}-${view.toLowerCase()}-closed.png`,
        });
      }
    }
    await page.getByRole("link", { name: "Projects", exact: true }).click();
  }
});

test("Board Advanced uses two completed definitions, scopes safely, keeps failed proposals and clears only filters", async ({
  page,
  testWorkspaces,
}) => {
  const ws = await personal(page);
  const shared = await post(page, "/api/workspaces", {
    name: "Compact shared",
  });
  testWorkspaces.push(shared.id);
  for (const workspace of [ws, shared]) {
    const workflow = await (
      await page.request.get(`/api/workspaces/${workspace.id}/workflow`)
    ).json();
    const input = {
      revision: workflow.revision,
      defaultStatusId: workflow.defaultStatusId,
      definitions: workflow.definitions.map(
        (d: {
          id: string;
          name: string;
          completed: boolean;
          archivedAt: string | null;
        }) => ({
          id: d.id,
          name:
            d.id === "done"
              ? "Renamed complete"
              : d.id === "blocked"
                ? "Won't do"
                : d.name,
          completed: d.id === "done" || d.id === "blocked",
          archived: !!d.archivedAt,
        }),
      ),
      replacements: {},
    };
    const preview = await page.request.post(
      `/api/workspaces/${workspace.id}/workflow/preview`,
      { headers: { origin }, data: input },
    );
    expect(preview.status()).toBe(200);
    expect(
      (
        await page.request.post(`/api/workspaces/${workspace.id}/workflow`, {
          headers: { origin },
          data: {
            ...input,
            impactDigest: (await preview.json()).impactDigest,
            requestKey: randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
    for (const status of ["todo", "done", "blocked"])
      await post(page, `/api/workspaces/${workspace.id}/tasks`, {
        title: `${workspace.id}-${status}`,
        status,
      });
  }
  const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Scoped same name",
  });
  await post(page, `/api/workspaces/${shared.id}/projects`, {
    title: project.title,
  });
  await page.goto("/board");
  await expect(
    page.getByRole("checkbox", { name: "Hide completed", exact: true }),
  ).toHaveCount(0);
  await advanced(page).click();
  await page.getByLabel("Compact shared (shared)", { exact: true }).check();
  await apply(page).click();
  await expect(
    page.getByText("Matching tasks: 6 of 6 total.", { exact: false }),
  ).toBeVisible();
  await advanced(page).click();
  await page.getByLabel("Hide completed", { exact: true }).check();
  await page.route("**/api/board/preferences", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 503, json: { error: "fixture" } })
      : route.continue(),
  );
  await apply(page).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Filters not confirmed saved",
  );
  await expect(
    page.getByLabel("Hide completed", { exact: true }),
  ).toBeChecked();
  await page.unroute("**/api/board/preferences");
  await apply(page).click();
  await expect(
    page.getByText("Matching tasks: 2 of 6 total.", { exact: false }),
  ).toBeVisible();
  let popup = await picker(page, "Project");
  await expect(
    popup.getByRole("checkbox", { name: /Scoped same name/ }),
  ).toHaveCount(2);
  await popup
    .getByRole("checkbox", {
      name: `Scoped same name (${ws.name})`,
      exact: true,
    })
    .check();
  await finishPicker(page);
  await advanced(page).click();
  await page.getByLabel(`${ws.name} (personal)`, { exact: true }).uncheck();
  await apply(page).click();
  await expect(
    page.getByText("Some selections are unavailable in this scope.", {
      exact: false,
    }),
  ).toBeVisible();
  popup = await picker(page, "Project");
  await expect(
    popup.getByRole("checkbox", {
      name: `Scoped same name (${ws.name})`,
      exact: true,
    }),
  ).toHaveCount(0);
  await finishPicker(page);
  await clear(page).click();
  await expect(
    page.getByText("Matching tasks: 3 of 3 total.", { exact: false }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/board/preferences")).json())
      .workspaceIds,
  ).toEqual([shared.id]);
  const search = page.getByRole("textbox", {
    name: "Search task titles",
    exact: true,
  });
  await search.fill("no match");
  await advanced(page).click();
  await page.getByLabel("Hide completed", { exact: true }).check();
  await page.goBack();
  await expect(search).toHaveValue("no match");
  await expect(advanced(page)).toHaveText("Advanced");
});

test("Calendar Advanced cancels and retries independently of basic filters and Board scope", async ({
  page,
  testWorkspaces,
}) => {
  const ws = await personal(page),
    shared = await post(page, "/api/workspaces", { name: "Calendar compact" });
  testWorkspaces.push(shared.id);
  await post(page, `/api/workspaces/${shared.id}/projects`, {
    title: "Outside choice",
  });
  await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Inside choice",
  });
  expect(
    (
      await page.request.put("/api/calendar/preferences", {
        headers: { origin },
        data: { workspaceIds: [ws.id] },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch("/api/planner/preferences", {
        headers: { origin },
        data: { defaultWorkspaceId: shared.id },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/calendar");
  const search = page.getByRole("textbox", {
    name: "Search work and blocks",
    exact: true,
  });
  await search.fill("keep search");
  let popup = await picker(page, "Project");
  await expect(
    popup.getByRole("checkbox", { name: /^Outside choice/ }),
  ).toHaveCount(0);
  await finishPicker(page);
  await advanced(page).click();
  await page.getByLabel("Calendar compact (shared)", { exact: true }).check();
  await page
    .getByRole("combobox", { name: "Match selected tags", exact: true })
    .selectOption("all");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(search).toHaveValue("keep search");
  expect(
    (await (await page.request.get("/api/calendar/preferences")).json())
      .workspaceIds,
  ).toEqual([ws.id]);
  await expect(
    page.getByRole("button", { name: "Show creation workspace", exact: true }),
  ).toHaveCount(0);
  await advanced(page).click();
  await expect(
    page.getByRole("combobox", { name: "Match selected tags", exact: true }),
  ).toHaveValue("any");
  await page.getByLabel("Calendar compact (shared)", { exact: true }).uncheck();
  await apply(page).click();
  await expect(
    page.getByRole("dialog", {
      name: "Calendar advanced filters",
      exact: true,
    }),
  ).toHaveCount(0);
  await advanced(page).click();
  await page.getByLabel("Calendar compact (shared)", { exact: true }).check();
  await page.route("**/api/calendar/preferences", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 503, json: {} })
      : route.continue(),
  );
  await apply(page).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Preferences not saved",
  );
  await expect(
    page.getByLabel("Calendar compact (shared)", { exact: true }),
  ).toBeChecked();
  await page.unroute("**/api/calendar/preferences");
  let release!: () => void, arrived!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      arrived = resolve;
    });
  let saves = 0;
  await page.route("**/api/calendar/preferences", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    saves++;
    const response = await route.fetch();
    arrived();
    await held;
    await route.fulfill({ response });
  });
  try {
    await apply(page).click();
    await ready;
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Saving…", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Close editor", exact: true }),
    ).toBeDisabled();
    await page.goBack();
    await expect(
      page.getByRole("dialog", {
        name: "Calendar advanced filters",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", {
        name: "Search work and blocks",
        exact: true,
        includeHidden: true,
      }),
    ).toBeDisabled();
    release();
    await expect(
      page.getByRole("dialog", {
        name: "Calendar advanced filters",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(saves).toBe(1);
  } finally {
    release();
  }
  await page.unroute("**/api/calendar/preferences");
  await expect(search).toHaveValue("keep search");
  popup = await picker(page, "Project");
  await expect(
    popup.getByRole("checkbox", { name: /^Outside choice/ }),
  ).toBeVisible();
  await finishPicker(page);
  await clear(page).click();
  expect(
    (await (await page.request.get("/api/calendar/preferences")).json())
      .workspaceIds,
  ).toEqual([ws.id, shared.id]);
  expect(
    (await (await page.request.get("/api/board/preferences")).json())
      .workspaceIds,
  ).toEqual([ws.id]);
});

test("late tag choices cannot repopulate a new creation scope and failed pickers retry without clearing filters", async ({
  page,
  testWorkspaces,
}) => {
  const ws = await personal(page),
    shared = await post(page, "/api/workspaces", {
      name: "Fresh picker scope",
    });
  testWorkspaces.push(shared.id);
  for (const workspace of [ws, shared])
    await post(page, "/api/workspaces/" + workspace.id + "/tags", {
      name: workspace.id === ws.id ? "Obsolete choice" : "Fresh choice",
      color: "blue",
      requestKey: randomUUID(),
    });
  let release!: () => void, arrived!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      arrived = resolve;
    });
  await page.route("**/api/workspaces/" + ws.id + "/tags", async (route) => {
    const response = await route.fetch();
    arrived();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.reload();
    await ready;
    await page
      .getByRole("combobox", { name: "Creation workspace", exact: true })
      .selectOption(shared.id);
    await expect(
      page.getByText("Projects and tasks in Fresh picker scope.", {
        exact: false,
      }),
    ).toBeVisible();
    let popup = await picker(page, "Tags");
    await expect(
      popup.getByRole("checkbox", { name: /^Fresh choice/ }),
    ).toBeVisible();
    release();
    await expect(
      popup.getByRole("checkbox", { name: /^Obsolete choice/ }),
    ).toHaveCount(0);
    await popup.getByRole("checkbox", { name: /^Fresh choice/ }).check();
    await finishPicker(page);
    await page.route("**/api/workspaces/" + shared.id + "/tags", (route) =>
      route.fulfill({ status: 503, json: {} }),
    );
    await page
      .getByRole("button", { name: "Refresh planning", exact: true })
      .click();
    popup = await picker(page, "Tags");
    await expect(popup.getByRole("alert")).toContainText(
      "Tag choices incomplete",
    );
    await expect(
      page.getByRole("button", { name: "Tags (1)", exact: true }),
    ).toBeVisible();
    await finishPicker(page);
    await page.unroute("**/api/workspaces/" + shared.id + "/tags");
    await page
      .getByRole("button", { name: "Refresh planning", exact: true })
      .click();
    popup = await picker(page, "Tags");
    await expect(
      popup.getByRole("checkbox", { name: /^Fresh choice/ }),
    ).toBeChecked();
  } finally {
    release();
  }
});
