import { randomUUID } from "node:crypto";
import type { CDPSession, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  post,
  personal,
  retained,
  setZone,
  closedEditor,
  origin,
} from "./planner-helpers";
import { sessionSignalKey } from "../../src/lib/session-signal";
import { openOrderActions } from "./order-helpers";

test.setTimeout(150000);
test.use({ actionTimeout: 15000 });
type Point = { x: number; y: number };
async function down(page: Page, point: Point, mobile: boolean) {
  if (!mobile) {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    return null;
  }
  const touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...point, id: 1 }],
  });

  return touch;
}
async function move(page: Page, touch: CDPSession | null, point: Point) {
  if (touch)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...point, id: 1 }],
    });
  else await page.mouse.move(point.x, point.y, { steps: 8 });
}
async function up(page: Page, touch: CDPSession | null, cancel = false) {
  if (touch) {
    await touch.send("Input.dispatchTouchEvent", {
      type: cancel ? "touchCancel" : "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
  } else {
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
  }
}
async function setup(page: Page, count = 3) {
  const ws = await personal(page),
    project = await post(page, `/api/workspaces/${ws.id}/projects`, {
      title: "Cancellation project",
    });
  const rows = [];
  for (let index = 0; index < count; index++)
    rows.push(
      await post(page, `/api/workspaces/${ws.id}/tasks`, {
        projectId: project.id,
        title: "Hold row " + (index + 1),
        description: "Selectable description",
      }),
    );
  await page.reload();
  await page
    .getByRole("button", {
      name: "Expand project: Cancellation project",
      exact: true,
    })
    .click();
  return { ws, project, rows };
}

test("a failed session check retires a pending hold without losing independent work, comment or list input", async ({
  page,
  isMobile,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Hold row 1", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Kept work input");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await page
    .getByLabel("New comment text", { exact: true })
    .fill("Kept comment input");
  await page
    .getByRole("button", { name: "Add checklist", exact: true })
    .click();
  await page
    .getByLabel("Section name", { exact: true })
    .fill("Kept list input");
  await retained(page);
  let writes = 0,
    failed = true;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/task-order"))
      writes++;
  });
  await page.route("**/api/planner-session", (route) =>
    failed ? route.fulfill({ status: 503, json: {} }) : route.continue(),
  );
  const source = page.getByRole("button", { name: "Hold row 3", exact: true });
  await source.scrollIntoViewIfNeeded();
  const a = (await source.boundingBox())!;
  const touch = await down(page, { x: a.x + 30, y: a.y + 20 }, isMobile);
  await page.waitForTimeout(100);
  await page.evaluate(
    (key) => window.dispatchEvent(new StorageEvent("storage", { key })),
    sessionSignalKey,
  );
  await expect(
    page.getByRole("heading", {
      name: "Could not verify your session",
      exact: true,
    }),
  ).toBeVisible();
  await page.waitForTimeout(450);
  await up(page, touch);
  expect(writes).toBe(0);
  await expect(page.locator("[data-order-overlay]")).toHaveCount(0);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  failed = false;
  await page
    .getByRole("button", { name: "Retry session check", exact: true })
    .click();
  await expect(source).toBeVisible();
  await page
    .getByRole("button", {
      name: "Review comment draft: Hold row 1",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Kept work input");
  await expect(
    page.getByLabel("New comment text", { exact: true }),
  ).toHaveValue("Kept comment input");
  await expect(page.getByLabel("Section name", { exact: true })).toHaveValue(
    "Kept list input",
  );
  expect(writes).toBe(0);
});

test("Projects edge scrolling displaces siblings before release and cancellation restores order without scroll growth", async ({
  page,
  isMobile,
}, info) => {
  const { rows } = await setup(page, 20);
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/task-order"))
      writes++;
  });
  const source = page.getByRole("button", { name: "Hold row 1", exact: true });
  await source.evaluate((node) => node.scrollIntoView({ block: "center" }));
  if (isMobile) {
    const box = (await source.boundingBox())!,
      initial = await page.evaluate(() => scrollY);
    const touch = await page.context().newCDPSession(page);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + 40, y: box.y + 20, id: 1 }],
    });
    for (let step = 1; step <= 12; step++) {
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: box.x + 40, y: box.y + 20 - step * 10, id: 1 }],
      });
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeGreaterThan(initial + 40);
    expect(writes).toBe(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await source.evaluate((node) => node.scrollIntoView({ block: "center" }));
  }
  const before = await page.evaluate(() => ({
    y: scrollY,
    height: document.documentElement.scrollHeight,
  }));
  const a = (await source.boundingBox())!;
  const touch = await down(page, { x: a.x + 30, y: a.y + 20 }, isMobile);
  await page.waitForTimeout(isMobile ? 400 : 0);
  try {
    await move(page, touch, {
      x: a.x + 35,
      y: page.viewportSize()!.height - 10,
    });
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeGreaterThan(before.y + 50);
    const list = page.getByRole("list", {
      name: "Project task order",
      exact: true,
    });
    await expect
      .poll(() =>
        list.locator(":scope > li").first().getAttribute("data-order-task"),
      )
      .not.toBe(rows[0].id);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBe(before.height);
    expect(writes).toBe(0);
    await page.screenshot({
      path: `.local/task026-${info.project.name}-edge-scroll.png`,
    });
  } finally {
    await up(page, touch, true);
  }
  await expect(page.locator("[data-order-overlay]")).toHaveCount(0);
  const y = await page.evaluate(() => scrollY);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => scrollY)).toBe(y);
  const actual = await page
    .getByRole("list", { name: "Project task order", exact: true })
    .locator(":scope > li")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.orderTask),
    );
  expect(actual).toEqual(rows.map((row) => row.id));
  expect(writes).toBe(0);
  if (isMobile) await source.tap();
  else await source.click();
  await expect(
    page.getByRole("dialog", { name: "Edit task", exact: true }),
  ).toBeVisible();
  const description = page.getByRole("textbox", {
    name: "Description",
    exact: true,
  });
  await description.selectText();
  expect(
    await description.evaluate(
      (node) =>
        (node as HTMLTextAreaElement).selectionEnd -
        (node as HTMLTextAreaElement).selectionStart,
    ),
  ).toBe("Selectable description".length);
});

