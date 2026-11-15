import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  post,
  personal,
  origin,
  drag,
  closedEditor,
  retained,
} from "./planner-helpers";
test.setTimeout(150000);
test.use({ actionTimeout: 15000 });
async function scope(page: Page, ws: string, key: string) {
  return (
    await (await page.request.get(`/api/workspaces/${ws}/task-order`)).json()
  ).find((s: { scopeKey: string }) => s.scopeKey === key);
}
async function setup(page: Page) {
  const ws = await personal(page),
    project = await post(page, `/api/workspaces/${ws.id}/projects`, {
      title: "Sibling project",
    }),
    roots = [];
  const tag = (
    await post(page, `/api/workspaces/${ws.id}/tags`, {
      name: "Important",
      color: "teal",
      requestKey: randomUUID(),
    })
  ).tag;
  for (const title of ["Order A", "Order B", "Order C"])
    roots.push(
      await post(page, `/api/workspaces/${ws.id}/tasks`, {
        title,
        projectId: project.id,
        tagIds: title === "Order A" ? [tag.id] : [],
      }),
    );
  const c1 = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Child A1",
      parentId: roots[0].id,
    }),
    c2 = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Child A2",
      parentId: roots[0].id,
    });
  await page.reload();
  await page
    .getByRole("button", {
      name: "Expand project: " + project.title,
      exact: true,
    })
    .click();
  return { ws, project, roots, c1, c2 };
}
const rowIds = (page: Page) =>
  page
    .getByRole("list", { name: "Project task order", exact: true })
    .first()
    .locator(":scope > li[data-order-task]")
    .evaluateAll((rows) =>
      rows.map((row) => (row as HTMLElement).dataset.orderTask),
    );

