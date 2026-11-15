import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  post,
  personal,
  origin,
  setZone,
  closedEditor,
} from "./planner-helpers";
test.setTimeout(150000);
test.use({ actionTimeout: 15000 });
const preview = (page: Page) => page.locator("[data-calendar-drop-preview]");
async function setup(page: Page) {
  const ws = await personal(page);
  await setZone(page);
  const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Preview project",
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByLabel("View", { exact: true }).selectOption("day");
  return { ws, project };
}
async function point(
  page: Page,
  time: string,
  date = "2030-06-03",
  fraction = 0.75,
) {
  await page.locator(".fc").scrollIntoViewIfNeeded();
  const row = page.locator(`.fc-timegrid-slot-lane[data-time="${time}"]`);
  await row.evaluate((el) => {
    const scroller = el.closest<HTMLElement>(".fc-scroller")!;
    scroller.scrollTop +=
      el.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      150;
  });
  const slot = (await row.boundingBox())!,
    col = (await page
      .locator(`.fc-timegrid-col[data-date="${date}"]`)
      .boundingBox())!;
  return { x: col.x + col.width / 2, y: slot.y + slot.height * fraction };
}
async function hold(page: Page, title = "Preview project", kind = "project") {
  const source = page.getByRole("button", {
    name: `Edit ${kind}: ${title}`,
    exact: true,
  });
  await source.scrollIntoViewIfNeeded();
  const box = (await source.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 35, box.y + 20, { steps: 3 });
}
async function move(page: Page, p: { x: number; y: number }) {
  await page.mouse.move(p.x, p.y, { steps: 16 });
}
const writes = (page: Page) => {
  const values: { method: string; path: string }[] = [];
  page.on("request", (r) => {
    if (
      r.method() !== "GET" &&
      /\/(time-blocks|tasks)(?:\/|$)/.test(new URL(r.url()).pathname)
    )
      values.push({ method: r.method(), path: new URL(r.url()).pathname });
  });
  return values;
};
async function noDialogs(page: Page) {
  await expect(page.locator("dialog")).toHaveCount(0);
}
async function cancel(page: Page) {
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(preview(page)).toHaveCount(0);
}

test("live blank-slot preview follows columns and stationary-pointer scrolling and matches exactly one saved interval", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(
    isMobile,
    "Work-card drag preview uses the desktop mouse; explicit mobile controls run in Calendar regressions",
  );
  const { ws, project } = await setup(page);
  const parent = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Preview parent",
      projectId: project.id,
    }),
    child = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Preview child",
      parentId: parent.id,
    });
  await page.reload();
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByLabel("View", { exact: true }).selectOption("week");
  const initial = await point(page, "12:00:00"),
    palette = page.getByLabel("Calendar work palette", { exact: true });
  const dimensions = () =>
      palette.evaluate((el) => ({
        width: el.scrollWidth,
        height: el.scrollHeight,
        document: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
      })),
    before = await dimensions(),
    changes = writes(page);
  await hold(page, child.title, "task");
  await move(page, initial);
  await expect(preview(page)).toHaveAttribute(
    "data-preview-start",
    /^2030-06-03T12:15/,
  );
  await expect(preview(page)).toHaveAttribute("data-drop-valid", "true");
  const next = await point(page, "13:30:00", "2030-06-04", 0.25);
  await move(page, next);
  await expect(preview(page)).toHaveAttribute(
    "data-preview-start",
    /^2030-06-04T13:30/,
  );
  await move(page, { x: 2, y: 2 });
  await expect(preview(page)).toHaveCount(0);
  await move(page, next);
  await expect(preview(page)).toHaveAttribute("data-drop-valid", "true");
  expect(
    await page.evaluate(
      ({ x, y }) =>
        !!document
          .elementFromPoint(x, y)
          ?.closest("[data-calendar-drop-preview]"),
      next,
    ),
  ).toBe(false);
  const boundary = (await page
      .locator("[data-calendar-drop-boundary]")
      .boundingBox())!,
    caption = (await page
      .locator("[data-calendar-drop-caption]")
      .boundingBox())!;
  expect(
    caption.y + caption.height <= boundary.y ||
      caption.y >= boundary.y + boundary.height,
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("live-week-preview.png") });
  const old = await preview(page).getAttribute("data-preview-start");
  await page.locator(".fc-timegrid-body").evaluate((el) => {
    el.closest<HTMLElement>(".fc-scroller")!.scrollTop += 80;
  });
  await expect(preview(page)).not.toHaveAttribute("data-preview-start", old!);
  expect(await dimensions()).toEqual(before);
  expect(changes).toEqual([]);
  await noDialogs(page);
  const start = await preview(page).getAttribute("data-preview-start"),
    end = await preview(page).getAttribute("data-preview-end");
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === `/api/workspaces/${ws.id}/time-blocks`,
  );
  await page.mouse.up();
  const response = await saved;
  expect(response.status()).toBe(201);
  const block = await response.json();
  expect(Date.parse(block.startAt)).toBe(Date.parse(start!));
  expect(Date.parse(block.endAt)).toBe(Date.parse(end!));
  expect(block.taskId).toBe(child.id);
  expect(block.projectId).toBeNull();
  expect(changes).toHaveLength(1);
  await expect(preview(page)).toHaveCount(0);
  await noDialogs(page);
  const source = page.getByRole("button", {
    name: `Edit task: ${child.title}`,
    exact: true,
  });
  await source.focus();
  await page.keyboard.press("Space", { delay: 75 });
  await expect(page.locator("dialog")).toHaveCount(1);
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await closedEditor(page);
});

