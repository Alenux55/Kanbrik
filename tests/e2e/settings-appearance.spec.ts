import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import {
  personal,
  post,
  origin,
  retained,
  setZone,
  openTask,
  closedEditor,
} from "./planner-helpers";
import type { Page, Locator } from "@playwright/test";
import { testDB } from "../database";
test.setTimeout(180000);
test.use({ actionTimeout: 15000 });
const scheme = (page: Page) =>
  page.locator("html").evaluate((node) => getComputedStyle(node).colorScheme);
async function readable(locator: Locator) {
  const ratio = await locator.evaluate((node) => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    const foreground = rgb(getComputedStyle(node).color);
    let current: Element | null = node,
      background: number[] = [];
    while (current) {
      background = rgb(getComputedStyle(current).backgroundColor);
      if (background.length === 3 || background[3] === 1) break;
      current = current.parentElement;
    }
    const luminance = (values: number[]) =>
      values
        .slice(0, 3)
        .map((value) => {
          const channel = value / 255;
          return channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i],
          0,
        );
    const a = luminance(foreground),
      b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
}
async function settings(page: Page) {
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
}
async function saveAppearance(page: Page, value: string) {
  await page
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption(value);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/planner/preferences") &&
      r.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Save appearance", exact: true })
    .click();
  const saved = await response;
  expect(saved.request().postDataJSON()).toEqual({ appearance: value });
  expect(saved.status()).toBe(200);
  await expect(page.locator("html")).toHaveAttribute("data-appearance", value);
}

test("account appearance persists before paint and across devices while OS changes preserve planner drafts and schedules", async ({
  page,
  browser,
  context,
  isMobile,
}, info) => {
  const ws = await personal(page);
  await setZone(page);
  const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Theme project",
  });
  const tag = (
    await post(page, `/api/workspaces/${ws.id}/tags`, {
      name: "Theme tag",
      color: "pink",
      requestKey: randomUUID(),
    })
  ).tag;
  await post(page, `/api/workspaces/${ws.id}/tags`, {
    name: "Dropdown choice",
    color: "sky",
    requestKey: randomUUID(),
  });
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Theme task",
    projectId: project.id,
    tagIds: [tag.id],
  });
  const block = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
    label: "Theme block",
    assignment: { taskId: task.id, projectId: null },
    schedule: {
      startAt: "2030-06-03T12:00:00.000Z",
      endAt: "2030-06-03T13:00:00.000Z",
      timeZone: "UTC",
    },
    requestKey: randomUUID(),
  });
  const original = await testDB.timeBlock.findUniqueOrThrow({
    where: { id: block.id },
  });
  const hydration: string[] = [];
  page.on("console", (message) => {
    if (/hydration|hydrated.*match/i.test(message.text()))
      hydration.push(message.text());
  });
  await page.emulateMedia({ colorScheme: "light" });
  await settings(page);
  let patchCount = 0,
    scheduleWrites = 0;
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().endsWith("/api/planner/preferences"))
      patchCount++;
    if (r.method() !== "GET" && r.url().includes("/time-blocks"))
      scheduleWrites++;
  });
  for (const mode of ["dark", "light", "system"]) {
    await saveAppearance(page, mode);
    await expect
      .poll(() => scheme(page))
      .toBe(mode === "dark" ? "dark" : "light");
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Appearance", exact: true }),
    ).toHaveValue(mode);
    await readable(page.locator("body"));
    await readable(
      page.getByRole("combobox", { name: "Appearance", exact: true }),
    );
    await readable(
      page
        .getByRole("navigation", { name: "Main navigation", exact: true })
        .getByRole("link", { name: "Settings", exact: true }),
    );
    await page.screenshot({
      path: info.outputPath(`settings-${mode}.png`),
      fullPage: true,
    });
    await expect(
      page.getByRole("button", { name: "Create tag", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Create tag", exact: true }).click();
    const palette = page.getByRole("region", {
      name: "Tag definition",
      exact: true,
    });
    for (const color of ["Teal", "Blue", "Violet", "Amber", "Pink", "Sky"]) {
      await readable(
        palette
          .getByRole("radio", { name: new RegExp(`^${color}`) })
          .locator(".."),
      );
    }
    await page.screenshot({ path: info.outputPath(`tag-palette-${mode}.png`) });
    await palette
      .getByRole("button", {
        name: "Discard tag definition draft",
        exact: true,
      })
      .click();
    await closedEditor(page);
    await page.getByRole("link", { name: "Board", exact: true }).click();
    await page
      .getByRole("article", { name: task.title, exact: true })
      .getByRole("button")
      .click();
    const form = page.getByRole("form", { name: "Edit task", exact: true });
    await form
      .getByRole("textbox", { name: "Description", exact: true })
      .fill("Theme draft survives OS changes");
    await page
      .getByRole("button", { name: "Add comment", exact: true })
      .click();
    await page
      .getByLabel("New comment text", { exact: true })
      .fill("Theme comment input");
    await page
      .getByRole("button", { name: "Add checklist", exact: true })
      .click();
    await page
      .getByLabel("Section name", { exact: true })
      .fill("Theme list input");
    await form
      .getByRole("combobox", { name: "Find existing tag", exact: true })
      .fill("Dropdown");
    await expect(form.getByRole("listbox").getByRole("option")).toHaveCount(1);
    const patches = patchCount;
    await page.emulateMedia({ colorScheme: "dark" });
    await expect
      .poll(() => scheme(page))
      .toBe(mode === "light" ? "light" : "dark");
    await expect(
      form.getByRole("textbox", { name: "Description", exact: true }),
    ).toHaveValue("Theme draft survives OS changes");
    await expect(
      page.getByLabel("New comment text", { exact: true }),
    ).toHaveValue("Theme comment input");
    await expect(page.getByLabel("Section name", { exact: true })).toHaveValue(
      "Theme list input",
    );
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await readable(
      form
        .getByRole("button", { name: "Remove Theme tag", exact: true })
        .locator(".."),
    );
    await readable(
      form.getByRole("textbox", { name: "Description", exact: true }),
    );
    expect(patchCount).toBe(patches);
    await page.screenshot({
      path: info.outputPath(`editor-dropdown-${mode}.png`),
    });
    await retained(page);
    await page.getByRole("link", { name: "Calendar", exact: true }).click();
    await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
    await page.getByLabel("View", { exact: true }).selectOption("day");
    await expect(page.locator(".fc-timegrid-event")).toHaveCount(1);
    await page.locator(".fc-timegrid-event").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`calendar-${mode}.png`) });
    if (!isMobile && mode === "dark") {
      const source = page.getByRole("button", {
        name: "Edit project: Theme project",
        exact: true,
      });
      await source.scrollIntoViewIfNeeded();
      const row = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]');
      await row.evaluate((node) => {
        const scroll = node.closest<HTMLElement>(".fc-scroller")!;
        scroll.scrollTop +=
          node.getBoundingClientRect().top -
          scroll.getBoundingClientRect().top -
          200;
      });
      const a = (await source.boundingBox())!,
        b = (await row.boundingBox())!;
      const column = (await page
        .locator('.fc-timegrid-col[data-date="2030-06-03"]')
        .boundingBox())!;
      await page.mouse.move(a.x + 20, a.y + 20);
      await page.mouse.down();
      await page.mouse.move(a.x + 35, a.y + 20, { steps: 3 });
      await page.mouse.move(
        column.x + column.width / 2,
        b.y + b.height * 0.75,
        { steps: 16 },
      );
      await expect(
        page.locator('[data-calendar-drop-preview][data-drop-valid="true"]'),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath("calendar-dark-drop-preview.png"),
      });
      await page.keyboard.press("Escape");
      await page.mouse.up();
      await expect(page.locator("[data-calendar-drop-preview]")).toHaveCount(0);
    }
    expect(
      await testDB.timeBlock.findUniqueOrThrow({ where: { id: block.id } }),
    ).toEqual(original);
    await page.emulateMedia({ colorScheme: "light" });
    await settings(page);
  }
  expect(patchCount).toBe(3);
  expect(scheduleWrites).toBe(0);
  await saveAppearance(page, "dark");
  const state = await context.storageState();
  const device = await browser.newContext({
    baseURL: origin,
    storageState: state,
    colorScheme: "light",
  });
  const beforeJS = await browser.newContext({
    baseURL: origin,
    storageState: state,
    colorScheme: "light",
    javaScriptEnabled: false,
  });
  try {
    const other = await device.newPage();
    await other.goto("/settings");
    await expect(
      other.getByRole("combobox", { name: "Appearance", exact: true }),
    ).toHaveValue("dark");
    await expect.poll(() => scheme(other)).toBe("dark");
    const server = await beforeJS.newPage();
    await server.goto("/settings");
    await expect(server.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
    );
    await expect.poll(() => scheme(server)).toBe("dark");
  } finally {
    await device.close();
    await beforeJS.close();
  }
  expect(hydration).toEqual([]);
});

