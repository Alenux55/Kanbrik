import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { post, personal, setZone, cleanClose } from "./planner-helpers";
test.setTimeout(90000);

test("Calendar exposes a date/time grid on every width and preserves an explicit view across resize", async ({
  page,
  isMobile,
}, info) => {
  const ws = await personal(page);
  await setZone(page);
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Canonical palette work",
  });
  const block = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
    requestKey: randomUUID(),
    label: "Visible reservation",
    schedule: {
      startAt: "2030-06-03T10:00Z",
      endAt: "2030-06-03T11:00Z",
      timeZone: "UTC",
    },
    assignment: { taskId: task.id, projectId: null },
  });
  let scheduleWrites = 0;
  page.on("request", (request) => {
    if (request.url().includes("/time-blocks") && request.method() !== "GET")
      scheduleWrites++;
  });
  await page.goto("/calendar");
  await expect(page.getByLabel("View", { exact: true })).toHaveValue(
    isMobile ? "day" : "week",
  );
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  const event = page.locator(`.fc-event[data-calendar-block-id="${block.id}"]`);
  await expect(event).toBeVisible();
  await expect(
    page.getByText("Schedule work with buttons", { exact: true }),
  ).toHaveCount(0);
  for (const width of [390, 645, 844, 1023, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
    await expect(page.locator(".fc")).toBeVisible();
    await expect(event).toBeVisible();
    if (isMobile && (width === 390 || width === 645))
      await page.screenshot({
        path: info.outputPath(`calendar-${width}.png`),
        fullPage: true,
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByLabel("View", { exact: true }).selectOption("day");
  await page.setViewportSize({ width: 390, height: 844 });
  if (isMobile) {
    await event.tap();
    await expect(page.getByLabel("Block label", { exact: true })).toHaveValue("Visible reservation");
    await cleanClose(page);
  }
  await expect(page.getByLabel("View", { exact: true })).toHaveValue("day");
  await page.getByLabel("View", { exact: true }).selectOption("week");
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.getByLabel("View", { exact: true })).toHaveValue("week");
  await page.setViewportSize({ width: 645, height: 800 });
  await expect(page.getByLabel("View", { exact: true })).toHaveValue("week");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const card = page.getByRole("button", {
    name: "Edit task: Canonical palette work",
    exact: true,
  });
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("form", { name: "Edit task", exact: true })
      .getByLabel("Title", { exact: true }),
  ).toHaveValue(task.title);
  await cleanClose(page);
  expect(scheduleWrites).toBe(0);
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 22, box.y + 22);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await cleanClose(page);
  expect(scheduleWrites).toBe(0);
  await page.getByLabel("Date", { exact: true }).fill("2030-07-01");
  await expect(
    page.getByText(
      "No blocks in this range. Use New block to choose work and time.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("Board keeps all statuses in one contained horizontal region and touch scrolling never writes status", async ({
  page,
  isMobile,
}) => {
  const ws = await personal(page);
  for (const [index, status] of [
    "backlog",
    "todo",
    "in_progress",
    "blocked",
    "done",
  ].entries()) {
    await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: `Column ${index}`,
      status,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/board");
  const board = page.getByRole("region", {
    name: "Board statuses",
    exact: true,
  });
  for (const label of ["Backlog", "To do", "In progress", "Blocked", "Done"])
    await expect(
      board.getByRole("region", { name: `${label} column`, exact: true }),
    ).toHaveCount(1);
  let writes = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/status") && request.method() === "PATCH")
      writes++;
  });
  await board.scrollIntoViewIfNeeded();
  if (isMobile) {
    await board.evaluate((element) =>
      element.scrollIntoView({ block: "start" }),
    );
    const box = (await board.boundingBox())!,
      cdp = await page.context().newCDPSession(page);
    for (let index = 0; index < 5; index++) {
      const y = box.y + 40,
        start = box.x + box.width * 0.9;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: start, y }],
      });
      for (let step = 1; step <= 12; step++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: start - step * 22, y }],
        });
        await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    }
    expect(
      await board.evaluate((element) => element.scrollLeft),
    ).toBeGreaterThan(900);
    await cdp.send("Input.synthesizeScrollGesture", {
      x: box.x + 50,
      y: Math.max(100, box.y + 100),
      yDistance: -150,
      speed: 500,
      gestureSourceType: "touch",
      preventFling: true,
    });
    await cdp.detach();
  } else {
    await board.focus();
    await page.keyboard.press("End");
    await board.evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
  }
  await page
    .getByRole("article", { name: "Column 4", exact: true })
    .getByRole("button")
    .click();
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue("done");
  await cleanClose(page);
  expect(writes).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
