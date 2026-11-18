import type { CDPSession, Page, Request } from "@playwright/test";
import { test, expect } from "./fixtures";
import { personal, post, setZone, closedEditor } from "./planner-helpers";

test.setTimeout(150000);
test.use({ actionTimeout: 15000 });
type Point = { x: number; y: number };
async function press(page: Page, point: Point, mobile: boolean) {
  if (!mobile) {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 10, point.y, { steps: 3 });
    return null;
  }
  const touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...point, id: 1 }],
  });
  await page.waitForTimeout(400);
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
async function release(page: Page, touch: CDPSession | null, cancel = false) {
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
async function swipe(page: Page, point: Point, delta: Point) {
  const touch = await page.context().newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...point, id: 1 }],
  });
  for (let step = 1; step <= 12; step++) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: point.x + (delta.x * step) / 12,
          y: point.y + (delta.y * step) / 12,
          id: 1,
        },
      ],
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await touch.detach();
}
async function setup(page: Page) {
  const ws = await personal(page);
  const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Gesture project",
  });
  const rows = [];
  for (const title of ["Item 1", "Item 3", "Item 2"])
    rows.push(
      await post(page, `/api/workspaces/${ws.id}/tasks`, {
        title,
        projectId: project.id,
      }),
    );
  await page.reload();
  await page
    .getByRole("button", {
      name: "Expand project: Gesture project",
      exact: true,
    })
    .click();
  return { ws, project, rows };
}
function settledReads(page: Page) {
  const pending = new Set<Request>();
  page.on("request", (request) => {
    if (request.url().includes("/api/")) pending.add(request);
  });
  const finish = (request: Request) => pending.delete(request);
  page.on("requestfinished", finish);
  page.on("requestfailed", finish);
  return async () => {
    await expect
      .poll(async () => {
        if (pending.size) return false;
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        return (
          pending.size === 0 &&
          (await page
            .locator("[data-session-state]")
            .getAttribute("data-session-state")) === "ready"
        );
      })
      .toBe(true);
  };
}
const ids = (page: Page) =>
  page
    .getByRole("list", { name: "Project task order", exact: true })
    .locator(":scope > [data-order-task]")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.orderTask),
    );

