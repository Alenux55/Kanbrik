import { randomUUID } from "node:crypto";
import type { CDPSession, Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { testDB } from "../database";
import {
  personal,
  post,
  setZone,
  closedEditor,
  origin,
} from "./planner-helpers";

test.setTimeout(150000);
test.use({ actionTimeout: 15000 });
type Point = { x: number; y: number };
type Mode = "move" | "resize";
const waiters = new WeakMap<Page, () => Promise<void>>();
const mirror = (page: Page) => page.locator(".fc-event-mirror").first();
const frame = (page: Page) =>
  page.evaluate(() => new Promise(requestAnimationFrame));

async function move(page: Page, touch: CDPSession | null, point: Point) {
  if (touch)
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...point, id: 1 }],
    });
  else await page.mouse.move(point.x, point.y, { steps: 4 });
}
async function release(page: Page, touch: CDPSession | null, cancel = false) {
  if (cancel) await page.keyboard.press("Escape");
  if (touch) {
    await touch.send("Input.dispatchTouchEvent", {
      type: cancel ? "touchCancel" : "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
    // FullCalendar v6 ignores synthetic compatibility mouse input for 500 ms
    // after touch ends. Do not start the next deliberate mouse gesture in it.
    await page.waitForTimeout(550);
  } else await page.mouse.up();
}
async function down(page: Page, point: Point, touchInput: boolean) {
  if (!touchInput) {
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
async function position(page: Page) {
  await page.locator(".fc").scrollIntoViewIfNeeded();
  await page
    .locator('.fc-timegrid-slot-lane[data-time="13:00:00"]')
    .evaluate((row) => {
      const pane = row.closest<HTMLElement>(".fc-scroller")!;
      pane.scrollTop +=
        row.getBoundingClientRect().top -
        pane.getBoundingClientRect().top -
        140;
    });
  await frame(page);
}
async function setup(page: Page) {
  const pendingReads = new Set<import("@playwright/test").Request>();
  page.on("request", (request) => {
    if (request.url().includes("/api/")) pendingReads.add(request);
  });
  const finished = (request: import("@playwright/test").Request) =>
    pendingReads.delete(request);
  page.on("requestfinished", finished);
  page.on("requestfailed", finished);
  waiters.set(page, async () => {
    await expect
      .poll(async () => {
        if (pendingReads.size) return false;
        await frame(page);
        await frame(page);
        return (
          pendingReads.size === 0 &&
          (await page
            .locator("[data-session-state]")
            .getAttribute("data-session-state")) === "ready"
        );
      })
      .toBe(true);
  });
  const ws = await personal(page);
  await setZone(page);
  const block = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
    requestKey: randomUUID(),
    label: "Native bounded reservation",
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
  const event = page.locator(
    `[data-calendar-block-id="${block.id}"]:not(.fc-event-mirror)`,
  );
  await expect(event).toBeVisible();
  await position(page);
  const pane = page
    .locator('.fc-timegrid-slot-lane[data-time="13:00:00"]')
    .locator(
      "xpath=ancestor::*[contains(concat(' ',normalize-space(@class),' '),' fc-scroller ')][1]",
    );
  const changes: object[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      request.url().endsWith("/time-blocks/" + block.id)
    )
      changes.push(request.postDataJSON());
  });
  const saved = async () =>
    (
      await (
        await page.request.get(
          `/api/workspaces/${ws.id}/time-blocks?start=2030-06-03T00%3A00Z&end=2030-06-04T00%3A00Z`,
        )
      ).json()
    ).find((row: { id: string }) => row.id === block.id);
  return { ws, block, event, pane, changes, saved };
}
async function start(page: Page, event: Locator, mode: Mode, mobile: boolean) {
  await waiters.get(page)!();
  if (mode === "resize") {
    if (mobile) {
      const box = (await event.boundingBox())!;
      const selecting = await down(
        page,
        { x: box.x + box.width / 2, y: box.y + 10 },
        true,
      );
      await page.waitForTimeout(400);
      await release(page, selecting);
    } else await event.hover();
  }
  const source =
    mode === "resize" ? event.locator(".fc-event-resizer-end") : event;
  await expect(source).toBeVisible();
  const box = (await source.boundingBox())!;
  const point = {
    x: box.x + box.width / 2,
    y: box.y + (mode === "resize" ? box.height / 2 : 10),
  };
  const touch = await down(page, point, mobile);
  if (mobile) await page.waitForTimeout(400);
  await move(page, touch, { x: point.x, y: point.y + 25 });
  await expect(mirror(page)).toBeVisible();
  return touch;
}
async function geometry(page: Page) {
  return page.evaluate(() => ({
    x: scrollX,
    y: scrollY,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
}
async function stationaryOutside(
  page: Page,
  touch: CDPSession | null,
  pane: Locator,
  point: Point,
) {
  await move(page, touch, point);
  expect(
    await page.evaluate(
      (p) =>
        !document
          .elementFromPoint(p.x, p.y)
          ?.closest("[data-calendar-gesture-region]"),
      point,
    ),
  ).toBe(true);
  const before = await geometry(page),
    paneBefore = await pane.evaluate((node) => ({
      x: node.scrollLeft,
      y: node.scrollTop,
    }));
  await page.waitForTimeout(850);
  expect(await geometry(page)).toEqual(before);
  expect(
    await pane.evaluate((node) => ({ x: node.scrollLeft, y: node.scrollTop })),
  ).toEqual(paneBefore);
}

for (const mode of ["move", "resize"] as const) {
  test(`saved-event ${mode} holds outside top, bottom and side edges never scroll or grow the document`, async ({
    page,
    isMobile,
  }) => {
    const { event, pane, saved, changes } = await setup(page);
    const touch = await start(page, event, mode, isMobile);
    try {
      const { width, height } = page.viewportSize()!;
      for (const point of [
        { x: 5, y: 5 },
        { x: 5, y: height - 5 },
        { x: width - 5, y: height / 2 },
        { x: 5, y: height / 2 },
      ])
        await stationaryOutside(page, touch, pane, point);
      expect(changes).toHaveLength(0);
    } finally {
      await release(page, touch, true);
    }
    await expect(page.locator(".fc-event-mirror")).toHaveCount(0);
    expect(changes).toHaveLength(0);
    expect((await saved()).revision).toBe(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test(`saved-event ${mode} scrolls only inside its pane and saves its final visible interval once`, async ({
    page,
    isMobile,
  }) => {
    const { event, pane, block, saved, changes } = await setup(page);
    const touch = await start(page, event, mode, isMobile);
    const original = await geometry(page);
    const rect = (await pane.boundingBox())!,
      x = rect.x + rect.width / 2;
    const paneBefore = await pane.evaluate((node) => node.scrollTop);
    await move(page, touch, {
      x,
      y: Math.min(page.viewportSize()!.height, rect.y + rect.height) - 8,
    });
    await expect
      .poll(() => pane.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(paneBefore + 60);
    expect(changes).toHaveLength(0);
    expect(await geometry(page)).toEqual(original);
    await stationaryOutside(page, touch, pane, { x: 5, y: 5 });
    await move(page, touch, {
      x,
      y: Math.max(0, rect.y) + Math.min(160, rect.height / 2),
    });
    await frame(page);
    const expected = await mirror(page)
      .locator("[title]")
      .first()
      .getAttribute("title");
    expect(expected).toBeTruthy();
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === "PATCH" &&
        r.url().endsWith("/time-blocks/" + block.id),
    );
    await release(page, touch);
    expect((await response).status()).toBe(200);
    await expect.poll(async () => (await saved()).revision).toBe(2);
    await expect(event.locator("[title]").first()).toHaveAttribute(
      "title",
      expected!,
    );
    const current = await saved();
    if (mode === "move") {
      expect(current.startAt).not.toBe(block.startAt);
      expect(Date.parse(current.endAt) - Date.parse(current.startAt)).toBe(
        3600000,
      );
    } else {
      expect(current.startAt).toBe(block.startAt);
      expect(Date.parse(current.endAt)).toBeGreaterThan(
        Date.parse(block.endAt),
      );
    }
    expect(new Date(current.startAt).getUTCMinutes() % 15).toBe(0);
    expect(new Date(current.endAt).getUTCMinutes() % 15).toBe(0);
    expect(changes).toHaveLength(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const after = await pane.evaluate((node) => node.scrollTop);
    await page.waitForTimeout(350);
    expect(await pane.evaluate((node) => node.scrollTop)).toBe(after);
  });
}

test("native scroll frames retire for pending holds, second fingers, modal, range, failed session and account changes", async ({
  page,
  isMobile,
  testAccounts,
}) => {
  const { event, pane, saved, changes, block } = await setup(page);
  // A pending touch press never starts its own scroll; a second finger retires it.
  const box = (await event.boundingBox())!;
  const pending = (await down(
    page,
    { x: box.x + box.width / 2, y: box.y + 10 },
    true,
  ))!;
  await pending.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: box.x + 20, y: box.y + 10, id: 1 },
      { x: box.x + 45, y: box.y + 10, id: 2 },
    ],
  });
  await release(page, pending, true);
  await page.waitForTimeout(450);
  await expect(page.locator(".fc-event-mirror")).toHaveCount(0);
  for (const interruption of [
    "second finger",
    "modal",
    "range",
    "session",
    "account",
  ]) {
    await test.step(interruption, async () => {
      await position(page);
      const touch = await start(
        page,
        event,
        "move",
        interruption === "second finger" || isMobile,
      );
      const rect = (await pane.boundingBox())!;
      await move(page, touch, {
        x: rect.x + rect.width / 2,
        y: Math.min(page.viewportSize()!.height, rect.y + rect.height) - 8,
      });
      const before = await pane.evaluate((node) => node.scrollTop);
      await expect
        .poll(() => pane.evaluate((node) => node.scrollTop))
        .toBeGreaterThan(before + 30);
      if (interruption === "second finger") {
        await touch!.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [
            { x: rect.x + 20, y: rect.y + 30, id: 1 },
            { x: rect.x + 50, y: rect.y + 30, id: 2 },
          ],
        });
      } else if (interruption === "modal") {
        await page.getByRole("button", { name: /^Advanced/ }).focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog")).toBeVisible();
      } else if (interruption === "range") {
        await page.getByLabel("Date", { exact: true }).fill("2030-06-04");
      } else if (interruption === "session") {
        await page.route("**/api/planner-session", (route) =>
          route.fulfill({
            status: 503,
            body: "{}",
            contentType: "application/json",
          }),
        );
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(
          page.getByRole("button", {
            name: "Retry session check",
            exact: true,
          }),
        ).toBeVisible();
      } else {
        const email = randomUUID() + "@example.invalid";
        testAccounts.push(email);
        expect(
          (
            await page.request.post("/api/auth/sign-out", {
              headers: { origin },
              data: {},
            })
          ).ok(),
        ).toBe(true);
        expect(
          (
            await page.request.post("/api/auth/sign-up/email", {
              headers: { origin },
              data: {
                name: "Native boundary new actor",
                email,
                password: randomUUID() + randomUUID(),
              },
            })
          ).ok(),
        ).toBe(true);
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await expect(
          page.getByText(`Signed in as ${email}`, { exact: true }),
        ).toBeVisible();
        await expect(
          page.locator('[data-session-state="ready"]'),
        ).toBeVisible();
      }
      if (interruption !== "session") await waiters.get(page)!();
      else {
        await frame(page);
        await frame(page);
      }
      await expect(page.locator(".fc-event-mirror")).toHaveCount(0);
      const documentBefore = await geometry(page);
      const currentPane = page.locator(".fc-scroller");
      const panePositions = await currentPane.evaluateAll((nodes) =>
        nodes.map((node) => ({ x: node.scrollLeft, y: node.scrollTop })),
      );
      await page.waitForTimeout(450);
      expect(await geometry(page)).toEqual(documentBefore);
      expect(
        await currentPane.evaluateAll((nodes) =>
          nodes.map((node) => ({ x: node.scrollLeft, y: node.scrollTop })),
        ),
      ).toEqual(panePositions);
      // The interruption already canceled the native gesture. Its eventual
      // release must be inert, and must not send Escape to the newly opened modal.
      await release(page, touch);
      expect(changes).toHaveLength(0);
      if (interruption === "modal") {
        await page.keyboard.press("Escape");
        await closedEditor(page);
      } else if (interruption === "range") {
        await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
      } else if (interruption === "session") {
        await page.unroute("**/api/planner-session");
        await page
          .getByRole("button", { name: "Retry session check", exact: true })
          .click();
        await expect(
          page.locator('[data-session-state="ready"]'),
        ).toBeVisible();
      }
      if (interruption !== "account") expect((await saved()).revision).toBe(1);
    });
  }
  expect(
    (await testDB.timeBlock.findUniqueOrThrow({ where: { id: block.id } }))
      .revision,
  ).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