test("empty-block assignment previews its original interval while occupied and foreign foreground events remain unavailable", async ({
  page,
  isMobile,
  testWorkspaces,
}) => {
  test.skip(
    isMobile,
    "Mouse-only preview; touch/explicit scheduling is covered separately",
  );
  const { ws, project } = await setup(page),
    foreign = await post(page, "/api/workspaces", { name: "Foreign preview" });
  testWorkspaces.push(foreign.id);
  const block = async (
    workspace: string,
    label: string,
    hour: number,
    projectId: string | null,
  ) =>
    post(page, `/api/workspaces/${workspace}/time-blocks`, {
      requestKey: randomUUID(),
      label,
      schedule: {
        startAt: `2030-06-03T${hour}:00Z`,
        endAt: `2030-06-03T${hour + 1}:30Z`,
        timeZone: "UTC",
      },
      assignment: { projectId, taskId: null },
    });
  const empty = await block(ws.id, "Preview empty", 12, null),
    occupied = await block(ws.id, "Preview occupied", 15, project.id),
    other = await block(foreign.id, "Preview foreign", 18, null);
  expect(
    (
      await page.request.put("/api/calendar/preferences", {
        headers: { origin },
        data: { workspaceIds: [ws.id, foreign.id] },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByLabel("View", { exact: true }).selectOption("day");
  const changes = writes(page);
  for (const [row, id] of [
    ["15:00:00", occupied.id],
    ["18:00:00", other.id],
  ]) {
    await point(page, row);
    await hold(page);
    const target = page.locator(`.fc [data-calendar-block-id="${id}"]`);
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    await move(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    await expect(preview(page)).toHaveAttribute(
      "data-drop-kind",
      "unavailable",
    );
    await expect(preview(page)).toHaveAttribute("data-drop-valid", "false");
    await page.mouse.up();
    await expect(preview(page)).toHaveCount(0);
    await expect(page.getByText(/^No assignment saved\./)).toBeVisible();
  }
  expect(changes).toEqual([]);
  await point(page, "12:00:00");
  await hold(page);
  const target = page.locator(`.fc [data-calendar-block-id="${empty.id}"]`);
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await move(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await expect(preview(page)).toHaveAttribute("data-drop-kind", "block");
  await expect(preview(page)).toHaveAttribute(
    "data-preview-start",
    empty.startAt,
  );
  await expect(preview(page)).toHaveAttribute("data-preview-end", empty.endAt);
  expect(changes).toEqual([]);
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === "PATCH" &&
      new URL(r.url()).pathname.endsWith(`/time-blocks/${empty.id}`),
  );
  await page.mouse.up();
  const response = await saved;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({
    id: empty.id,
    startAt: empty.startAt,
    endAt: empty.endAt,
    projectId: project.id,
  });
  expect(changes).toHaveLength(1);
  await noDialogs(page);
  await expect(preview(page)).toHaveCount(0);
});

test("filter/range/session invalidation cannot restore a phantom preview or save an obsolete held drag", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Mouse-only held drag; mobile session and scheduling controls run separately",
  );
  await setup(page);
  let p = await point(page, "12:00:00");
  const changes = writes(page);
  await hold(page);
  await move(page, p);
  await expect(preview(page)).toHaveAttribute("data-drop-valid", "true");
  await page
    .getByRole("textbox", { name: "Search work and block labels", exact: true })
    .fill("Hidden source");
  await expect(preview(page)).toHaveCount(0);
  await move(page, p);
  await page.mouse.up();
  expect(changes).toEqual([]);
  await page
    .getByRole("button", { name: "Clear Calendar filters", exact: true })
    .focus();
  // Deliberate activation follows dnd-kit's 50ms residual-click capture.
  await page.keyboard.press("Space", { delay: 75 });
  await expect(
    page.getByRole("textbox", {
      name: "Search work and block labels",
      exact: true,
    }),
  ).toHaveValue("");
  await hold(page);
  p = await point(page, "12:00:00");
  await move(page, p);
  await expect(preview(page)).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  // The pinned mouse sensor deliberately cancels on native window resize.
  await expect(preview(page)).toHaveCount(0);
  await page.mouse.up();
  expect(changes).toEqual([]);
  await hold(page);
  p = await point(page, "13:00:00");
  await move(page, p);
  await expect(preview(page)).toHaveAttribute(
    "data-preview-start",
    /^2030-06-03T13:15/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Date", { exact: true }).fill("2030-06-04");
  await expect(preview(page)).toHaveCount(0);
  await page.mouse.up();
  expect(changes).toEqual([]);
  p = await point(page, "12:00:00", "2030-06-04");
  await hold(page);
  await move(page, p);
  await expect(preview(page)).toBeVisible();
  await page.route("**/api/planner-session", (r) =>
    r.fulfill({ status: 503, json: { error: "Fixture unavailable" } }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", {
      name: "Could not verify your session",
      exact: true,
    }),
  ).toBeVisible();
  await expect(preview(page)).toHaveCount(0);
  await page.mouse.up();
  expect(changes).toEqual([]);
  await page.unroute("**/api/planner-session");
  await page
    .getByRole("button", { name: "Retry session check", exact: true })
    .focus();
  await page.keyboard.press("Space", { delay: 75 });
  await expect(page.locator('[data-session-state="ready"]')).toBeVisible();
  await move(page, p);
  await expect(preview(page)).toHaveCount(0);
  await hold(page);
  await move(page, p);
  await expect(preview(page)).toBeVisible();
  await cancel(page);
  expect(changes).toEqual([]);
  await noDialogs(page);
});

test("clipped cross-day intervals remain one elapsed hour and repeated or missing times require review", async ({
  page,
  isMobile,
}, testInfo) => {
  test.skip(
    isMobile,
    "Mouse preview; explicit DST form choices run on both profiles",
  );
  const { ws } = await setup(page);
  let p = await point(page, "23:30:00");
  const changes = writes(page);
  await hold(page);
  await move(page, p);
  await expect(preview(page)).toHaveAttribute("data-clipped", "true");
  await expect(preview(page)).toContainText("04 Jun 2030 00:45");
  await page.screenshot({
    path: testInfo.outputPath("clipped-cross-day-preview.png"),
  });
  const start = await preview(page).getAttribute("data-preview-start"),
    end = await preview(page).getAttribute("data-preview-end"),
    saved = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        new URL(r.url()).pathname === `/api/workspaces/${ws.id}/time-blocks`,
    );
  await page.mouse.up();
  const response = await saved;
  expect(response.status()).toBe(201);
  const value = await response.json();
  expect(Date.parse(value.startAt)).toBe(Date.parse(start!));
  expect(Date.parse(value.endAt)).toBe(Date.parse(end!));
  expect(Date.parse(value.endAt) - Date.parse(value.startAt)).toBe(3600000);
  await noDialogs(page);
  await setZone(page, "America/Los_Angeles");
  await page.reload();
  await page.getByLabel("Date", { exact: true }).fill("2030-11-03");
  await page.getByLabel("View", { exact: true }).selectOption("day");
  p = await point(page, "01:30:00", "2030-11-03");
  await hold(page);
  await move(page, p);
  await expect(preview(page)).toHaveAttribute("data-review-required", "true");
  await expect(preview(page)).toHaveAttribute("data-drop-valid", "false");
  await expect(preview(page)).toContainText(
    "occurrence or valid-time choice required",
  );
  await cancel(page);
  await page.getByLabel("Date", { exact: true }).fill("2030-03-10");
  p = await point(page, "01:30:00", "2030-03-10");
  await hold(page);
  await move(page, p);
  await expect(preview(page)).toHaveAttribute("data-drop-valid", "true");
  await expect(preview(page)).toContainText("03:45 -07:00");
  const endRow = (await page
      .locator('.fc-timegrid-slot-lane[data-time="03:30:00"]')
      .boundingBox())!,
    outline = (await page
      .locator("[data-calendar-drop-boundary]")
      .boundingBox())!;
  expect(
    Math.abs(outline.y + outline.height - (endRow.y + endRow.height / 2)),
  ).toBeLessThan(2);
  await cancel(page);
  p = await point(page, "02:00:00", "2030-03-10");
  await hold(page);
  await move(page, p);
  await expect(preview(page)).toHaveAttribute("data-review-required", "true");
  await expect(preview(page)).toHaveAttribute("data-drop-valid", "false");
  await cancel(page);
  expect(changes).toHaveLength(1);
});

test("failed work context clears held feedback and cannot make hidden blocks assignment targets", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Mouse-only hover context; filtering controls run on both profiles",
  );
  const { ws } = await setup(page),
    hidden = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
      requestKey: randomUUID(),
      label: "Hidden reservation",
      schedule: {
        startAt: "2030-06-03T12:00Z",
        endAt: "2030-06-03T13:00Z",
        timeZone: "UTC",
      },
      assignment: { projectId: null, taskId: null },
    });
  await page.reload();
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByLabel("View", { exact: true }).selectOption("day");
  await page
    .getByRole("textbox", { name: "Search work and block labels", exact: true })
    .fill("Preview project");
  const p = await point(page, "12:00:00"),
    changes = writes(page);
  await hold(page);
  await move(page, p);
  await expect(preview(page)).toHaveAttribute("data-drop-kind", "blank");
  await expect(preview(page)).toHaveAttribute(
    "data-preview-start",
    /^2030-06-03T12:15/,
  );
  expect(changes).toEqual([]);
  await cancel(page);
  const unchanged = await (
    await page.request.get(
      `/api/workspaces/${ws.id}/time-blocks?start=2030-06-03T00:00Z&end=2030-06-04T00:00Z`,
    )
  ).json();
  expect(
    unchanged.find((b: { id: string }) => b.id === hidden.id),
  ).toMatchObject({ taskId: null, projectId: null, revision: 1 });
  await hold(page);
  await move(page, p);
  await expect(preview(page)).toBeVisible();
  await page.route(`**/api/workspaces/${ws.id}/tasks`, (r) =>
    r.fulfill({ status: 503, json: { error: "Fixture failed picker" } }),
  );
  // View changes reload work context without a synthetic click swallowed by
  // the active mouse sensor's document capture.
  await page.getByLabel("View", { exact: true }).selectOption("week");
  await expect(preview(page)).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByText(/Work picker incomplete/)).toBeVisible();
  expect(changes).toEqual([]);
});