test("Settings workspace choice stays local and obsolete tag loads cannot replace a newer scope or grant access", async ({
  page,
  browser,
  testAccounts,
  testWorkspaces,
}) => {
  const mine = await personal(page),
    shared = await post(page, "/api/workspaces", { name: "Settings shared" });
  testWorkspaces.push(shared.id);
  await post(page, `/api/workspaces/${mine.id}/tags`, {
    name: "Personal choice",
    color: "teal",
    requestKey: randomUUID(),
  });
  await post(page, `/api/workspaces/${shared.id}/tags`, {
    name: "Shared choice",
    color: "blue",
    requestKey: randomUUID(),
  });
  const basePrefs = await (
    await page.request.get("/api/planner/preferences")
  ).json();
  const board = await (await page.request.get("/api/board/preferences")).json(),
    calendar = await (
      await page.request.get("/api/calendar/preferences")
    ).json();
  await settings(page);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    arrived = new Promise<void>((r) => {
      started = r;
    });
  await page.route(`**/api/workspaces/${shared.id}/tags`, async (route) => {
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page
      .getByRole("combobox", { name: "Settings workspace", exact: true })
      .selectOption(shared.id);
    await arrived;
    await page
      .getByRole("combobox", { name: "Settings workspace", exact: true })
      .selectOption(mine.id);
    release();
    await expect(
      page.getByRole("button", {
        name: "Edit tag Personal choice",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Edit tag Shared choice", exact: true }),
    ).toHaveCount(0);
    expect(
      await (await page.request.get("/api/planner/preferences")).json(),
    ).toEqual(basePrefs);
    expect(
      await (await page.request.get("/api/board/preferences")).json(),
    ).toEqual(board);
    expect(
      await (await page.request.get("/api/calendar/preferences")).json(),
    ).toEqual(calendar);
  } finally {
    release();
    await page.unroute(`**/api/workspaces/${shared.id}/tags`);
  }
  const editor = await browser.newContext({ baseURL: origin });
  const email = `${randomUUID()}@example.invalid`;
  testAccounts.push(email);
  try {
    expect(
      (
        await editor.request.post("/api/auth/sign-up/email", {
          headers: { origin },
          data: {
            email,
            name: "Settings editor",
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
    const secondary = await editor.newPage();
    await secondary.goto(`/settings?workspaceId=${shared.id}`);
    await expect(
      secondary.getByRole("button", { name: "Create tag", exact: true }),
    ).toBeEnabled();
    await expect(
      secondary.getByRole("link", {
        name: "View workspace details; configuration is owner-managed",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      secondary.getByRole("link", {
        name: "Manage workspace workflow, reference zone and members",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      secondary.getByRole("heading", {
        name: "Account invitations",
        exact: true,
      }),
    ).toHaveCount(0);
    const member = (
      await (await page.request.get(`/api/workspaces/${shared.id}`)).json()
    ).members.find((m: { email: string }) => m.email === email);
    expect(
      (
        await page.request.delete(
          `/api/workspaces/${shared.id}/members/${member.id}`,
          { headers: { origin }, data: {} },
        )
      ).status(),
    ).toBe(200);
    await secondary
      .getByRole("button", { name: "Refresh tags", exact: true })
      .click();
    await expect(
      secondary.getByRole("alert").filter({ hasText: "Workspace unavailable" }),
    ).toBeVisible();
    await expect(
      secondary.getByRole("button", { name: "Create tag", exact: true }),
    ).toHaveCount(0);
    await secondary.goto(`/settings?workspaceId=${mine.id}`);
    await expect(
      secondary.getByRole("alert").filter({ hasText: "Workspace unavailable" }),
    ).toBeVisible();
  } finally {
    await editor.close();
  }
});

test("retained definition retries keep their workspace and request after the originating task is trashed", async ({
  page,
  testWorkspaces,
}) => {
  const mine = await personal(page),
    other = await post(page, "/api/workspaces", { name: "Other tag settings" });
  testWorkspaces.push(other.id);
  const task = await post(page, `/api/workspaces/${mine.id}/tasks`, {
    title: "Tag origin",
  });
  await page.reload();
  await openTask(page, task.title);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Retained origin draft");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await page
    .getByLabel("New comment text", { exact: true })
    .fill("Origin comment input");
  await page
    .getByRole("button", { name: "Add checklist", exact: true })
    .click();
  await page
    .getByLabel("Section name", { exact: true })
    .fill("Origin list input");
  await page
    .getByRole("link", { name: "Create/manage tags", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Create tag", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Create tag", exact: true }).click();
  await page
    .getByLabel("Tag name", { exact: true })
    .fill("Recovered origin tag");
  const payloads: object[] = [];
  await page.route(`**/api/workspaces/${mine.id}/tags`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    payloads.push(route.request().postDataJSON());
    if (payloads.length === 1)
      await route.fulfill({
        status: 503,
        json: { error: "Fixture unconfirmed" },
      });
    else await route.continue();
  });
  await page
    .getByRole("button", { name: "Save tag definition", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry tag save", exact: true }),
  ).toBeEnabled();
  const impact = await page.request.post(
    `/api/workspaces/${mine.id}/trash/preview`,
    { headers: { origin }, data: { kind: "task", id: task.id } },
  );
  expect(impact.status()).toBe(200);
  expect(
    (
      await page.request.post(`/api/workspaces/${mine.id}/trash`, {
        headers: { origin },
        data: {
          kind: "task",
          id: task.id,
          impactDigest: (await impact.json()).impactDigest,
          requestKey: randomUUID(),
        },
      })
    ).status(),
  ).toBe(200);
  for (let activation = 0; activation < 2; activation++) {
    await retained(page);
    await page
      .getByRole("link", {
        name: "Review retained input: new tag",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Tag name", { exact: true })).toHaveValue(
      "Recovered origin tag",
    );
    await expect(page.getByLabel("Tag name", { exact: true })).toBeDisabled();
  }
  await retained(page);
  await page
    .getByRole("combobox", { name: "Settings workspace", exact: true })
    .selectOption(other.id);
  await expect(
    page.getByRole("button", { name: "Create tag", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("link", { name: "Review retained input: new tag", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Settings workspace", exact: true }),
  ).toHaveValue(mine.id);
  await expect(page.getByLabel("Tag name", { exact: true })).toHaveValue(
    "Recovered origin tag",
  );
  await expect(page.getByLabel("Tag name", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "Retry tag save", exact: true })
    .click();
  await closedEditor(page);
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  expect(
    (
      await (await page.request.get(`/api/workspaces/${mine.id}/tags`)).json()
    ).map((tag: { name: string }) => tag.name),
  ).toContain("Recovered origin tag");
  expect(
    await (await page.request.get(`/api/workspaces/${other.id}/tags`)).json(),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Review work draft: Tag origin", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Retained origin draft");
  await expect(
    page.getByRole("form", { name: "Edit task", exact: true }),
  ).toContainText("Revision 1.");
  await expect(
    page.getByRole("region", { name: "Retained comment drafts", exact: true }),
  ).toContainText("Tag origin");
  await expect(
    page.getByRole("region", {
      name: "Retained list and configuration drafts",
      exact: true,
    }),
  ).toContainText("Checklist");
});

test("new task input returns through Back from scoped Settings without adopting its local workspace choice", async ({
  page,
  testWorkspaces,
}) => {
  const mine = await personal(page),
    other = await post(page, "/api/workspaces", {
      name: "New-task tag settings",
    });
  testWorkspaces.push(other.id);
  const tag = (
    await post(page, `/api/workspaces/${mine.id}/tags`, {
      name: "New task selection",
      color: "violet",
      requestKey: randomUUID(),
    })
  ).tag;
  await page.goto("/board");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const form = page.getByRole("form", { name: "Create task", exact: true });
  await form
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("New Settings task input");
  await form
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Unsaved new work");
  await form.getByLabel("Status", { exact: true }).selectOption("blocked");
  await form
    .getByRole("combobox", { name: "Find existing tag", exact: true })
    .fill(tag.name);
  await form
    .getByRole("listbox")
    .getByRole("option")
    .getByRole("button")
    .click();
  await form
    .getByRole("link", { name: "Create/manage tags", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Settings workspace", exact: true }),
  ).toHaveValue(mine.id);
  await page
    .getByRole("combobox", { name: "Settings workspace", exact: true })
    .selectOption(other.id);
  await page.goBack();
  await expect(page).toHaveURL(/\/board$/);
  await page
    .getByRole("button", {
      name: "Review work draft: New Settings task input",
      exact: true,
    })
    .click();
  await expect(
    form.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Unsaved new work");
  await expect(form.getByLabel("Status", { exact: true })).toHaveValue(
    "blocked",
  );
  await expect(
    form.getByRole("button", { name: `Remove ${tag.name}`, exact: true }),
  ).toBeVisible();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/workspaces/${mine.id}/tasks`) &&
      r.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(201);
  expect(await result.json()).toMatchObject({
    workspaceId: mine.id,
    title: "New Settings task input",
    description: "Unsaved new work",
    status: "blocked",
    tags: [{ id: tag.id }],
  });
});

test("failed appearance saves remain unconfirmed and obsolete account replies cannot recolor or unlock another account", async ({
  page,
  browser,
  context,
  testAccounts,
}) => {
  await settings(page);
  await saveAppearance(page, "light");
  await page.route("**/api/planner/preferences", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 503, json: { error: "Fixture failure" } })
      : route.continue(),
  );
  await page
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("dark");
  await page
    .getByRole("button", { name: "Save appearance", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Account settings", exact: true })
      .getByRole("alert")
      .filter({ hasText: "Settings not confirmed" }),
  ).toBeVisible();
  await expect(
    page.getByText("Unsaved appearance choice", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "light",
  );
  await page.unroute("**/api/planner/preferences");
  const other = await browser.newContext({ baseURL: origin });
  const email = `${randomUUID()}@example.invalid`,
    password = randomUUID() + randomUUID();
  testAccounts.push(email);
  let releaseA!: () => void,
    releaseB!: () => void,
    enteredA!: () => void,
    enteredB!: () => void;
  const gateA = new Promise<void>((r) => {
      releaseA = r;
    }),
    gateB = new Promise<void>((r) => {
      releaseB = r;
    });
  const arrivedA = new Promise<void>((r) => {
      enteredA = r;
    }),
    arrivedB = new Promise<void>((r) => {
      enteredB = r;
    });
  let attempts = 0;
  try {
    expect(
      (
        await other.request.post("/api/auth/sign-up/email", {
          headers: { origin },
          data: { email, password, name: "Appearance account" },
        })
      ).status(),
    ).toBe(200);
    await other.request.patch("/api/planner/preferences", {
      headers: { origin },
      data: { appearance: "light" },
    });
    await page.route("**/api/planner/preferences", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      const response = await route.fetch();
      attempts++;
      if (attempts === 1) {
        enteredA();
        await gateA;
      } else {
        enteredB();
        await gateB;
      }
      await route.fulfill({ response }).catch(() => {});
    });
    await page
      .getByRole("button", { name: "Save appearance", exact: true })
      .click();
    await arrivedA;
    await context.clearCookies();
    await context.addCookies((await other.storageState()).cookies);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText(`Signed in as ${email}`, { exact: true }),
    ).toBeVisible();
    await settings(page);
    await expect(
      page.getByRole("combobox", { name: "Appearance", exact: true }),
    ).toHaveValue("light");
    await page
      .getByRole("combobox", { name: "Appearance", exact: true })
      .selectOption("dark");
    await page
      .getByRole("button", { name: "Save appearance", exact: true })
      .click();
    await arrivedB;
    releaseA();
    await expect(
      page.getByRole("button", { name: "Save appearance", exact: true }),
    ).toBeDisabled();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "light",
    );
    releaseB();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
    );
    await expect(
      page.getByRole("button", { name: "Save appearance", exact: true }),
    ).toBeEnabled();
    // A fresh sign-in reads the account-owned preference rather than browser storage.
    await other.request.post("/api/auth/sign-out", { headers: { origin } });
    expect(
      (
        await other.request.post("/api/auth/sign-in/email", {
          headers: { origin },
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await (await other.request.get("/api/planner/preferences")).json())
        .appearance,
    ).toBe("dark");
  } finally {
    releaseA();
    releaseB();
    await page.unroute("**/api/planner/preferences");
    await other.close();
  }
});