test("Projects whole-row mouse and genuine touch preview 1/3/2 as 1/2/3 before one release write", async ({
  page,
  isMobile,
}, info) => {
  const { ws, project, rows } = await setup(page);
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/task-order"))
      writes++;
  });
  const source = page.getByRole("button", { name: "Item 3", exact: true });
  await source.scrollIntoViewIfNeeded();
  const a = (await source.boundingBox())!,
    b = (await page
      .getByRole("button", { name: "Item 2", exact: true })
      .boundingBox())!;
  const first = (await page
    .getByRole("button", { name: "Item 1", exact: true })
    .boundingBox())!;
  const touch = await press(page, { x: a.x + 30, y: a.y + 20 }, isMobile);
  try {
    await move(page, touch, { x: b.x + 30, y: b.y + b.height - 2 });
    await expect
      .poll(() => ids(page))
      .toEqual([rows[0].id, rows[2].id, rows[1].id]);
    const bounds = await page
      .getByRole("list", { name: "Project task order", exact: true })
      .evaluate((list) => {
        const rect = list.getBoundingClientRect();
        return [
          ...list.querySelectorAll<HTMLElement>(":scope > [data-order-task]"),
        ].map((row) => {
          const r = row.getBoundingClientRect();
          return r.top >= rect.top - 1 && r.bottom <= rect.bottom + 1;
        });
      });
    expect(bounds).toEqual([true, true, true]);
    for (const offset of [21, 24, 22]) {
      await move(page, touch, { x: b.x + 30, y: b.y + offset });
      await expect
        .poll(() => ids(page))
        .toEqual([rows[0].id, rows[2].id, rows[1].id]);
    }
    await move(page, touch, { x: b.x + 30, y: b.y + 5 });
    await expect
      .poll(() => ids(page))
      .toEqual([rows[0].id, rows[1].id, rows[2].id]);
    await move(page, touch, { x: first.x + 30, y: first.y + 5 });
    await expect
      .poll(() => ids(page))
      .toEqual([rows[1].id, rows[0].id, rows[2].id]);
    await move(page, touch, { x: b.x + 30, y: b.y + b.height - 2 });
    await expect
      .poll(() => ids(page))
      .toEqual([rows[0].id, rows[2].id, rows[1].id]);
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    expect(
      (await page
        .getByRole("button", { name: "Item 2", exact: true })
        .boundingBox())!.y,
    ).toBeLessThan(b.y - 15);
    expect(writes).toBe(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => document.getSelection()?.toString())).toBe(
      "",
    );
    await page.screenshot({
      path: `.local/task026-${info.project.name}-sibling-preview.png`,
    });
  } finally {
    await release(page, touch);
  }
  await expect
    .poll(async () => {
      const orders = await (
        await page.request.get(`/api/workspaces/${ws.id}/task-order`)
      ).json();
      return orders.find(
        (order: { scopeKey: string }) =>
          order.scopeKey === "project/" + project.id,
      ).ids;
    })
    .toEqual([rows[0].id, rows[2].id, rows[1].id]);
  expect(writes).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Drag to reorder: Item 3", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Move up: Item 3", exact: true }),
  ).toHaveCount(0);
  if (isMobile) await source.tap();
  else await source.click();
  await expect(
    page.getByRole("dialog", { name: "Edit task", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await closedEditor(page);
});

test("Board genuine pre-hold swipe and second finger cancel, then one deliberate hold moves the whole card", async ({
  page,
  isMobile,
}, info) => {
  const ws = await personal(page);
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Deliberate Board card",
    status: "backlog",
  });
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "PATCH" && request.url().endsWith("/status"))
      writes++;
  });
  await page.goto("/board");
  const region = page.getByRole("region", {
    name: "Board statuses",
    exact: true,
  });
  const card = page.getByRole("button", { name: task.title, exact: true });
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  if (isMobile) {
    const box = (await card.boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    await swipe(page, { x: box.x + 150, y: box.y + 30 }, { x: -140, y: 0 });
    await expect
      .poll(() => region.evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(50);
    expect(writes).toBe(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await region.evaluate((node) => {
      node.scrollLeft = 0;
    });
    const current = (await card.boundingBox())!;
    const point = { x: current.x + 70, y: current.y + 30, id: 1 };
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await page.waitForTimeout(100);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point, { x: point.x + 30, y: point.y + 30, id: 2 }],
    });
    await page.waitForTimeout(400);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
    expect(writes).toBe(0);
    await expect(page.locator("[data-drag-preview]")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  const a = (await card.boundingBox())!;
  const column = page.locator('section[aria-label="To do column"]');
  const b = (await column.boundingBox())!;
  const touch = await press(page, { x: a.x + 50, y: a.y + 25 }, isMobile);
  try {
    await move(page, touch, {
      x: Math.min(b.x + b.width / 2, page.viewportSize()!.width - 25),
      y: a.y + 30,
    });
    if (isMobile) {
      await expect
        .poll(async () => (await column.boundingBox())!.x)
        .toBeLessThan(page.viewportSize()!.width / 2);
      const landed = (await column.boundingBox())!;
      await move(page, touch, {
        x:
          (Math.max(landed.x, 40) +
            Math.min(
              landed.x + landed.width,
              page.viewportSize()!.width - 30,
            )) /
          2,
        y: a.y + 30,
      });
    }
    await expect(column).toHaveClass(/border-teal-800/);
    expect(writes).toBe(0);
    await page.screenshot({
      path: `.local/task026-${info.project.name}-board-landing.png`,
    });
  } finally {
    await release(page, touch);
  }
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/workspaces/${ws.id}/tasks/${task.id}`)
          ).json()
        ).status,
    )
    .toBe("todo");
  expect(writes).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  if (isMobile) await card.tap();
  else await card.click();
  await expect(
    page.getByRole("dialog", { name: "Edit task", exact: true }),
  ).toBeVisible();
});

async function calendar(page: Page) {
  const ws = await personal(page);
  await setZone(page);
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Touch calendar work",
  });
  const block = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
    label: "Touch reservation",
    requestKey: crypto.randomUUID(),
    assignment: { projectId: null, taskId: null },
    schedule: {
      startAt: "2030-06-03T13:00Z",
      endAt: "2030-06-03T14:00Z",
      timeZone: "UTC",
    },
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByLabel("View", { exact: true }).selectOption("day");
  await expect(
    page.locator(`[data-calendar-block-id="${block.id}"]`),
  ).toBeVisible();
  return { ws, task, block };
}
async function gridAt(page: Page, time: string) {
  await page
    .locator(`.fc-timegrid-slot-lane[data-time="${time}"]`)
    .evaluate((row) => {
      const scroller = row.closest<HTMLElement>(".fc-scroller")!;
      scroller.scrollTop +=
        row.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        150;
    });
}
async function fitDrag(page: Page, sourceName: string, time: string) {
  const source = await page
    .getByRole("button", { name: sourceName, exact: true })
    .boundingBox();
  const target = await page
    .locator(`.fc-timegrid-slot-lane[data-time="${time}"]`)
    .boundingBox();
  const bottom = Math.max(
    source!.y + source!.height,
    target!.y + target!.height,
  );
  if (bottom > page.viewportSize()!.height - 30)
    await page.evaluate(
      (delta) => window.scrollBy(0, delta),
      bottom - page.viewportSize()!.height + 30,
    );
}

test("Calendar palette hold previews and creates once, then assigns an empty block without changing its interval", async ({
  page,
  isMobile,
}, info) => {
  const settle = settledReads(page);
  const { ws, task, block } = await calendar(page);
  let writes = 0;
  page.on("request", (request) => {
    if (
      ["POST", "PATCH"].includes(request.method()) &&
      /\/time-blocks(?:\/[^/]+)?$/.test(request.url())
    )
      writes++;
  });
  const source = page.getByRole("button", {
    name: "Edit task: Touch calendar work",
    exact: true,
  });
  await source.scrollIntoViewIfNeeded();
  await gridAt(page, "11:00:00");
  await fitDrag(page, "Edit task: Touch calendar work", "11:00:00");
  await settle();
  const a = (await source.boundingBox())!;
  const b = (await page
    .locator('.fc-timegrid-slot-lane[data-time="11:00:00"]')
    .boundingBox())!;
  const touch = await press(
    page,
    { x: a.x + a.width / 2, y: a.y + 20 },
    isMobile,
  );
  let start = "";
  try {
    await move(page, touch, { x: b.x + b.width / 2, y: b.y + 3 });
    const preview = page.locator("[data-calendar-drop-preview]");
    await expect(preview).toHaveAttribute("data-drop-kind", "blank");
    const lane = page.locator('.fc-timegrid-slot-lane[data-time="11:00:00"]');
    const pane = await lane.evaluate((node) => {
      const rect = node.closest(".fc-scroller")!.getBoundingClientRect();
      return {
        top: Math.max(0, rect.top),
        bottom: Math.min(innerHeight, rect.bottom),
      };
    });
    await move(page, touch, { x: b.x + b.width / 2, y: pane.bottom - 8 });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const scrollingFrom = await lane.evaluate(
      (node) => node.closest<HTMLElement>(".fc-scroller")!.scrollTop,
    );
    const earlier = await preview.getAttribute("data-preview-start");
    await expect
      .poll(() =>
        lane.evaluate(
          (node) => node.closest<HTMLElement>(".fc-scroller")!.scrollTop,
        ),
      )
      .toBeGreaterThan(scrollingFrom + 35);
    await expect(preview).not.toHaveAttribute("data-preview-start", earlier!);
    expect(writes).toBe(0);
    await move(page, touch, { x: b.x + b.width / 2, y: pane.top + 70 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(preview).toHaveAttribute("data-drop-kind", "blank");
    start = (await preview.getAttribute("data-preview-start"))!;
    expect(writes).toBe(0);
    await page.screenshot({
      path: `.local/task026-${info.project.name}-palette-preview.png`,
    });
  } finally {
    await release(page, touch);
  }
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(
              `/api/workspaces/${ws.id}/time-blocks?start=2030-06-03T00%3A00Z&end=2030-06-04T00%3A00Z`,
            )
          ).json()
        ).length,
    )
    .toBe(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await settle();
  const saved = await (
    await page.request.get(
      `/api/workspaces/${ws.id}/time-blocks?start=2030-06-03T00%3A00Z&end=2030-06-04T00%3A00Z`,
    )
  ).json();
  expect(
    Date.parse(
      saved.find((row: { id: string }) => row.id !== block.id).startAt,
    ),
  ).toBe(Date.parse(start));
  expect(writes).toBe(1);
  await source.scrollIntoViewIfNeeded();
  await gridAt(page, "13:00:00");
  await fitDrag(page, "Edit task: Touch calendar work", "13:00:00");
  const target = page.locator(`[data-calendar-block-id="${block.id}"]`);
  const c = (await source.boundingBox())!,
    d = (await target.boundingBox())!;
  const assignment = await press(
    page,
    { x: c.x + c.width / 2, y: c.y + 20 },
    isMobile,
  );
  try {
    await move(page, assignment, { x: d.x + d.width / 2, y: d.y + 20 });
    await expect(page.locator("[data-calendar-drop-preview]")).toHaveAttribute(
      "data-drop-kind",
      "block",
    );
    expect(writes).toBe(1);
  } finally {
    await release(page, assignment);
  }
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(
              `/api/workspaces/${ws.id}/time-blocks?start=2030-06-03T00%3A00Z&end=2030-06-04T00%3A00Z`,
            )
          ).json()
        ).find((row: { id: string }) => row.id === block.id).task?.id,
    )
    .toBe(task.id);
  const assigned = (
    await (
      await page.request.get(
        `/api/workspaces/${ws.id}/time-blocks?start=2030-06-03T00%3A00Z&end=2030-06-04T00%3A00Z`,
      )
    ).json()
  ).find((row: { id: string }) => row.id === block.id);
  expect(assigned.startAt).toBe(block.startAt);
  expect(assigned.endAt).toBe(block.endAt);
  expect(assigned.label).toBe(block.label);
  expect(writes).toBe(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Saved Calendar events retain native pre-hold scrolling, touch move/resize and cancel without a popup", async ({
  page,
  isMobile,
}, info) => {
  const settle = settledReads(page);
  const { ws, block } = await calendar(page);
  await page.locator(".fc").scrollIntoViewIfNeeded();
  await gridAt(page, "13:00:00");
  await settle();
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      request.url().endsWith("/time-blocks/" + block.id)
    )
      writes++;
  });
  const event = page.locator(`[data-calendar-block-id="${block.id}"]`);
  if (isMobile) {
    const before = await event.evaluate(
      (node) =>
        node.closest(".fc")!.querySelectorAll<HTMLElement>(".fc-scroller")[1]
          .scrollTop,
    );
    const box = (await event.boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    await swipe(
      page,
      { x: box.x + box.width / 2, y: box.y + 30 },
      { x: 0, y: -120 },
    );
    await touch.detach();
    await expect
      .poll(() =>
        event.evaluate(
          (node) =>
            node
              .closest(".fc")!
              .querySelectorAll<HTMLElement>(".fc-scroller")[1].scrollTop,
        ),
      )
      .not.toBe(before);
    expect(writes).toBe(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await gridAt(page, "13:00:00");
  }
  const slot = (await page
    .locator('.fc-timegrid-slot-lane[data-time="13:00:00"]')
    .boundingBox())!;
  const a = (await event.boundingBox())!;
  const touch = await press(
    page,
    { x: a.x + a.width / 2, y: a.y + 20 },
    isMobile,
  );
  try {
    await move(page, touch, {
      x: a.x + a.width / 2,
      y: a.y + 20 + slot.height * 2,
    });
  } finally {
    await release(page, touch);
  }
  const get = async () =>
    (
      await (
        await page.request.get(
          `/api/workspaces/${ws.id}/time-blocks?start=2030-06-03T00%3A00Z&end=2030-06-04T00%3A00Z`,
        )
      ).json()
    ).find((row: { id: string }) => row.id === block.id);
  await expect.poll(async () => (await get()).revision).toBe(2);
  expect(
    Date.parse((await get()).endAt) - Date.parse((await get()).startAt),
  ).toBe(3600000);
  await settle();
  await expect(event).toBeVisible();
  if (isMobile) {
    const selection = (await event.boundingBox())!;
    const selecting = await press(
      page,
      { x: selection.x + selection.width / 2, y: selection.y + 20 },
      true,
    );
    await release(page, selecting);
    expect(writes).toBe(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } else await event.hover();
  const resizer = event.locator(".fc-event-resizer-end");
  await expect(resizer).toBeVisible();
  const r = (await resizer.boundingBox())!;
  const resize = await press(
    page,
    { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    isMobile,
  );
  try {
    await move(page, resize, {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2 + slot.height * 2,
    });
  } finally {
    await release(page, resize);
  }
  await expect.poll(async () => (await get()).revision).toBe(3);
  expect(
    Date.parse((await get()).endAt) - Date.parse((await get()).startAt),
  ).toBe(7200000);
  await settle();
  await page.screenshot({
    path: `.local/task026-${info.project.name}-saved-touch-event.png`,
  });
  if (isMobile) {
    const box = (await event.boundingBox())!;
    const selection = await press(
      page,
      { x: box.x + box.width / 2, y: box.y + 20 },
      true,
    );
    await release(page, selection);
    expect(writes).toBe(2);
    const paneBefore = await event.evaluate(
      (node) => node.closest<HTMLElement>(".fc-scroller")!.scrollTop,
    );
    const panBox = (await event.boundingBox())!;
    await swipe(
      page,
      { x: panBox.x + panBox.width / 2, y: panBox.y + 25 },
      { x: 0, y: -100 },
    );
    await expect
      .poll(() =>
        event.evaluate(
          (node) => node.closest<HTMLElement>(".fc-scroller")!.scrollTop,
        ),
      )
      .toBeGreaterThan(paneBefore + 40);
    expect((await get()).revision).toBe(3);
    expect(writes).toBe(2);
    await gridAt(page, "13:00:00");
    await event.tap();
    await expect(
      page.getByRole("dialog", { name: /Edit time block/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await closedEditor(page);
    await settle();
    expect((await get()).revision).toBe(3);
    expect(writes).toBe(2);
  }
  const c = (await event.boundingBox())!;
  const cancel = await press(
    page,
    { x: c.x + c.width / 2, y: c.y + 20 },
    isMobile,
  );
  await move(page, cancel, {
    x: c.x + c.width / 2,
    y: c.y + 20 + slot.height * 2,
  });
  await expect(page.locator(".fc-event-mirror").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await release(page, cancel, true);
  expect((await get()).revision).toBe(3);
  expect(writes).toBe(2);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  if (isMobile) await event.tap();
  else await event.click();
  await expect(
    page.getByRole("dialog", { name: /Edit time block/ }),
  ).toBeVisible();
});