test("verified membership loss removes live feedback and old pointer callbacks cannot reschedule the removed work", async ({
  page,
  browser,
  isMobile,
  testAccounts,
  testWorkspaces,
}) => {
  test.skip(
    isMobile,
    "Mouse-only permission invalidation; explicit mobile access checks remain covered",
  );
  const shared = await post(page, "/api/workspaces", {
    name: "Preview access scope",
  });
  testWorkspaces.push(shared.id);
  const project = await post(page, `/api/workspaces/${shared.id}/projects`, {
    title: "Revoked preview work",
  });
  const email = randomUUID() + "@example.invalid";
  testAccounts.push(email);
  const member = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 900 },
  });
  try {
    const signup = await member.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: {
        name: "Preview editor",
        email,
        password: randomUUID() + randomUUID(),
      },
    });
    expect(signup.status()).toBe(200);
    expect(
      (
        await page.request.post(`/api/workspaces/${shared.id}/members`, {
          headers: { origin },
          data: { email },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await member.request.put("/api/calendar/preferences", {
          headers: { origin },
          data: { workspaceIds: [shared.id] },
        })
      ).status(),
    ).toBe(200);
    const mp = await member.newPage();
    await mp.goto("/calendar");
    await setZone(mp);
    await mp.reload();
    await mp.getByLabel("Date", { exact: true }).fill("2030-06-03");
    await mp.getByLabel("View", { exact: true }).selectOption("day");
    const p = await point(mp, "12:00:00"),
      changes = writes(mp);
    await hold(mp, project.title);
    await move(mp, p);
    await expect(preview(mp)).toHaveAttribute("data-drop-valid", "true");
    const detail = await (
        await page.request.get(`/api/workspaces/${shared.id}`)
      ).json(),
      membership = detail.members.find(
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
    await mp.getByLabel("View", { exact: true }).selectOption("week");
    await expect(preview(mp)).toHaveCount(0);
    await expect(
      mp.getByRole("button", {
        name: `Edit project: ${project.title}`,
        exact: true,
      }),
    ).toHaveCount(0);
    await move(mp, p);
    await mp.mouse.up();
    expect(changes).toEqual([]);
    await noDialogs(mp);
    await expect(preview(mp)).toHaveCount(0);
  } finally {
    await member.close();
  }
});
