import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import {
  post,
  personal,
  origin,
  openTask,
  closedEditor,
  drag,
  retained,
} from "./planner-helpers";
test.setTimeout(150000);
test.use({ actionTimeout: 15000 });
async function configure(
  page: import("@playwright/test").Page,
  ws: string,
  edit: (value: Record<string, unknown>) => void,
) {
  const data = await (
      await page.request.get(`/api/workspaces/${ws}/workflow`)
    ).json(),
    input = {
      revision: data.revision,
      defaultStatusId: data.defaultStatusId,
      definitions: data.definitions.map(
        (d: {
          id: string;
          name: string;
          completed: boolean;
          archivedAt: string | null;
        }) => ({
          id: d.id,
          name: d.name,
          completed: d.completed,
          archived: !!d.archivedAt,
        }),
      ),
      replacements: {},
    };
  edit(input);
  const preview = await page.request.post(
    `/api/workspaces/${ws}/workflow/preview`,
    { headers: { origin }, data: input },
  );
  expect(preview.status()).toBe(200);
  const result = await page.request.post(`/api/workspaces/${ws}/workflow`, {
    headers: { origin },
    data: {
      ...input,
      impactDigest: (await preview.json()).impactDigest,
      requestKey: randomUUID(),
    },
  });
  expect(result.status()).toBe(200);
  return result.json();
}