test("compact keyboard Move actions preserve an expanded subtree and reduced-motion dragging retains its identities", async ({
  page,
  isMobile,
}, info) => {
  const { ws, project, rows } = await setup(page);
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/task-order"))
      writes++;
  });
  const child = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Expanded child",
    parentId: rows[0].id,
  });
  await page.reload();
  await page
    .getByRole("button", {
      name: "Expand project: Cancellation project",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Expand task: Hold row 1", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Move down: Hold row 1", exact: true }),
  ).toHaveCount(0);
  await openOrderActions(page, "Hold row 1");
  const downButton = page.getByRole("button", {
    name: "Move down: Hold row 1",
    exact: true,
  });
  await downButton.focus();
  await page.keyboard.press("Enter");
  const get = async () =>
    (
      await (
        await page.request.get(`/api/workspaces/${ws.id}/task-order`)
      ).json()
    ).find(
      (scope: { scopeKey: string }) =>
        scope.scopeKey === "project/" + project.id,
    ).ids;
  await expect.poll(get).toEqual([rows[1].id, rows[0].id, rows[2].id]);
  await expect
    .poll(() =>
      page
        .getByRole("list", { name: "Project task order", exact: true })
        .locator(":scope > li")
        .evaluateAll((nodes) =>
          nodes.map((node) => (node as HTMLElement).dataset.orderTask),
        ),
    )
    .toEqual([rows[1].id, rows[0].id, rows[2].id]);
  await expect(
    page.getByRole("button", {
      name: "Move down: Hold row 1",
      exact: true,
      includeHidden: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: child.title, exact: true }),
  ).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await openOrderActions(page, "Hold row 2");
  const source = page.getByRole("button", { name: "Hold row 1", exact: true });
  await page
    .getByRole("list", { name: "Project task order", exact: true })
    .evaluate((node) => node.scrollIntoView({ block: "center" }));
  const noOpBox = (await source.boundingBox())!;
  const noOp = await down(
    page,
    { x: noOpBox.x + 30, y: noOpBox.y + 20 },
    isMobile,
  );
  if (isMobile) await page.waitForTimeout(400);
  else await move(page, noOp, { x: noOpBox.x + 40, y: noOpBox.y + 20 });
  await up(page, noOp);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toBe(1);
  const a = (await source.boundingBox())!,
    b = (await page
      .getByRole("button", { name: "Hold row 3", exact: true })
      .boundingBox())!;
  const touch = await down(page, { x: a.x + 30, y: a.y + 20 }, isMobile);
  await page.waitForTimeout(isMobile ? 400 : 0);
  try {
    await move(page, touch, { x: b.x + 30, y: b.y + b.height - 2 });
    await expect
      .poll(() =>
        page
          .getByRole("list", { name: "Project task order", exact: true })
          .locator(":scope > li")
          .last()
          .getAttribute("data-order-task"),
      )
      .toBe(rows[0].id);
    await expect(
      page.getByRole("button", { name: child.title, exact: true }),
    ).toHaveCount(1);
    await page.screenshot({
      path: `.local/task026-${info.project.name}-expanded-reduced-motion.png`,
    });
  } finally {
    await up(page, touch);
  }
  await expect.poll(get).toEqual([rows[1].id, rows[2].id, rows[0].id]);
  expect(writes).toBe(2);
  const saved = await (
    await page.request.get(`/api/workspaces/${ws.id}/tasks/${child.id}`)
  ).json();
  expect(saved).toMatchObject({
    id: child.id,
    parentId: rows[0].id,
    projectId: project.id,
    revision: child.revision,
    status: child.status,
  });
});

