import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  personal,
  post,
  origin,
  openTask,
  retained,
  closedEditor,
  cleanClose,
  setZone,
} from "./planner-helpers";
import { testDB } from "../database";
test.setTimeout(150000);
test.use({ actionTimeout: 15000 });
const panel = (page: Page) =>
  page.getByRole("region", { name: "Workspace tags", exact: true });
const removal = (page: Page) =>
  page.getByRole("region", { name: "Remove tag", exact: true });
async function tag(page: Page, ws: string, name: string) {
  return (
    await post(page, `/api/workspaces/${ws}/tags`, {
      name,
      color: "amber",
      requestKey: randomUUID(),
    })
  ).tag;
}
async function settings(page: Page, ws: string) {
  await page.goto(`/settings?workspaceId=${ws}`);
  await expect(
    panel(page).getByRole("button", { name: "Create tag", exact: true }),
  ).toBeEnabled();
}
async function review(page: Page, name: string) {
  await panel(page)
    .getByRole("button", { name: `Remove tag ${name}`, exact: true })
    .click();
  await expect(removal(page)).toBeVisible();
}
async function move(page: Page, ws: string, id: string) {
  const p = await (
    await page.request.post(`/api/workspaces/${ws}/trash/preview`, {
      headers: { origin },
      data: { kind: "task", id },
    })
  ).json();
  const r = await page.request.post(`/api/workspaces/${ws}/trash`, {
    headers: { origin },
    data: {
      kind: "task",
      id,
      impactDigest: p.impactDigest,
      requestKey: randomUUID(),
    },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).batch;
}

test("Settings removal exports complete usage, cancels without writes and supports explicit manual recovery", async ({
  page,
  isMobile,
  browser,
  context,
}, info) => {
  const ws = await personal(page),
    selected = await tag(page, ws.id, "Reviewed removal"),
    keep = await tag(page, ws.id, "Keep this tag");
  const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Project context",
  });
  const parent = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    projectId: project.id,
    title: 'Parent "quoted", 雪',
    tagIds: [selected.id, keep.id],
  });
  const child = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    parentId: parent.id,
    title: "Child in Trash",
    status: "done",
    tagIds: [selected.id],
  });
  const standalone = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "=Unsafe spreadsheet title",
    tagIds: [selected.id],
  });
  await setZone(page);
  const block = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
    label: "Tagged reservation",
    requestKey: randomUUID(),
    assignment: { projectId: null, taskId: standalone.id },
    schedule: {
      startAt: "2030-06-03T14:00:23.123Z",
      endAt: "2030-06-03T15:00:23.456Z",
      timeZone: "UTC",
    },
  });
  const originalBlock = await testDB.timeBlock.findUniqueOrThrow({
    where: { id: block.id },
  });
  const batch = await move(page, ws.id, child.id);
  await settings(page, ws.id);
  await review(page, selected.name);
  await expect(removal(page)).toContainText("2 active and 1 trashed");
  await expect(removal(page).getByRole("listitem")).toHaveCount(3);
  const before = await testDB.task.findMany({
      where: { workspaceId: ws.id },
      orderBy: { id: "asc" },
    }),
    history = await testDB.workActivity.findMany({
      where: { workspaceId: ws.id },
      orderBy: { id: "asc" },
    });
  const download = page.waitForEvent("download");
  await removal(page)
    .getByRole("button", { name: "Download usage list", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("kanbrik-tag-usage.csv");
  const csv = await readFile((await file.path())!, "utf8");
  expect(csv).toContain('"\'=Unsafe spreadsheet title"');
  expect(csv).toContain(child.id);
  expect(csv).toContain('"Parent ""quoted"", 雪"');
  await expect(
    removal(page).getByRole("button", { name: "Remove anyway", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: info.outputPath("tag-removal-review.png"),
    fullPage: true,
  });
  await removal(page)
    .getByRole("button", { name: "Cancel tag removal", exact: true })
    .click();
  await closedEditor(page);
  await expect(
    panel(page).getByRole("button", {
      name: `Remove tag ${selected.name}`,
      exact: true,
    }),
  ).toBeFocused();
  expect(
    await testDB.task.findMany({
      where: { workspaceId: ws.id },
      orderBy: { id: "asc" },
    }),
  ).toEqual(before);
  expect(
    await testDB.workActivity.findMany({
      where: { workspaceId: ws.id },
      orderBy: { id: "asc" },
    }),
  ).toEqual(history);
  await page.emulateMedia({ colorScheme: "dark" });
  await review(page, selected.name);
  await page.screenshot({
    path: info.outputPath("tag-removal-review-dark.png"),
    fullPage: true,
  });
  const removalDownload = page.waitForEvent("download");
  await removal(page)
    .getByRole("button", { name: "Download usage list", exact: true })
    .click();
  const removedCSV = await readFile(
    (await (await removalDownload).path())!,
    "utf8",
  );
  await expect(
    removal(page).getByRole("button", { name: "Remove anyway", exact: true }),
  ).toBeEnabled();
  if (!isMobile) {
    await removal(page)
      .getByRole("button", { name: "Remove anyway", exact: true })
      .focus();
    await page.keyboard.press("Enter");
  } else
    await removal(page)
      .getByRole("button", { name: "Remove anyway", exact: true })
      .tap();
  await closedEditor(page);
  expect(
    await testDB.taskTag.count({
      where: { workspaceId: ws.id, tagId: selected.id },
    }),
  ).toBe(0);
  expect(
    await testDB.taskTag.count({
      where: { taskId: parent.id, tagId: keep.id },
    }),
  ).toBe(1);
  await expect(
    panel(page).getByRole("button", {
      name: `Edit tag ${selected.name}`,
      exact: true,
    }),
  ).toBeEnabled();
  expect(
    await testDB.timeBlock.findUniqueOrThrow({ where: { id: block.id } }),
  ).toEqual(originalBlock);
  const second = await browser.newContext({
    baseURL: origin,
    storageState: await context.storageState(),
    viewport: page.viewportSize()!,
    isMobile,
    hasTouch: isMobile,
  });
  try {
    const device = await second.newPage();
    await device.goto("/board");
    await expect(
      device.getByRole("article", { name: parent.title, exact: true }),
    ).toBeVisible();
    await expect(
      device
        .getByRole("article", { name: parent.title, exact: true })
        .getByText(keep.name, { exact: true }),
    ).toBeVisible();
    await expect(
      device
        .getByRole("article", { name: standalone.title, exact: true })
        .getByText(selected.name, { exact: true }),
    ).toHaveCount(0);
    await device.goto("/calendar");
    await device.getByLabel("Date", { exact: true }).fill("2030-06-03");
    const agenda = device.getByRole("button", {
      name: "Edit block: Tagged reservation",
      exact: true,
    });
    await expect(agenda).toBeVisible();
    await expect(
      agenda.locator("..").getByText(selected.name, { exact: true }),
    ).toHaveCount(0);
    await device.reload();
    await device.getByLabel("Date", { exact: true }).fill("2030-06-03");
    await expect(
      device.getByRole("button", {
        name: "Edit block: Tagged reservation",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await second.close();
  }

  await panel(page)
    .getByRole("button", {
      name: `Removal reports ${selected.name}`,
      exact: true,
    })
    .click();
  const reports = page.getByRole("region", {
    name: "Removal reports",
    exact: true,
  });
  await expect(
    reports.getByRole("button", { name: /^Inspect removal / }),
  ).toHaveCount(1);
  await reports.getByRole("button", { name: /^Inspect removal / }).click();
  await expect(
    page.getByRole("region", { name: "Recorded removed usage", exact: true }),
  ).toContainText(child.title);
  await page.screenshot({
    path: info.outputPath("tag-removal-report.png"),
    fullPage: true,
  });
  const oldReport = page.waitForEvent("download");
  await reports.getByRole("button", { name: /^Download removal / }).click();
  const oldCSV = await readFile((await (await oldReport).path())!, "utf8");
  expect(oldCSV).toBe(removedCSV);
  await cleanClose(page);
  await panel(page)
    .getByRole("button", { name: `Edit tag ${selected.name}`, exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Archived tag", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Save tag definition", exact: true })
    .click();
  await closedEditor(page);
  expect(await testDB.taskTag.count({ where: { tagId: selected.id } })).toBe(0);
  // Ordinary refreshed Restore remains compatible; it does not retag the child.
  expect(
    (
      await page.request.post(
        `/api/workspaces/${ws.id}/trash/${batch.id}/restore`,
        { headers: { origin }, data: { revision: 2 } },
      )
    ).status(),
  ).toBe(200);
  await page.goto("/projects");
  await openTask(page, standalone.title);
  await page
    .getByRole("combobox", { name: "Find existing tag", exact: true })
    .fill(selected.name);
  await page
    .getByRole("listbox", { name: "Matching workspace tags", exact: true })
    .getByRole("button")
    .click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await closedEditor(page);
  expect(
    (await testDB.taskTag.findMany({ where: { tagId: selected.id } })).map(
      (l) => l.taskId,
    ),
  ).toEqual([standalone.id]);
  expect(
    await testDB.workActivity.count({
      where: { workspaceId: ws.id, action: "tag_removed" },
    }),
  ).toBe(3);
});

test("bulk removal preserves stale work, comment and list input until explicit saved-version review", async ({
  page,
}) => {
  const ws = await personal(page),
    t = await tag(page, ws.id, "Remove from retained draft"),
    a = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Retained tagged task",
      description: "Original saved text",
      tagIds: [t.id],
    });
  await page.reload();
  await openTask(page, a.title);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Keep my work input");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await page
    .getByLabel("New comment text", { exact: true })
    .fill("Keep my comment input");
  await page
    .getByRole("button", { name: "Add checklist", exact: true })
    .click();
  await page
    .getByLabel("Section name", { exact: true })
    .fill("Keep my list input");
  await page
    .getByRole("link", { name: "Create/manage tags", exact: true })
    .click();
  await review(page, t.name);
  await removal(page)
    .getByRole("button", { name: "Remove anyway", exact: true })
    .click();
  await closedEditor(page);
  await page
    .getByRole("button", { name: `Review work draft: ${a.title}`, exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Keep my work input");
  await expect(
    page.getByLabel("New comment text", { exact: true }),
  ).toHaveValue("Keep my comment input");
  await expect(page.getByLabel("Section name", { exact: true })).toHaveValue(
    "Keep my list input",
  );
  await expect(
    page.getByRole("button", { name: `Remove ${t.name}`, exact: true }),
  ).toBeVisible();
  const failed = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" && r.url().endsWith(`/tasks/${a.id}`),
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await failed).status()).toBe(409);
  await expect(
    page.getByRole("region", { name: "Saved version", exact: true }),
  ).toContainText("revision 2");
  expect(
    (await testDB.task.findUniqueOrThrow({ where: { id: a.id } })).revision,
  ).toBe(2);
  await page
    .getByRole("button", {
      name: "Review complete: keep my draft",
      exact: true,
    })
    .click();
  const invalid = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" && r.url().endsWith(`/tasks/${a.id}`),
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await invalid).status()).toBe(400);
  await page
    .getByRole("button", { name: `Remove ${t.name}`, exact: true })
    .click();
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" && r.url().endsWith(`/tasks/${a.id}`),
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  expect((await saved).status()).toBe(200);
  expect(
    await testDB.task.findUniqueOrThrow({ where: { id: a.id } }),
  ).toMatchObject({ description: "Keep my work input", revision: 3 });
  expect(await testDB.taskTag.count({ where: { taskId: a.id } })).toBe(0);
  await expect(
    page.getByRole("heading", { name: "Removed tag assignment", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("New comment text", { exact: true }),
  ).toHaveValue("Keep my comment input");
  await expect(page.getByLabel("Section name", { exact: true })).toHaveValue(
    "Keep my list input",
  );
});

test("stale impact and failed export keep the review visible and require deliberate refresh", async ({
  page,
}) => {
  const ws = await personal(page),
    t = await tag(page, ws.id, "Stale impact tag");
  await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Original usage",
    tagIds: [t.id],
  });
  await settings(page, ws.id);
  await review(page, t.name);
  await page.route("**/removal-preview/export", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Fixture export unavailable" },
    }),
  );
  await removal(page)
    .getByRole("button", { name: "Download usage list", exact: true })
    .click();
  await expect(removal(page).getByRole("alert")).toContainText(
    "Fixture export unavailable",
  );
  expect(await testDB.taskTag.count({ where: { tagId: t.id } })).toBe(1);
  await page.unroute("**/removal-preview/export");
  await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "New shared usage",
    tagIds: [t.id],
  });
  const stale = page.waitForResponse((r) => r.url().endsWith("/remove"));
  await removal(page)
    .getByRole("button", { name: "Remove anyway", exact: true })
    .click();
  expect((await stale).status()).toBe(409);
  await expect(
    removal(page).getByRole("button", { name: "Remove anyway", exact: true }),
  ).toBeDisabled();
  await expect(removal(page)).toContainText("The reviewed impact changed");
  expect(await testDB.taskTag.count({ where: { tagId: t.id } })).toBe(2);
  await removal(page)
    .getByRole("button", { name: "Review latest impact", exact: true })
    .click();
  await expect(removal(page)).toContainText("2 active and 0 trashed");
  await expect(
    removal(page).getByRole("button", { name: "Remove anyway", exact: true }),
  ).toBeEnabled();
  await page.goBack();
  await expect(
    page.getByRole("region", { name: "Discard unsaved changes?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await removal(page)
    .getByRole("button", { name: "Cancel tag removal", exact: true })
    .click();
  await closedEditor(page);
  expect(await testDB.taskTag.count({ where: { tagId: t.id } })).toBe(2);
  const empty = await tag(page, ws.id, "Unused tag");
  await panel(page)
    .getByRole("button", { name: "Refresh tags", exact: true })
    .click();
  await review(page, empty.name);
  await removal(page)
    .getByRole("button", { name: "Remove unused tag", exact: true })
    .click();
  await closedEditor(page);
  expect(
    (await testDB.workspaceTag.findUniqueOrThrow({ where: { id: empty.id } }))
      .archivedAt,
  ).toBeTruthy();
});

test("uncertain removal retains its exact intent through Settings scope changes and retries after later reattachment", async ({
  page,
  testWorkspaces,
}) => {
  const ws = await personal(page),
    other = await post(page, "/api/workspaces", {
      name: "Other local settings scope",
    });
  testWorkspaces.push(other.id);
  const t = await testDB.workspaceTag.create({
      data: {
        id: `legacy-important/${ws.id}`,
        workspaceId: ws.id,
        name: "Important",
        normalizedName: "important",
        color: "amber",
      },
    }),
    a = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Lost removal response",
      tagIds: [t.id],
    });
  await settings(page, ws.id);
  await review(page, t.name);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    arrived = new Promise<void>((r) => (entered = r));
  const payloads: unknown[] = [];
  let first = true;
  await page.route("**/tags/**/remove", async (route) => {
    payloads.push(route.request().postDataJSON());
    if (!first) return route.continue();
    first = false;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    entered();
    await gate;
    await route.abort("failed").catch(() => {});
  });
  try {
    await removal(page)
      .getByRole("button", { name: "Remove anyway", exact: true })
      .click();
    await arrived;
    await expect(
      page.getByRole("button", { name: "Keep draft for later", exact: true }),
    ).toBeDisabled();
    await page.goBack();
    await expect(
      page.getByRole("dialog", { name: "Remove tag", exact: true }),
    ).toBeVisible();
    release();
    await expect(
      removal(page).getByRole("button", {
        name: "Retry tag removal",
        exact: true,
      }),
    ).toBeEnabled();
    await retained(page);
    await page
      .getByRole("combobox", { name: "Settings workspace", exact: true })
      .selectOption(other.id);
    await page
      .getByRole("link", {
        name: `Review retained input: removal of tag ${t.name}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Settings workspace", exact: true }),
    ).toHaveValue(ws.id);
    await expect(removal(page)).toContainText("Removal is unconfirmed");
    await retained(page);
    await page
      .getByRole("link", {
        name: `Review retained input: removal of tag ${t.name}`,
        exact: true,
      })
      .click();
    await expect(
      removal(page).getByRole("button", {
        name: "Retry tag removal",
        exact: true,
      }),
    ).toBeEnabled();
    const saved = await testDB.workspaceTag.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(
      (
        await page.request.patch(
          `/api/workspaces/${ws.id}/tags/${encodeURIComponent(t.id)}`,
          {
            headers: { origin },
            data: {
              name: saved.name,
              color: saved.color,
              revision: saved.revision,
              archived: false,
            },
          },
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.patch(`/api/workspaces/${ws.id}/tasks/${a.id}`, {
          headers: { origin },
          data: {
            title: a.title,
            description: "Later collaborator input",
            status: a.status,
            revision: 2,
            tagIds: [t.id],
          },
        })
      ).status(),
    ).toBe(200);
    await removal(page)
      .getByRole("button", { name: "Retry tag removal", exact: true })
      .click();
    await closedEditor(page);
    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toEqual(payloads[0]);
    expect(
      await testDB.taskTag.count({ where: { taskId: a.id, tagId: t.id } }),
    ).toBe(1);
    expect(
      (await testDB.task.findUniqueOrThrow({ where: { id: a.id } })).revision,
    ).toBe(3);
    expect(
      await testDB.workActivity.count({
        where: { taskId: a.id, action: "tag_removed" },
      }),
    ).toBe(1);
  } finally {
    release();
    await page.unroute("**/tags/**/remove");
  }
});

test("obsolete account export replies cannot download another account's protected usage", async ({
  page,
  browser,
  context,
  testAccounts,
}) => {
  const ws = await personal(page),
    t = await tag(page, ws.id, "Account protected removal");
  await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Private original usage",
    tagIds: [t.id],
  });
  await settings(page, ws.id);
  await review(page, t.name);
  const other = await browser.newContext({ baseURL: origin }),
    email = randomUUID() + "@example.invalid";
  testAccounts.push(email);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    arrived = new Promise<void>((r) => (entered = r));
  let downloads = 0;
  page.on("download", () => downloads++);
  try {
    expect(
      (
        await other.request.post("/api/auth/sign-up/email", {
          headers: { origin },
          data: {
            email,
            name: "Other account",
            password: randomUUID() + randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
    await page.route("**/removal-preview/export", async (route) => {
      const response = await route.fetch();
      entered();
      await gate;
      await route.fulfill({ response }).catch(() => {});
    });
    await removal(page)
      .getByRole("button", { name: "Download usage list", exact: true })
      .click();
    await arrived;
    await context.clearCookies();
    await context.addCookies((await other.storageState()).cookies);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText(`Signed in as ${email}`, { exact: true }),
    ).toBeVisible();
    release();
    await page
      .getByRole("navigation", { name: "Main navigation", exact: true })
      .getByRole("link", { name: "Settings", exact: true })
      .click();
    await expect(
      panel(page).getByRole("button", { name: "Create tag", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText("Private original usage", { exact: true }),
    ).toHaveCount(0);
    expect(downloads).toBe(0);
    expect(await testDB.taskTag.count({ where: { tagId: t.id } })).toBe(1);
  } finally {
    release();
    await page.unroute("**/removal-preview/export");
    await other.close();
  }
});