test("sibling moves and mouse handles persist only their own scope and keep canonical editors separate", async ({
  page,
  context,
  isMobile,
}) => {
  const { ws, project, roots, c1, c2 } = await setup(page);
  let statusOrSchedule = 0,
    orderWrites = 0;
  page.on("request", (r) => {
    if (r.method() !== "GET" && /time-blocks|\/status$/.test(r.url()))
      statusOrSchedule++;
    if (r.method() === "POST" && r.url().endsWith("/task-order")) orderWrites++;
  });
  const move = page.getByRole("button", {
    name: "Move down: Order A",
    exact: true,
  });
  if (isMobile) await move.tap();
  else await move.click();
  await expect
    .poll(() => rowIds(page))
    .toEqual([roots[1].id, roots[0].id, roots[2].id]);
  if (!isMobile) {
    const source = page.getByRole("button", {
        name: "Drag to reorder: Order C",
        exact: true,
      }),
      target = page.locator(`[data-order-target="${roots[1].id}"]`);
    await source.scrollIntoViewIfNeeded();
    const a = (await source.boundingBox())!,
      b = (await target.boundingBox())!;
    await drag(
      page,
      { x: a.x + 20, y: a.y + 20 },
      { x: b.x + 20, y: b.y + 20 },
    );
    await expect
      .poll(() => rowIds(page))
      .toEqual([roots[2].id, roots[1].id, roots[0].id]);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "Expand task: Order A", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Move down: Child A1", exact: true })
    .click();
  await expect
    .poll(async () => (await scope(page, ws.id, "task/" + roots[0].id)).ids)
    .toEqual([c2.id, c1.id]);
  await page
    .getByRole("button", { name: "Move up: Child A1", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => (await scope(page, ws.id, "task/" + roots[0].id)).ids)
    .toEqual([c1.id, c2.id]);
  if (!isMobile) {
    const before = orderWrites,
      source = page.getByRole("button", {
        name: "Drag to reorder: Order B",
        exact: true,
      }),
      target = page.locator(`[data-order-target="${c1.id}"]`);
    await source.scrollIntoViewIfNeeded();
    const a = (await source.boundingBox())!,
      b = (await target.boundingBox())!;
    await drag(
      page,
      { x: a.x + 20, y: a.y + 20 },
      { x: b.x + 20, y: b.y + 20 },
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(orderWrites).toBe(before);
    const handle = (await source.boundingBox())!;
    await page.mouse.move(handle.x + 20, handle.y + 20);
    await page.mouse.down();
    await page.mouse.move(handle.x + 45, handle.y + 40, { steps: 4 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(orderWrites).toBe(before);
  }
  const current = await scope(page, ws.id, "project/" + project.id);
  expect(statusOrSchedule).toBe(0);
  const second = await context.newPage();
  await second.goto("/projects");
  await second
    .getByRole("button", {
      name: "Expand project: " + project.title,
      exact: true,
    })
    .click();
  await expect.poll(() => rowIds(second)).toEqual(current.ids);
  await second.close();
  await page.getByRole("button", { name: "Order B", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Edit task", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await closedEditor(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("uncertain order receipts keep other drafts and cannot undo a later collaborator move", async ({
  page,
}) => {
  const { ws, project, roots } = await setup(page);
  await page.getByRole("button", { name: "Order A", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Keep work during ordering");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await page
    .getByLabel("New comment text", { exact: true })
    .fill("Keep comment during ordering");
  await page
    .getByRole("button", { name: "Add checklist", exact: true })
    .click();
  await page
    .getByLabel("Section name", { exact: true })
    .fill("Keep list during ordering");
  await retained(page);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    arrived = new Promise<void>((r) => (entered = r));
  await page.route("**/task-order", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    entered();
    await gate;
    await route.abort();
  });
  try {
    await page
      .getByRole("button", { name: "Move down: Order A", exact: true })
      .click();
    await arrived;
    await expect(
      page.getByRole("button", { name: "Move up: Order B", exact: true }),
    ).toBeDisabled();
    await page.getByRole("link", { name: "Board", exact: true }).click();
    await page
      .getByRole("button", { name: /^Review retained ordering:/ })
      .click();
    await expect(
      page
        .getByRole("dialog", { name: "Review sibling ordering", exact: true })
        .getByRole("button", { name: "Close editor", exact: true }),
    ).toBeDisabled();
    release();
    await expect(
      page.getByRole("button", {
        name: "Retry same ordering move",
        exact: true,
      }),
    ).toBeEnabled();
    await page.unroute("**/task-order");
    const after = await scope(page, ws.id, "project/" + project.id);
    expect(
      (
        await page.request.post(`/api/workspaces/${ws.id}/task-order`, {
          headers: { origin },
          data: {
            taskId: roots[2].id,
            beforeId: roots[1].id,
            revision: after.revision,
            requestKey: randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
    const latest = await scope(page, ws.id, "project/" + project.id);
    await page
      .getByRole("button", { name: "Retry same ordering move", exact: true })
      .click();
    await closedEditor(page);
    expect((await scope(page, ws.id, "project/" + project.id)).ids).toEqual(
      latest.ids,
    );
    await page
      .getByRole("button", {
        name: "Review comment draft: Order A",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Description", exact: true }),
    ).toHaveValue("Keep work during ordering");
    await expect(
      page.getByLabel("New comment text", { exact: true }),
    ).toHaveValue("Keep comment during ordering");
    await expect(page.getByLabel("Section name", { exact: true })).toHaveValue(
      "Keep list during ordering",
    );
    await retained(page);
  } finally {
    release?.();
  }
});

test("filtered or incomplete sibling views disable ordering and do not discard unrelated input", async ({
  page,
}) => {
  const { ws, project, roots } = await setup(page);
  const filter = page.getByRole("group", {
    name: "Task tag filters",
    exact: true,
  });
  await filter.getByRole("checkbox", { name: /^Important \(/ }).check();
  await expect(
    page.getByRole("button", { name: "Move down: Order A", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByText("Clear task filters to reorder the complete sibling list.", {
        exact: true,
      })
      .first(),
  ).toBeVisible();
  await filter
    .getByRole("button", { name: "Clear tag filters", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Move down: Order A", exact: true }),
  ).toBeEnabled();
  await page.route("**/task-order", async (route) => {
    const response = await route.fetch(),
      rows = await response.json();
    const root = rows.find(
      (s: { scopeKey: string }) => s.scopeKey === "project/" + project.id,
    );
    root.ids = root.ids.filter((id: string) => id !== roots[1].id);
    await route.fulfill({ response, json: rows });
  });
  await page
    .getByRole("button", { name: "Refresh planning", exact: true })
    .click();
  await expect(
    page.getByText(
      "Sibling order is incomplete. Refresh planning before reordering.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Move down: Order A", exact: true }),
  ).toBeDisabled();
  await page.unroute("**/task-order");
  await page
    .getByRole("button", { name: "Refresh planning", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Move down: Order A", exact: true }),
  ).toBeEnabled();
  const current = await scope(page, ws.id, "project/" + project.id);
  const newTask = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Concurrent sibling",
    projectId: project.id,
  });
  await page
    .getByRole("button", { name: "Move down: Order A", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Unconfirmed ordering", exact: true }),
  ).toContainText("sibling order changed");
  await page
    .getByRole("button", { name: "Refresh sibling order", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Discard ordering proposal", exact: true })
    .click();
  await expect.poll(() => rowIds(page)).toEqual([...current.ids, newTask.id]);
  expect((await scope(page, ws.id, "project/" + project.id)).ids).toEqual([
    ...current.ids,
    newTask.id,
  ]);
});