for (const kind of ["palette", "saved event"])
  test(`Calendar ${kind} hold retires on a range change and cannot resurrect after release`, async ({
    page,
    isMobile,
  }) => {
    const ws = await personal(page);
    await setZone(page);
    await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Range-bound work",
    });
    if (kind === "palette" && isMobile)
      for (let index = 0; index < 15; index++)
        await post(page, `/api/workspaces/${ws.id}/tasks`, {
          title: "Scrollable palette " + index,
        });
    const block = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
      label: "Range-bound block",
      requestKey: randomUUID(),
      assignment: { taskId: null, projectId: null },
      schedule: {
        startAt: "2030-06-03T13:00Z",
        endAt: "2030-06-03T14:00Z",
        timeZone: "UTC",
      },
    });
    await page.goto("/calendar");
    await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
    await page.getByLabel("View", { exact: true }).selectOption("day");
    const source =
      kind === "palette"
        ? page.getByRole("button", {
            name: "Edit task: Range-bound work",
            exact: true,
          })
        : page.locator(`[data-calendar-block-id="${block.id}"]`);
    await source.scrollIntoViewIfNeeded();
    if (kind === "palette" && isMobile) {
      const palette = page.locator('[aria-label="Calendar work palette"]'),
        box = (await source.boundingBox())!;
      const touch = await page.context().newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: box.x + 40, y: box.y + 20, id: 1 }],
      });
      for (let step = 1; step <= 12; step++) {
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: box.x + 40, y: box.y + 20 - step * 10, id: 1 }],
        });
        await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touch.detach();
      await expect
        .poll(() => palette.evaluate((node) => node.scrollTop))
        .toBeGreaterThan(40);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await palette.evaluate((node) => {
        node.scrollTop = 0;
      });
      await source.scrollIntoViewIfNeeded();
    }
    let writes = 0;
    page.on("request", (request) => {
      if (request.method() !== "GET" && request.url().includes("/time-blocks"))
        writes++;
    });
    const a = (await source.boundingBox())!;
    const touch = await down(
      page,
      { x: a.x + a.width / 2, y: a.y + 20 },
      isMobile,
    );
    await page.waitForTimeout(kind === "palette" ? 400 : 100);
    await page.getByLabel("Date", { exact: true }).fill("2030-06-04");
    await page.waitForTimeout(450);
    await up(page, touch);
    await expect(
      page.locator(
        "[data-calendar-drop-preview],.fc-event-mirror,[data-gesture-active]",
      ),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(writes).toBe(0);
    await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
      "2030-06-04",
    );
    await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
    await expect(source).toBeVisible();
    if (isMobile) await source.tap();
    else await source.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await closedEditor(page);
    expect(writes).toBe(0);
  });

test("an account switch retires pending or active holds before the new account can edit", async ({
  page,
  context,
  browser,
  isMobile,
  testAccounts,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Hold row 1", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Account A private retained input");
  await retained(page);
  const email = randomUUID() + "@example.invalid";
  testAccounts.push(email);
  const other = await browser.newContext({ baseURL: origin });
  let cookies;
  try {
    const response = await other.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: {
        email,
        name: "Next account",
        password: randomUUID() + randomUUID(),
      },
    });
    expect(response.status()).toBe(200);
    cookies = await other.cookies();
  } finally {
    await other.close();
  }
  const source = page.getByRole("button", { name: "Hold row 3", exact: true });
  await source.scrollIntoViewIfNeeded();
  const a = (await source.boundingBox())!;
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/task-order"))
      writes++;
  });
  const touch = await down(page, { x: a.x + 30, y: a.y + 20 }, isMobile);
  await page.waitForTimeout(100);
  await context.addCookies(cookies!);
  await page.evaluate(
    (key) => window.dispatchEvent(new StorageEvent("storage", { key })),
    sessionSignalKey,
  );
  await expect(
    page.getByText("Signed in as " + email, { exact: true }),
  ).toBeVisible();
  await up(page, touch);
  await page.waitForTimeout(450);
  expect(writes).toBe(0);
  await expect(
    page.getByRole("button", { name: "Hold row 3", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Account A private retained input", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator("[data-order-overlay],[data-gesture-active]"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("Account B kept input");
  await page.waitForTimeout(400);
  await expect(title).toHaveValue("Account B kept input");
});
