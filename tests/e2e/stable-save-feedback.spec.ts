import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { personal, post, setZone, closedEditor, drag } from "./planner-helpers";

test.setTimeout(120000);
test.use({ actionTimeout: 15000 });
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function prepare(page: Page) {
  const ws = await personal(page);
  await setZone(page);
  const block = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
    requestKey: randomUUID(),
    label: "Stable reservation",
    assignment: { taskId: null, projectId: null },
    schedule: {
      startAt: "2030-06-03T13:00Z",
      endAt: "2030-06-03T15:00Z",
      timeZone: "UTC",
    },
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByLabel("View", { exact: true }).selectOption("day");
  await expect(
    page.locator(`[data-calendar-block-id="${block.id}"]`),
  ).toBeVisible();
  await page.locator(".fc").scrollIntoViewIfNeeded();
  await page
    .locator('.fc-timegrid-slot-lane[data-time="13:00:00"]')
    .evaluate((row) => {
      const scroller = row.closest<HTMLElement>(".fc-scroller")!;
      scroller.scrollTop +=
        row.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        150;
    });
  await page.evaluate(() => {
    const state = window as typeof window & { stableGrid?: Element };
    state.stableGrid = document.querySelector(".fc")!;
  });
  return { ws, block };
}
async function geometry(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-session-state]")!,
      grid = document.querySelector<HTMLElement>(".fc")!;
    const scrollers = [...grid.querySelectorAll<HTMLElement>(".fc-scroller")];
    const scroller =
      scrollers.find((node) => node.scrollHeight > node.clientHeight + 5) ??
      scrollers.at(-1)!;
    const r = root.getBoundingClientRect(),
      g = grid.getBoundingClientRect();
    return {
      rootWidth: r.width,
      rootHeight: r.height,
      gridWidth: g.width,
      gridHeight: g.height,
      gridY: g.top + scrollY,
      documentHeight: document.documentElement.scrollHeight,
      windowY: scrollY,
      internalY: scroller.scrollTop,
      sameGrid:
        (window as typeof window & { stableGrid?: Element }).stableGrid ===
        grid,
    };
  });
}
async function stable(
  page: Page,
  before: Awaited<ReturnType<typeof geometry>>,
) {
  const after = await geometry(page);
  expect(after.sameGrid).toBe(true);
  for (const key of [
    "rootWidth",
    "rootHeight",
    "gridWidth",
    "gridHeight",
    "gridY",
    "documentHeight",
    "windowY",
    "internalY",
  ] as const)
    expect(Math.abs(after[key] - before[key]), key).toBeLessThanOrEqual(1);
}

