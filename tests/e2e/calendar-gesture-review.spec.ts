import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  post,
  personal,
  setZone,
  drag,
  cleanClose,
  retained,
  closedEditor,
} from "./planner-helpers";
test.setTimeout(90000);
async function slot(page: Page, time: string) {
  const lane = page.locator(`.fc-timegrid-slot-lane[data-time="${time}"]`);
  await page.locator(".fc").scrollIntoViewIfNeeded();
  await lane.evaluate((el) => {
    const scroller = el.closest<HTMLElement>(".fc-scroller")!;
    scroller.scrollTop +=
      el.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      150;
  });
  return (await lane.boundingBox())!;
}
async function watch(page: Page) {
  await page.evaluate(() => {
    const state = window as typeof window & {
      dialogMounts: number;
      dialogObserver?: MutationObserver;
    };
    state.dialogMounts = 0;
    state.dialogObserver?.disconnect();
    state.dialogObserver = new MutationObserver((changes) => {
      for (const change of changes)
        for (const node of change.addedNodes)
          if (
            node instanceof Element &&
            (node.matches("dialog") || node.querySelector("dialog"))
          )
            state.dialogMounts++;
    });
    state.dialogObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}
async function noDialogs(page: Page) {
  await expect(page.locator("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as typeof window & { dialogMounts: number }).dialogMounts,
    ),
  ).toBe(0);
}

test("real Calendar drops, native moves and resizes never mount editors, including pending and recoverable failures", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Real mouse gestures; touch/no-write and explicit scheduling are verified separately",
  );
  const ws = await personal(page);
  await setZone(page);
  const work = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Direct drag work",
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByLabel("View", { exact: true }).selectOption("day");
  await expect(
    page.getByRole("button", {
      name: "Edit task: Direct drag work",
      exact: true,
    }),
  ).toBeVisible();
  let release!: () => void, ready!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    waiting = new Promise<void>((resolve) => {
      ready = resolve;
    });
  let hold = true,
    writes = 0;
  await page.route(`**/api/workspaces/${ws.id}/time-blocks`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    writes++;
    if (!hold) return route.continue();
    hold = false;
    const response = await route.fetch();
    ready();
    await held;
    await route.fulfill({ response });
  });
  await watch(page);
  const lane = await slot(page, "10:00:00"),
    column = (await page
      .locator('.fc-timegrid-col[data-date="2030-06-03"]')
      .boundingBox())!;
  const palette = page.getByRole("button", {
    name: "Edit task: Direct drag work",
    exact: true,
  });
  const source = (await palette.boundingBox())!;
  try {
    await drag(
      page,
      { x: source.x + 20, y: source.y + 20 },
      { x: column.x + column.width / 2, y: lane.y + lane.height * 0.75 },
    );
    await waiting;
    await expect(
      page.getByText("Saving Calendar change…", { exact: true }),
    ).toBeVisible();
    await noDialogs(page);
  } finally {
    release();
  }
  await expect(
    page.getByText("Saved one-hour block in", { exact: false }),
  ).toBeVisible();
  await noDialogs(page);
  expect(writes).toBe(1);
  const list = async () =>
    (
      await page.request.get(
        `/api/workspaces/${ws.id}/time-blocks?start=2030-06-01T00%3A00Z&end=2030-06-10T00%3A00Z`,
      )
    ).json();
  const created = (await list())[0];
  expect(created.taskId).toBe(work.id);
  const event = page.locator(
    `.fc-event[data-calendar-block-id="${created.id}"]`,
  );
  await slot(page, "10:00:00");
  await event.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog")).toHaveCount(1);
  await cleanClose(page);
  await watch(page);
  let mode: "hold" | "pass" | "fail" | "conflict" = "hold";
  let releaseMove!: () => void, readyMove!: () => void;
  const heldMove = new Promise<void>((resolve) => {
      releaseMove = resolve;
    }),
    waitingMove = new Promise<void>((resolve) => {
      readyMove = resolve;
    });
  let patches = 0;
  await page.route(`**/time-blocks/${created.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    patches++;
    if (mode === "fail") return route.abort("failed");
    if (mode === "conflict") {
      const current = (await list())[0];
      return route.fulfill({
        status: 409,
        json: { error: "Fixture conflict", current },
      });
    }
    if (mode !== "hold") return route.continue();
    const response = await route.fetch();
    readyMove();
    await heldMove;
    await route.fulfill({ response });
  });
  const move = async () => {
    const lane = await slot(page, "10:00:00"),
      box = (await event.boundingBox())!;
    await drag(
      page,
      { x: box.x + box.width / 2, y: box.y + 20 },
      { x: box.x + box.width / 2, y: box.y + 20 + lane.height * 2 },
    );
  };
  try {
    await move();
    await waitingMove;
    await noDialogs(page);
    await expect(
      page.getByText("Saving Calendar change…", { exact: true }),
    ).toBeVisible();
  } finally {
    releaseMove();
  }
  await expect.poll(async () => (await list())[0].revision).toBe(2);
  await expect(
    page.getByText("Saved calendar change.", { exact: true }),
  ).toBeVisible();
  await noDialogs(page);
  mode = "pass";
  await event.hover();
  const handle = (await event.locator(".fc-event-resizer-end").boundingBox())!,
    step = await slot(page, "10:00:00");
  await drag(
    page,
    { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
    {
      x: handle.x + handle.width / 2,
      y: handle.y + handle.height / 2 + step.height,
    },
  );
  await expect.poll(async () => (await list())[0].revision).toBe(3);
  await noDialogs(page);
  await event.click();
  await expect(page.locator("dialog")).toHaveCount(1);
  await cleanClose(page);
  await watch(page);
  mode = "fail";
  await move();
  await expect(
    page.getByRole("status").filter({ hasText: "Save not confirmed" }),
  ).toBeVisible();
  await noDialogs(page);
  await page.getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Review draft: Direct drag work",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Start time", { exact: true })).not.toHaveValue(
    "",
  );
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await closedEditor(page);
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  mode = "conflict";
  await watch(page);
  await move();
  await expect(
    page.getByRole("status").filter({ hasText: "Conflict." }),
  ).toBeVisible();
  await noDialogs(page);
  await page
    .getByRole("button", {
      name: "Review draft: Direct drag work",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "Saved block version", exact: true }),
  ).toBeVisible();
  await retained(page);
  expect(patches).toBe(4);
});

test("an ambiguous drop retains an explicit DST review with zero schedule writes and no automatic dialog", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Mouse-only drop; DST form controls are covered on both profiles",
  );
  const ws = await personal(page);
  await setZone(page, "America/Los_Angeles");
  await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Repeated hour work",
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-11-03");
  await page.getByLabel("View", { exact: true }).selectOption("day");
  const lane = await slot(page, "01:00:00"),
    col = (await page
      .locator('.fc-timegrid-col[data-date="2030-11-03"]')
      .boundingBox())!;
  const source = (await page
    .getByRole("button", {
      name: "Edit project: Repeated hour work",
      exact: true,
    })
    .boundingBox())!;
  let writes = 0;
  page.on("request", (request) => {
    if (request.url().includes("/time-blocks") && request.method() !== "GET")
      writes++;
  });
  await watch(page);
  await drag(
    page,
    { x: source.x + 20, y: source.y + 20 },
    { x: col.x + col.width / 2, y: lane.y + lane.height * 0.75 },
  );
  await expect(
    page.getByText(
      "Confirm valid local times and explicit repeated-time occurrences before saving.",
      { exact: true },
    ),
  ).toBeVisible();
  await noDialogs(page);
  expect(writes).toBe(0);
  await page
    .getByRole("button", {
      name: "Review new block draft: Repeated hour work",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Start occurrence (repeated local time)", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("button", { name: "Create block", exact: true }).click();
  expect(
    await page
      .getByLabel("Start occurrence (repeated local time)", { exact: true })
      .evaluate((element) => (element as HTMLSelectElement).checkValidity()),
  ).toBe(false);
  await retained(page);
  expect(writes).toBe(0);
});
