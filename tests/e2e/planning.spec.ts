import { test, expect } from "./fixtures";
import {
  post,
  personal,
  retained,
  saved,
  origin,
  cleanClose,
} from "./planner-helpers";
test.setTimeout(90000);
test("hierarchy and canonical overlays create projects, tasks and subtasks with accessible dirty-close and pending guards", async ({
  page,
  isMobile,
}, info) => {
  const ws = await personal(page);
  expect(await page.getByLabel("Creation workspace").inputValue()).toBe(ws.id);
  await expect(
    page.getByRole("form", { name: "Create project", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "New project", exact: true }).click();
  const form = page.getByRole("form", { name: "Create project", exact: true });
  await expect(page.getByRole("dialog")).toHaveAccessibleName("Create project");
  await form.getByLabel("Title", { exact: true }).fill("Compact project");
  await form.getByLabel("Description").fill("Plain <b>text</b>");
  await expect(
    form.getByRole("button", { name: "Create project", exact: true }),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath("project-editor.png") });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Keep editing", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  if (isMobile) {
    await page.goBack();
    await expect(
      page.getByRole("button", { name: "Keep editing", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
  } else {
    await page.mouse.click(5, 5);
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
  }
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let attempts = 0;
  await page.route("**/api/workspaces/*/projects", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    await gate;
    await route.fulfill({
      status: 503,
      json: { error: "Save not confirmed. Input kept." },
    });
  });
  await form
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    form.getByRole("button", { name: "Saving…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Close editor" }),
  ).toBeDisabled();
  expect(attempts).toBe(1);
  release();
  await expect(form.getByRole("alert")).toContainText("not confirmed");
  await page.unroute("**/api/workspaces/*/projects");
  await form
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await saved(page);
  const expand = page.getByRole("button", {
    name: "Expand project: Compact project",
    exact: true,
  });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expand.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add task to Compact project", exact: true })
    .click();
  const task = page.getByRole("form", { name: "Create task", exact: true });
  await task.getByLabel("Title", { exact: true }).fill("Parent");
  await task.getByLabel("Status", { exact: true }).selectOption("done");
  await task.getByRole("button", { name: "Create task", exact: true }).click();
  await saved(page);
  await page
    .getByRole("button", { name: "Expand task: Parent", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add subtask to Parent", exact: true })
    .click();
  const child = page.getByRole("form", { name: "Create subtask", exact: true });
  await expect(child).toContainText("Parent: Parent");
  await child.getByLabel("Title", { exact: true }).fill("Child");
  await child.getByLabel("Status").selectOption("blocked");
  await child
    .getByRole("button", { name: "Create subtask", exact: true })
    .click();
  await saved(page);
  await page.getByRole("button", { name: "Child", exact: true }).click();
  await expect(
    page
      .getByRole("form", { name: "Edit subtask", exact: true })
      .getByLabel("Status"),
  ).toHaveValue("blocked");
  await cleanClose(page);
  const records = await (
    await page.request.get(`/api/workspaces/${ws.id}/tasks`)
  ).json();
  expect(
    records.find((t: { title: string }) => t.title === "Parent").status,
  ).toBe("done");
  expect(
    records.find((t: { title: string }) => t.title === "Child").parentId,
  ).toBe(records.find((t: { title: string }) => t.title === "Parent").id);
  await page
    .getByRole("button", { name: "Refresh planning", exact: true })
    .click();
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("button", { name: "Child", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("projects.png"),
    fullPage: true,
  });
});
test("one editor retains original revisions across Projects and Board, reviews conflicts and keeps workspace ownership", async ({
  page,
  testWorkspaces,
}) => {
  const ws = await personal(page);
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Canonical task",
    description: "Saved text",
  });
  await page
    .getByRole("button", { name: "Refresh planning", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Expand Standalone tasks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Canonical task", exact: true })
    .click();
  const edit = page.getByRole("form", { name: "Edit task", exact: true });
  await edit.getByLabel("Description").fill("Retained draft");
  await retained(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Board", exact: true })
    .click();
  await page
    .getByRole("article", { name: "Canonical task", exact: true })
    .getByRole("button")
    .click();
  await expect(edit.getByLabel("Description")).toHaveValue("Retained draft");
  expect(
    (
      await page.request.patch(`/api/workspaces/${ws.id}/tasks/${task.id}`, {
        headers: { origin },
        data: {
          title: task.title,
          description: "Newer server text",
          status: "todo",
          revision: 1,
        },
      })
    ).status(),
  ).toBe(200);
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    edit.getByRole("region", { name: "Saved version" }),
  ).toContainText("Newer server text");
  await expect(edit.getByLabel("Description")).toHaveValue("Retained draft");
  await expect(
    edit.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await edit
    .getByRole("button", {
      name: "Review complete: keep my draft",
      exact: true,
    })
    .click();
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await saved(page);
  const shared = await post(page, "/api/workspaces", {
    name: "Creation default",
  });
  testWorkspaces.push(shared.id);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Workspaces", exact: true })
    .click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await page.getByLabel("Creation workspace").selectOption(shared.id);
  await expect(
    page.getByText("Projects and tasks in Creation default.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await expect(
    page
      .getByRole("form", { name: "Create task", exact: true })
      .getByLabel("Destination workspace"),
  ).toHaveValue(shared.id);
  await cleanClose(page);
  expect(
    (
      await (
        await page.request.get(`/api/workspaces/${ws.id}/tasks/${task.id}`)
      ).json()
    ).workspaceId,
  ).toBe(ws.id);
  await page.reload();
  await expect(page.getByLabel("Creation workspace")).toHaveValue(shared.id);
});