test("held Calendar save keeps grid geometry, scroll and identity concealment without document navigation", async ({
  page,
  isMobile,
}, info) => {
  const { ws, block } = await prepare(page);
  let navigations = 0,
    writes = 0,
    preflight = true;
  page.on("request", (request) => {
    if (request.resourceType() === "document") navigations++;
  });
  await page
    .getByRole("button", {
      name: "Edit block: Stable reservation",
      exact: true,
    })
    .press("Enter");
  const form = page.getByRole("form", {
    name: "Edit time block Stable reservation",
    exact: true,
  });
  await form
    .getByLabel("Block label", { exact: true })
    .fill("Confirmed stable edit");
  await form
    .getByRole("button", { name: "Save block", exact: true })
    .scrollIntoViewIfNeeded();
  const dialogScroll = await form.evaluate(
    (node) =>
      node.closest("dialog")!.querySelector<HTMLElement>(".overflow-y-auto")!
        .scrollTop,
  );
  const before = await geometry(page),
    checking = gate(),
    releaseCheck = gate(),
    dispatched = gate(),
    releaseBody = gate(),
    postCheck = gate(),
    releasePostCheck = gate();
  let holdPostCheck = false;
  await page.route("**/api/planner-session", async (route) => {
    if (!preflight) {
      if (!holdPostCheck) return route.continue();
      holdPostCheck = false;
      const response = await route.fetch();
      postCheck.release();
      await releasePostCheck.promise;
      return route.fulfill({ response });
    }
    preflight = false;
    const response = await route.fetch();
    checking.release();
    await releaseCheck.promise;
    await route.fulfill({ response });
  });
  await page.route(`**/time-blocks/${block.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    writes++;
    const response = await route.fetch();
    dispatched.release();
    await releaseBody.promise;
    await route.fulfill({ response });
  });
  try {
    await form.getByRole("button", { name: "Save block", exact: true }).click();
    await checking.promise;
    const root = page.locator('[data-session-state="checking"]');
    await expect(root).toHaveCount(1);
    await expect(form).toBeHidden();
    expect(await root.evaluate((node) => (node as HTMLElement).inert)).toBe(
      true,
    );
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest("[data-session-state]"),
      ),
    ).toBe(false);
    expect(writes).toBe(0);
    await stable(page, before);
    await page.screenshot({
      path: `.local/task025-${info.project.name}-held-verification.png`,
    });
    releaseCheck.release();
    await dispatched.promise;
    await expect(form.getByRole("button", { name: /Saving/ })).toBeDisabled();
    expect(
      await form.evaluate(
        (node) =>
          node
            .closest("dialog")!
            .querySelector<HTMLElement>(".overflow-y-auto")!.scrollTop,
      ),
    ).toBe(dialogScroll);
    await stable(page, before);
    holdPostCheck = true;
    releaseBody.release();
    await postCheck.promise;
    await expect(form.getByRole("button", { name: /Saving/ })).toBeDisabled();
    await stable(page, before);
    releasePostCheck.release();
    await closedEditor(page);
    await expect(
      page.getByRole("button", {
        name: "Edit block: Confirmed stable edit",
        exact: true,
      }),
    ).toBeVisible();
    await stable(page, before);
    expect(writes).toBe(1);
    expect(navigations).toBe(0);
    const saved = await (
      await page.request.get(
        `/api/workspaces/${ws.id}/time-blocks?start=2030-06-03T00%3A00Z&end=2030-06-04T00%3A00Z`,
      )
    ).json();
    expect(saved[0]).toMatchObject({
      id: block.id,
      label: "Confirmed stable edit",
      revision: 2,
    });
    expect(await page.getByLabel("Date", { exact: true }).inputValue()).toBe(
      "2030-06-03",
    );
    expect(await page.getByLabel("View", { exact: true }).inputValue()).toBe(
      "day",
    );
    const dismiss = page.getByRole("button", {
      name: "Dismiss save confirmation",
      exact: true,
    });
    if (isMobile) await dismiss.tap();
    else await dismiss.click();
    await expect(dismiss).toHaveCount(0);
    await stable(page, before);
  } finally {
    releaseCheck.release();
    releaseBody.release();
    releasePostCheck.release();
  }
});

test("confirmed create and Remove stay stable through an obsolete read and a failed background refresh", async ({
  page,
  isMobile,
}) => {
  const { ws } = await prepare(page);
  let navigations = 0,
    writes = 0,
    reads = 0;
  page.on("request", (request) => {
    if (request.resourceType() === "document") navigations++;
  });
  const oldRead = gate(),
    releaseOld = gate();
  await page.route("**/time-blocks?*", async (route) => {
    if (++reads === 1) {
      const response = await route.fetch();
      oldRead.release();
      await releaseOld.promise;
      await route.fulfill({ response });
    } else if (reads === 2)
      await route.fulfill({
        status: 503,
        json: { error: "Fixture refresh unavailable" },
      });
    else await route.continue();
  });
  let arrived = gate(),
    release = gate();
  await page.route(
    `**/api/workspaces/${ws.id}/time-blocks{,/*}`,
    async (route) => {
      if (!["POST", "DELETE"].includes(route.request().method()))
        return route.continue();
      writes++;
      const response = await route.fetch();
      arrived.release();
      await release.promise;
      await route.fulfill({ response });
    },
  );
  try {
    await page.getByRole("button", { name: "New block", exact: true }).click();
    const create = page.getByRole("form", {
      name: "Create time block",
      exact: true,
    });
    await create
      .getByLabel("Block label", { exact: true })
      .fill("Stable new reservation");
    await create
      .getByLabel("Start time", { exact: true })
      .fill("2030-06-03T16:00");
    await create
      .getByLabel("End time", { exact: true })
      .fill("2030-06-03T17:00");
    const beforeCreate = await geometry(page);
    if (isMobile)
      await create
        .getByRole("button", { name: "Create block", exact: true })
        .tap();
    else
      await create
        .getByRole("button", { name: "Create block", exact: true })
        .click();
    await arrived.promise;
    await expect(
      create.getByRole("button", { name: "Saving…", exact: true }),
    ).toBeDisabled();
    await stable(page, beforeCreate);
    release.release();
    await closedEditor(page);
    await oldRead.promise;
    await expect(
      page.getByRole("button", {
        name: "Edit block: Stable new reservation",
        exact: true,
      }),
    ).toBeVisible();
    await stable(page, beforeCreate);

    arrived = gate();
    release = gate();
    await page
      .locator('.fc-timegrid-slot-lane[data-time="16:00:00"]')
      .evaluate((row) => {
        const scroller = row.closest<HTMLElement>(".fc-scroller")!;
        scroller.scrollTop +=
          row.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          150;
      });
    const event = page.getByRole("button", {
      name: "Edit block: Stable new reservation",
      exact: true,
    });
    if (isMobile) await event.tap();
    else await event.press("Enter");
    const edit = page.getByRole("form", {
      name: "Edit time block Stable new reservation",
      exact: true,
    });
    await edit
      .getByRole("button", {
        name: "Remove time block: Stable new reservation",
        exact: true,
      })
      .click();
    const beforeRemove = await geometry(page);
    await edit
      .getByRole("button", { name: "Confirm removal", exact: true })
      .click();
    await arrived.promise;
    await stable(page, beforeRemove);
    release.release();
    await closedEditor(page);
    await expect(page.getByText(/^Calendar incomplete\./)).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Edit block: Stable new reservation",
        exact: true,
      }),
    ).toHaveCount(0);
    await stable(page, beforeRemove);
    releaseOld.release();
    await expect(page.getByText(/^Calendar incomplete\./)).toBeVisible();
    await expect(page.getByText(/^Save unconfirmed/)).toHaveCount(0);
    await expect(
      page.getByText(
        "No blocks in this range. Use New block to choose work and time.",
        { exact: true },
      ),
    ).toHaveCount(0);
    const saved = await (
      await page.request.get(
        `/api/workspaces/${ws.id}/time-blocks?start=2030-06-03T00%3A00Z&end=2030-06-04T00%3A00Z`,
      )
    ).json();
    expect(saved).toHaveLength(1);
    expect(saved[0].label).toBe("Stable reservation");
    expect(writes).toBe(2);
    expect(navigations).toBe(0);
  } finally {
    release.release();
    releaseOld.release();
  }
});

test("real drop, native move and resize retain the grid and scroll during each held preflight", async ({
  page,
  isMobile,
}) => {
  test.skip(
    isMobile,
    "Mouse gestures; explicit scheduling and real touch activation are verified on Android separately",
  );
  const { ws } = await prepare(page);
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Stable gesture work",
  });
  await page
    .getByRole("button", { name: "Refresh calendar", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Edit task: Stable gesture work",
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as typeof window & { stableGrid?: Element }).stableGrid =
      document.querySelector(".fc")!;
  });
  let navigations = 0,
    writes = 0,
    metadataReads = 0;
  const activeRequests = new Set<import("@playwright/test").Request>();
  page.on("request", (request) => {
    if (request.url().includes("/api/")) activeRequests.add(request);
    if (request.resourceType() === "document") navigations++;
    if (request.url().includes("/time-blocks") && request.method() !== "GET")
      writes++;
  });
  page.on("requestfinished", (request) => activeRequests.delete(request));
  page.on("requestfailed", (request) => activeRequests.delete(request));
  page.on("response", (response) => {
    if (
      response.request().method() === "GET" &&
      /\/(tasks|projects|time-blocks)(?:\?|$)/.test(
        new URL(response.url()).pathname + new URL(response.url()).search,
      )
    )
      metadataReads++;
  });
  const point = async () => {
    await page.locator(".fc").scrollIntoViewIfNeeded();
    const row = page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]');
    await row.evaluate((node) => {
      const scroller = node.closest<HTMLElement>(".fc-scroller")!;
      scroller.scrollTop +=
        node.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        150;
    });
    return (await row.boundingBox())!;
  };
  for (const operation of ["drop", "move", "resize"]) {
    const lane = await point();
    const refreshed = metadataReads + 3;
    const before = await geometry(page),
      arrived = gate(),
      release = gate();
    let first = true;
    const handler = async (route: import("@playwright/test").Route) => {
      if (!first) return route.continue();
      first = false;
      const response = await route.fetch();
      arrived.release();
      await release.promise;
      await route.fulfill({ response });
    };
    await page.route("**/api/planner-session", handler);
    try {
      if (operation === "drop") {
        const card = (await page
          .getByRole("button", {
            name: "Edit task: Stable gesture work",
            exact: true,
          })
          .boundingBox())!;
        const column = (await page
          .locator('.fc-timegrid-col[data-date="2030-06-03"]')
          .boundingBox())!;
        await drag(
          page,
          { x: card.x + 20, y: card.y + 20 },
          { x: column.x + column.width / 2, y: lane.y + lane.height * 0.75 },
        );
      } else {
        const event = page.locator(".fc-event").filter({ hasText: task.title });
        const box = (await event.boundingBox())!;
        if (operation === "move")
          await drag(
            page,
            { x: box.x + box.width / 2, y: box.y + 20 },
            { x: box.x + box.width / 2, y: box.y + 20 + lane.height * 2 },
          );
        else {
          await event.hover();
          const handle = (await event
            .locator(".fc-event-resizer-end")
            .boundingBox())!;
          await drag(
            page,
            { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
            {
              x: handle.x + handle.width / 2,
              y: handle.y + handle.height / 2 + lane.height,
            },
          );
        }
      }
      await arrived.promise;
      await stable(page, before);
      await expect(page.locator("[data-calendar-drop-preview]")).toHaveCount(0);
      release.release();
      await expect(page.locator('[data-session-state="ready"]')).toBeVisible();
      await expect(
        page.getByText(
          operation === "drop"
            ? /^Saved one-hour block in/
            : "Saved calendar change.",
          { exact: operation !== "drop" },
        ),
      ).toBeVisible();
      await expect(
        page.getByText("Saving Calendar change…", { exact: true }),
      ).toHaveCount(0);
      await stable(page, before);
      await expect(page.locator("dialog")).toHaveCount(0);
      await expect
        .poll(
          async () =>
            (
              await (
                await page.request.get(
                  `/api/workspaces/${ws.id}/time-blocks?start=2030-06-03T00%3A00Z&end=2030-06-04T00%3A00Z`,
                )
              ).json()
            ).find((b: { taskId: string }) => b.taskId === task.id)?.revision,
        )
        .toBe(["drop", "move", "resize"].indexOf(operation) + 1);
      // Each successful save reloads three authoritative scope endpoints. A
      // subsequent gesture must begin in that completed metadata generation.
      await expect
        .poll(() => metadataReads >= refreshed && activeRequests.size === 0)
        .toBe(true);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    } finally {
      release.release();
      await page.unroute("**/api/planner-session", handler);
    }
  }
  expect(writes).toBe(3);
  expect(navigations).toBe(0);
});

test("failed verification conceals all protected controls without collapsing layout and Retry restores dialog focus", async ({
  page,
}, info) => {
  await prepare(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page
    .getByRole("button", {
      name: "Edit block: Stable reservation",
      exact: true,
    })
    .press("Enter");
  const form = page.getByRole("form", {
    name: "Edit time block Stable reservation",
    exact: true,
  });
  const label = form.getByLabel("Block label", { exact: true });
  await label.fill("Kept Calendar input");
  const before = await geometry(page);
  let writes = 0;
  page.on("request", (request) => {
    if (request.url().includes("/time-blocks") && request.method() !== "GET")
      writes++;
  });
  await page.route("**/api/planner-session", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Fixture verification unavailable" },
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", {
      name: "Could not verify your session",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("[data-session-state]")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Calendar", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Edit block: Stable reservation",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(form).toBeHidden();
  await stable(page, before);
  await page.screenshot({
    path: `.local/task025-${info.project.name}-failed-verification-dark.png`,
    animations: "disabled",
  });
  await page.unroute("**/api/planner-session");
  await page
    .getByRole("button", { name: "Retry session check", exact: true })
    .click();
  await expect(label).toHaveValue("Kept Calendar input");
  await expect(label).toBeFocused();
  await stable(page, before);
  expect(writes).toBe(0);
  await page.screenshot({
    path: `.local/task025-${info.project.name}-resumed-draft.png`,
    animations: "disabled",
  });
});