test("owner configures workspace defaults and completion metadata without rewriting old status history", async ({
  page,
}) => {
  const ws = await personal(page),
    old = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Original completed work",
      status: "done",
    });
  await page.goto(`/workspaces/${ws.id}`);
  await page
    .getByRole("button", { name: "Configure task statuses", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Configure task statuses",
    exact: true,
  });
  await dialog
    .getByRole("region", { name: "Status definition: Done", exact: true })
    .getByLabel("Status name", { exact: true })
    .fill("Shipped");
  await dialog.getByRole("button", { name: "Add status", exact: true }).click();
  await dialog
    .getByRole("region", { name: "Status definition: New status", exact: true })
    .getByLabel("Status name", { exact: true })
    .fill("Ready");
  await dialog.getByRole("button", { name: "Add status", exact: true }).click();
  await dialog
    .getByRole("region", { name: "Status definition: New status", exact: true })
    .getByLabel("Status name", { exact: true })
    .fill("Verified");
  await dialog
    .getByRole("region", { name: "Status definition: Verified", exact: true })
    .getByLabel("Counts as completed", { exact: true })
    .check();
  await dialog
    .getByRole("combobox", { name: "Creation default", exact: true })
    .selectOption({ label: "Ready" });
  await dialog
    .getByRole("button", { name: "Preview workflow changes", exact: true })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Workflow impact", exact: true }),
  ).toContainText("0 active tasks");
  await dialog
    .getByRole("button", { name: "Confirm workflow changes", exact: true })
    .click();
  await closedEditor(page);
  const current = await (
      await page.request.get(`/api/workspaces/${ws.id}/workflow`)
    ).json(),
    ready = current.definitions.find(
      (d: { name: string }) => d.name === "Ready",
    ),
    verified = current.definitions.find(
      (d: { name: string }) => d.name === "Verified",
    );
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Uses workspace default",
  });
  expect(task).toMatchObject({
    status: ready.id,
    statusName: "Ready",
    completed: false,
  });
  await page.goto("/projects");
  await openTask(page, task.title);
  await expect(
    page.getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveValue(ready.id);
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption(verified.id);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await closedEditor(page);
  const history = await (
    await page.request.get(`/api/workspaces/${ws.id}/tasks/${old.id}/history`)
  ).json();
  expect(
    history.items[0].changes.find(
      (c: { field: string }) => c.field === "status",
    ).afterLabel,
  ).toBe("Done");
  expect(
    await (
      await page.request.get(`/api/workspaces/${ws.id}/tasks/${old.id}`)
    ).json(),
  ).toMatchObject({ statusName: "Shipped", completed: true, revision: 1 });
  await page.goto("/board");
  await expect(
    page.getByRole("region", { name: "Verified column", exact: true }),
  ).toContainText(task.title);
  await page.getByRole("button", { name: /^Filters \(/ }).click();
  await page
    .getByRole("checkbox", { name: "Hide completed", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("article", { name: task.title, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: old.title, exact: true }),
  ).toHaveCount(0);
});

test("retirement preserves independent editor input and Restore requires an explicit replacement", async ({
  page,
  context,
}) => {
  const ws = await personal(page),
    task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Retirement draft",
    }),
    trashed = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Retired Trash work",
    });
  const target = { kind: "task", id: trashed.id },
    preview = await (
      await page.request.post(`/api/workspaces/${ws.id}/trash/preview`, {
        headers: { origin },
        data: target,
      })
    ).json();
  const moved = await page.request.post(`/api/workspaces/${ws.id}/trash`, {
    headers: { origin },
    data: {
      ...target,
      impactDigest: preview.impactDigest,
      requestKey: randomUUID(),
    },
  });
  expect(moved.status()).toBe(200);
  await page.reload();
  await openTask(page, task.title);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Keep work through workflow change");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await page
    .getByLabel("New comment text", { exact: true })
    .fill("Keep comment through workflow change");
  await page
    .getByRole("button", { name: "Add checklist", exact: true })
    .click();
  await page
    .getByLabel("Section name", { exact: true })
    .fill("Keep list through workflow change");
  const settings = await context.newPage();
  await settings.goto(`/workspaces/${ws.id}`);
  await settings
    .getByRole("button", { name: "Configure task statuses", exact: true })
    .click();
  const dialog = settings.getByRole("dialog", {
    name: "Configure task statuses",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "Creation default", exact: true })
    .selectOption("backlog");
  const todo = dialog.getByRole("region", {
    name: "Status definition: To do",
    exact: true,
  });
  await todo.getByLabel("Retired", { exact: true }).check();
  await todo
    .getByRole("combobox", { name: "Replacement for To do", exact: true })
    .selectOption("blocked");
  await dialog
    .getByRole("button", { name: "Preview workflow changes", exact: true })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Workflow impact", exact: true }),
  ).toContainText("1 active tasks");
  await dialog
    .getByRole("button", { name: "Confirm workflow changes", exact: true })
    .click();
  await closedEditor(settings);
  await page.bringToFront();
  await page
    .getByRole("button", { name: "Refresh work context", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Keep work through workflow change");
  await expect(
    page.getByLabel("New comment text", { exact: true }),
  ).toHaveValue("Keep comment through workflow change");
  await expect(page.getByLabel("Section name", { exact: true })).toHaveValue(
    "Keep list through workflow change",
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Saved version", exact: true }),
  ).toContainText("Blocked");
  await retained(page);
  await settings.goto(`/trash?workspaceId=${ws.id}`);
  await settings.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    settings.getByRole("region", {
      name: "Restore status replacements",
      exact: true,
    }),
  ).toContainText("To do");
  await settings
    .getByRole("combobox", { name: "Replacement for To do", exact: true })
    .selectOption("backlog");
  await settings
    .getByRole("button", {
      name: "Confirm Restore with replacements",
      exact: true,
    })
    .click();
  await expect(
    settings.getByRole("article", {
      name: "Trash operation: Retired Trash work",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect
    .poll(async () =>
      (
        await settings.request.get(
          `/api/workspaces/${ws.id}/tasks/${trashed.id}`,
        )
      ).status(),
    )
    .toBe(200);
  expect(
    await (
      await settings.request.get(`/api/workspaces/${ws.id}/tasks/${trashed.id}`)
    ).json(),
  ).toMatchObject({ id: trashed.id, status: "backlog", revision: 3 });
  await settings.close();
});

test("uncertain workflow saves reconcile receipts and editors cannot configure shared statuses", async ({
  page,
  browser,
  isMobile,
  testAccounts,
  testWorkspaces,
}) => {
  const ws = await personal(page);
  await page.goto(`/workspaces/${ws.id}`);
  await page
    .getByRole("button", { name: "Configure task statuses", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Configure task statuses",
    exact: true,
  });
  await dialog
    .getByRole("region", { name: "Status definition: Blocked", exact: true })
    .getByLabel("Status name", { exact: true })
    .fill("Waiting");
  await dialog
    .getByRole("button", { name: "Preview workflow changes", exact: true })
    .click();
  await expect(
    dialog.getByRole("region", { name: "Workflow impact", exact: true }),
  ).toBeVisible();
  await page.route("**/workflow", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort();
  });
  await dialog
    .getByRole("button", { name: "Confirm workflow changes", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Retry same workflow save",
      exact: true,
    }),
  ).toBeEnabled();
  await page.unroute("**/workflow");
  await configure(page, ws.id, (input) => {
    const definitions = input.definitions as { id: string; name: string }[];
    definitions.find((d) => d.id === "blocked")!.name = "Later member edit";
  });
  await dialog
    .getByRole("button", { name: "Retry same workflow save", exact: true })
    .click();
  await closedEditor(page);
  await expect(
    page.getByRole("region", { name: "Workspace task workflow", exact: true }),
  ).toContainText("Later member edit");
  const shared = await post(page, "/api/workspaces", {
    name: "Editor workflow limits",
  });
  testWorkspaces.push(shared.id);
  const foreignCard = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Foreign column protection",
    status: "done",
  });
  expect(
    (
      await page.request.put("/api/board/preferences", {
        headers: { origin },
        data: { workspaceIds: [ws.id, shared.id] },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/board");
  let statusWrites = 0;
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().endsWith("/status")) statusWrites++;
  });
  if (!isMobile) {
    const source = page
        .getByRole("article", { name: foreignCard.title, exact: true })
        .getByRole("button"),
      target = page
        .getByRole("region", {
          name: "Workspace workflow: Editor workflow limits",
          exact: true,
        })
        .getByRole("region", { name: "Backlog column", exact: true });
    await target.scrollIntoViewIfNeeded();
    const from = (await source.boundingBox())!,
      to = (await target.boundingBox())!;
    await drag(
      page,
      { x: from.x + from.width / 2, y: from.y + 20 },
      { x: to.x + to.width / 2, y: to.y + 100 },
    );
    await expect(
      page.getByText(
        "A task can only move within its own workspace workflow. Nothing was changed.",
        { exact: true },
      ),
    ).toBeVisible();
  }
  expect(statusWrites).toBe(0);
  expect(
    await (
      await page.request.get(`/api/workspaces/${ws.id}/tasks/${foreignCard.id}`)
    ).json(),
  ).toMatchObject({ status: "done", revision: 1, workspaceId: ws.id });
  const email = randomUUID() + "@example.invalid";
  testAccounts.push(email);
  const member = await browser.newContext({
    baseURL: origin,
    viewport: isMobile
      ? { width: 393, height: 851 }
      : { width: 1280, height: 800 },
    isMobile,
    hasTouch: isMobile,
  });
  try {
    expect(
      (
        await member.request.post("/api/auth/sign-up/email", {
          headers: { origin },
          data: {
            name: "Workflow editor",
            email,
            password: randomUUID() + randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(`/api/workspaces/${shared.id}/members`, {
          headers: { origin },
          data: { email },
        })
      ).status(),
    ).toBe(200);
    const other = await member.newPage();
    await other.goto(`/workspaces/${shared.id}`);
    await expect(
      other.getByRole("region", {
        name: "Workspace task workflow",
        exact: true,
      }),
    ).toContainText("Only the workspace owner");
    await expect(
      other.getByRole("button", {
        name: "Configure task statuses",
        exact: true,
      }),
    ).toHaveCount(0);
    const roster = await (
        await page.request.get(`/api/workspaces/${shared.id}`)
      ).json(),
      membership = roster.members.find(
        (m: { email: string }) => m.email === email,
      );
    expect(
      (
        await page.request.delete(
          `/api/workspaces/${shared.id}/members/${membership.id}`,
          { headers: { origin }, data: {} },
        )
      ).status(),
    ).toBe(200);
    await other
      .getByRole("button", { name: "Refresh workflow", exact: true })
      .click();
    await expect(
      other.getByRole("heading", {
        name: "Workspace unavailable",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      other.getByRole("region", {
        name: "Workspace task workflow",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      other.getByRole("heading", { name: shared.name, exact: true }),
    ).toHaveCount(0);
  } finally {
    await member.close();
  }
});
