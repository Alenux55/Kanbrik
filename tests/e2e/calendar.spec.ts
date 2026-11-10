import { test, expect } from "./fixtures";
import { retained, saved, cleanClose, closedEditor } from "./planner-helpers";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { BlockRecord } from "../../src/lib/calendar-contracts";
const origin = "http://127.0.0.1:3100";
const range = "?start=2030-06-01T00%3A00Z&end=2030-06-10T00%3A00Z";
test.setTimeout(60000);
const createForm = (page: Page) =>
  page.getByRole("form", { name: "Create time block", exact: true });
async function post(page: Page, path: string, data: object) {
  const response = await page.request.post(path, { headers: { origin }, data });
  expect(response.status()).toBe(201);
  return response.json();
}
async function open(page: Page) {
  await page.request.patch("/api/planner/preferences", {
    headers: { origin },
    data: { timeZone: "UTC" },
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await expect(
    page.getByRole("button", { name: "New block", exact: true }),
  ).toBeVisible();
}
async function events(page: Page, workspaceId: string): Promise<BlockRecord[]> {
  return (
    await page.request.get(`/api/workspaces/${workspaceId}/time-blocks${range}`)
  ).json();
}
async function provisionBlock(
  page: Page,
  workspaceId: string,
  label = "Time block",
) {
  return post(page, `/api/workspaces/${workspaceId}/time-blocks`, {
    requestKey: randomUUID(),
    label,
    schedule: {
      startAt: "2030-06-03T12:00Z",
      endAt: "2030-06-03T15:00Z",
      timeZone: "UTC",
    },
    assignment: { projectId: null, taskId: null },
  });
}
async function drag(
  page: Page,
  source: { x: number; y: number },
  target: { x: number; y: number },
) {
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(source.x + 12, source.y, { steps: 3 });
  await page.mouse.move(target.x, target.y, { steps: 24 });
  await page.mouse.up();
}

async function showGridTime(page: Page, time: string) {
  const grid = page.locator(".fc");
  await grid.scrollIntoViewIfNeeded();
  await grid
    .locator('.fc-timegrid-slot-lane[data-time="' + time + '"]')
    .evaluate((el) => {
      const scroller = el.closest<HTMLElement>(".fc-scroller")!;
      scroller.scrollTop +=
        el.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        150;
    });
}
async function staleAssignment(
  page: Page,
  block: BlockRecord,
  projectId: string,
  isMobile: boolean,
) {
  if (isMobile) {
    await page
      .getByRole("button", { name: `Edit block: ${block.label}`, exact: true })
      .tap();
    const form = page.getByRole("form", {
      name: `Edit time block ${block.label}`,
      exact: true,
    });
    await form
      .getByLabel("Assigned work", { exact: true })
      .selectOption(`project:${projectId}`);
    await form.getByRole("button", { name: "Save block", exact: true }).tap();
  } else {
    const grid = page.locator(".fc");
    await grid.scrollIntoViewIfNeeded();
    const event = grid.locator(
      `.fc-event[data-calendar-block-id="${block.id}"]`,
    );
    await showGridTime(page, "12:00:00");
    const source = (await page
      .getByRole("button", { name: "Drag project: Race project", exact: true })
      .boundingBox())!;
    const target = (await event.boundingBox())!;
    await drag(
      page,
      { x: source.x + 20, y: source.y + 20 },
      { x: target.x + Math.min(8, target.width / 4), y: target.y + 20 },
    );
  }
}

async function refreshCalendar(page: Page) {
  await page
    .getByRole("button", { name: "Refresh calendar", exact: true })
    .focus();
  await page.keyboard.press("Space", { delay: 75 });
}

test("calendar distinguishes collaborator-deleted blocks from revoked access without losing unrelated drafts", async ({
  browser,
  page,
  isMobile,
  testAccounts,
  testWorkspaces,
}) => {
  const actor = (await (await page.request.get("/api/auth/get-session")).json())
    .user;
  const peer = await browser.newContext({ baseURL: origin });
  const email = `${randomUUID()}@example.invalid`;
  testAccounts.push(email);
  try {
    expect(
      (
        await peer.request.post("/api/auth/sign-up/email", {
          headers: { origin },
          data: {
            email,
            password: randomUUID() + randomUUID(),
            name: "Calendar race owner",
          },
        })
      ).status(),
    ).toBe(200);
    const workspace = await (
      await peer.request.post("/api/workspaces", {
        headers: { origin },
        data: { name: "Calendar deletion race" },
      })
    ).json();
    testWorkspaces.push(workspace.id);
    expect(
      (
        await peer.request.post(`/api/workspaces/${workspace.id}/members`, {
          headers: { origin },
          data: { email: actor.email },
        })
      ).status(),
    ).toBe(200);
    const project = await post(
      page,
      `/api/workspaces/${workspace.id}/projects`,
      { title: "Race project" },
    );
    const target = await provisionBlock(page, workspace.id, "Deleted target");
    const other = await provisionBlock(page, workspace.id, "Other saved block");
    await open(page);
    await page
      .getByRole("checkbox", {
        name: "Calendar deletion race (shared)",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Apply calendar preferences", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Edit block: Other saved block",
        exact: true,
      })
      .click();
    await page
      .getByRole("form", {
        name: "Edit time block Other saved block",
        exact: true,
      })
      .getByLabel("Block label", { exact: true })
      .fill("Unrelated retained input");
    await retained(page);
    const remove = async (block: BlockRecord) =>
      expect(
        (
          await peer.request.delete(
            `/api/workspaces/${workspace.id}/time-blocks/${block.id}`,
            { headers: { origin }, data: { revision: block.revision } },
          )
        ).status(),
      ).toBe(200);
    const kept = async () => {
      if (await page.locator("dialog").count()) await retained(page);
      await expect(
        page.getByRole("checkbox", {
          name: "Calendar deletion race (shared)",
          exact: true,
        }),
      ).toBeChecked();
      await page
        .getByRole("button", {
          name: "Review draft: Unrelated retained input",
          exact: true,
        })
        .click();
      await expect(
        page
          .getByRole("form", {
            name: "Edit time block Other saved block",
            exact: true,
          })
          .getByLabel("Block label", { exact: true }),
      ).toHaveValue("Unrelated retained input");
      await retained(page);
    };
    // The peer deletes on the real server without refreshing this page's stale
    // target. Desktop must exercise the palette handler that caused the bug.
    await remove(target);
    expect(
      (await page.request.get(`/api/workspaces/${workspace.id}`)).status(),
    ).toBe(200);
    await staleAssignment(page, target, project.id, isMobile);
    await expect(
      page.getByText(
        isMobile
          ? "Time block not found"
          : "Time block is no longer available. Proposed change retained; other workspace content is unchanged.",
        { exact: true },
      ),
    ).toBeVisible();
    await kept();
    const saved = await events(page, workspace.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: other.id,
      label: "Other saved block",
      revision: 1,
    });

    // A failed access recheck is uncertainty, not proof of revocation.
    const uncertain = await provisionBlock(
      page,
      workspace.id,
      "Uncertain target",
    );
    await refreshCalendar(page);
    await expect(
      page.getByRole("button", {
        name: "Edit block: Uncertain target",
        exact: true,
      }),
    ).toBeVisible();
    await remove(uncertain);
    const accessPath = `**/api/workspaces/${workspace.id}`;
    await page.route(accessPath, (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Fixture access check unavailable" },
      }),
    );
    await staleAssignment(page, uncertain, project.id, isMobile);
    await expect(
      page.getByText(
        "Save unconfirmed; workspace access could not be checked. Retry the original intent.",
        { exact: true },
      ),
    ).toBeVisible();
    await kept();
    await page.unroute(accessPath);

    // Genuine revocation must still clear the affected workspace and drafts.
    const revoked = await provisionBlock(page, workspace.id, "Revoked target");
    await refreshCalendar(page);
    await expect(
      page.getByRole("button", {
        name: "Edit block: Revoked target",
        exact: true,
      }),
    ).toBeVisible();
    const roster = await (
      await peer.request.get(`/api/workspaces/${workspace.id}`)
    ).json();
    const membership = roster.members.find(
      (member: { email: string }) => member.email === actor.email,
    );
    expect(
      (
        await peer.request.delete(
          `/api/workspaces/${workspace.id}/members/${membership.id}`,
          { headers: { origin }, data: {} },
        )
      ).status(),
    ).toBe(200);
    await staleAssignment(page, revoked, project.id, isMobile);
    await expect(
      page.getByText(
        "Workspace access ended. Its calendar content and drafts were removed.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name: "Calendar deletion race (shared)",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Review draft: Unrelated retained input",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      (await page.request.get(`/api/workspaces/${workspace.id}`)).status(),
    ).toBe(404);
  } finally {
    await peer.close();
  }
});

test("calendar ignores an obsolete workspace-access recheck after a missing-block save", async ({
  page,
  isMobile,
}) => {
  const personal = (
    await (await page.request.get("/api/workspaces")).json()
  ).find((workspace: { kind: string }) => workspace.kind === "personal");
  const project = await post(page, `/api/workspaces/${personal.id}/projects`, {
    title: "Race project",
  });
  const target = await provisionBlock(page, personal.id, "Old target");
  await provisionBlock(page, personal.id, "Current saved block");
  await open(page);
  await page
    .getByRole("button", {
      name: "Edit block: Current saved block",
      exact: true,
    })
    .click();
  await page
    .getByRole("form", {
      name: "Edit time block Current saved block",
      exact: true,
    })
    .getByLabel("Block label", { exact: true })
    .fill("Current context draft");
  await retained(page);
  expect(
    (
      await page.request.delete(
        `/api/workspaces/${personal.id}/time-blocks/${target.id}`,
        { headers: { origin }, data: { revision: 1 } },
      )
    ).status(),
  ).toBe(200);
  expect(
    (await page.request.get(`/api/workspaces/${personal.id}`)).status(),
  ).toBe(200);
  let release!: () => void, ready!: () => void, settled!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const done = new Promise<void>((resolve) => {
    settled = resolve;
  });
  await page.route(`**/api/workspaces/${personal.id}`, async (route) => {
    ready();
    await held;
    await route
      .fulfill({
        status: 404,
        json: { error: "Fixture obsolete access result" },
      })
      .catch(() => {});
    settled();
  });
  try {
    await staleAssignment(page, target, project.id, isMobile);
    await waiting;
    // Force an obsolete mounted-range completion while the access recheck is held.
    await page.getByLabel("Date", { exact: true }).evaluate((el) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(el, "2030-07-01");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(
      page.getByText("Total blocks in range: 0.", { exact: false }),
    ).toBeVisible();
    release();
    await done;
    // Wait for the old operation to release its own lock, rather than merely
    // checking the new DOM before the held response's callback has run.
    await page
      .getByRole("button", { name: "Review draft: Old target", exact: true })
      .click();
    await expect(
      page
        .getByRole("form", { name: "Edit time block Old target", exact: true })
        .getByRole("button", { name: "Save block", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("checkbox", {
        name: "Personal workspace (personal)",
        exact: true,
      }),
    ).toBeChecked();
    await retained(page);
    await page
      .getByRole("button", {
        name: "Review draft: Current context draft",
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole("form", {
          name: "Edit time block Current saved block",
          exact: true,
        })
        .getByLabel("Block label", { exact: true }),
    ).toHaveValue("Current context draft");
    await retained(page);
    await expect(
      page.getByText(
        "Workspace access ended. Its calendar content and drafts were removed.",
        { exact: true },
      ),
    ).toHaveCount(0);
  } finally {
    release();
  }
});

test("calendar pointer move/resize persist duration while no-op, canceled and touch gestures do not save", async ({
  page,
  isMobile,
}) => {
  const personal = (
    await (await page.request.get("/api/workspaces")).json()
  ).find((w: { kind: string }) => w.kind === "personal");
  const block = await provisionBlock(page, personal.id, "Pointer schedule");
  await open(page);
  if (isMobile) {
    await expect(page.getByLabel("View", { exact: true })).toHaveValue("day");
    const agendaLabel = page.locator(`[data-block-id="${block.id}"]:visible`);
    await agendaLabel.scrollIntoViewIfNeeded();
    const agendaBox = (await agendaLabel.boundingBox())!;
    const touchX = agendaBox.x + agendaBox.width / 2,
      touchY = agendaBox.y + agendaBox.height / 2;
    const touch = await page.context().newCDPSession(page);
    // Chromium synthesizes a real touch scroll with controlled velocity and no
    // fling, so the following tap is a navigation action, not a fling stop.
    await touch.send("Input.synthesizeScrollGesture", {
      x: touchX,
      y: touchY,
      yDistance: -200,
      speed: 500,
      gestureSourceType: "touch",
      preventFling: true,
    });
    await touch.detach();
    expect((await events(page, personal.id))[0].revision).toBe(1);
    await page.getByRole("button", { name: "Next", exact: true }).tap();
    await expect(
      page.getByText("Total blocks in range: 0.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Previous", exact: true }).tap();
    await expect(
      page.getByRole("button", {
        name: "Edit block: Pointer schedule",
        exact: true,
      }),
    ).toBeVisible();
    return;
  }
  const grid = page.locator(".fc");
  await grid.scrollIntoViewIfNeeded();
  const event = grid
    .locator(".fc-timegrid-event")
    .filter({ has: page.locator(`[data-block-id="${block.id}"]`) });
  const slot = (await grid
    .locator('.fc-timegrid-slot-lane[data-time="12:00:00"]')
    .boundingBox())!;
  let box = (await event.boundingBox())!;
  let point = { x: box.x + box.width / 2, y: box.y + 20 };
  await drag(page, point, { x: point.x, y: point.y + slot.height * 2 });
  await expect
    .poll(async () => (await events(page, personal.id))[0].revision)
    .toBe(2);
  let saved = (await events(page, personal.id))[0];
  expect(Date.parse(saved.endAt) - Date.parse(saved.startAt)).toBe(10800000);
  expect(Date.parse(saved.startAt) - Date.parse(block.startAt)).toBe(3600000);
  await expect(
    page.getByRole("status").filter({ hasText: "Saved calendar change." }),
  ).toBeVisible();
  await expect(event).toBeVisible();
  await grid.scrollIntoViewIfNeeded();
  await event.hover();
  await expect(event.locator(".fc-event-resizer-end")).toBeVisible();
  const resize = (await event.locator(".fc-event-resizer-end").boundingBox())!;
  await drag(
    page,
    { x: resize.x + resize.width / 2, y: resize.y + resize.height / 2 },
    {
      x: resize.x + resize.width / 2,
      y: resize.y + resize.height / 2 + slot.height * 2,
    },
  );
  await expect
    .poll(async () => (await events(page, personal.id))[0].revision)
    .toBe(3);
  await expect(event).toHaveClass(/fc-event-draggable/);
  saved = (await events(page, personal.id))[0];
  expect(Date.parse(saved.endAt) - Date.parse(saved.startAt)).toBe(14400000);
  await grid.scrollIntoViewIfNeeded();
  box = (await event.boundingBox())!;
  point = { x: box.x + box.width / 2, y: box.y + 20 };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 12, point.y, { steps: 3 });
  await page.mouse.move(point.x, point.y);
  await page.mouse.up();
  expect((await events(page, personal.id))[0].revision).toBe(3);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 12, point.y, { steps: 3 });
  await page.mouse.move(point.x, point.y + slot.height * 2, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect((await events(page, personal.id))[0].revision).toBe(3);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 12, point.y, { steps: 3 });
  await page.mouse.move(point.x, point.y + slot.height * 2, { steps: 5 });
  await page
    .getByRole("checkbox", {
      name: "Personal workspace (personal)",
      exact: true,
    })
    .focus();
  await page.keyboard.press("Space");
  await page.mouse.up();
  expect((await events(page, personal.id))[0].revision).toBe(3);
  await page.reload();
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  expect((await events(page, personal.id))[0]).toEqual(saved);
});

test("calendar overlays retain uncertain create/delete intents, dirty input and revision conflicts", async ({
  page,
}) => {
  const ws = (await (await page.request.get("/api/workspaces")).json()).find(
    (w: { kind: string }) => w.kind === "personal",
  );
  await open(page);
  await page.getByRole("button", { name: "New block", exact: true }).click();
  const form = createForm(page);
  await form
    .getByLabel("Block label", { exact: true })
    .fill("Original create intent");
  let lost = true;
  await page.route("**/api/workspaces/*/time-blocks", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (!lost) return route.continue();
    lost = false;
    await route.fetch();
    await route.abort("failed");
  });
  await form.getByRole("button", { name: "Create block", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("unconfirmed");
  await expect(form.getByLabel("Block label", { exact: true })).toBeDisabled();
  expect(await events(page, ws.id)).toHaveLength(1);
  await form.getByRole("button", { name: "Create block", exact: true }).click();
  await saved(page);
  expect(await events(page, ws.id)).toHaveLength(1);
  await page.unroute("**/api/workspaces/*/time-blocks");
  await page
    .getByRole("button", {
      name: "Edit block: Original create intent",
      exact: true,
    })
    .click();
  let edit = page.getByRole("form", {
    name: "Edit time block Original create intent",
    exact: true,
  });
  await edit
    .getByLabel("Block label", { exact: true })
    .fill("Retained calendar input");
  await retained(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await expect(
    page.getByText("Retained Calendar input is available in", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "User settings", exact: true })
    .click();
  await page
    .getByLabel("Preferred time zone", { exact: true })
    .fill("America/New_York");
  await page
    .getByRole("button", { name: "Save time zone", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Time zone saved." }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Calendar", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Review draft: Retained calendar input",
      exact: true,
    })
    .click();
  await expect(edit.getByLabel("Block label", { exact: true })).toHaveValue(
    "Retained calendar input",
  );
  await expect(
    edit.getByText("Input time zone: UTC", { exact: false }),
  ).toBeVisible();
  const block = (await events(page, ws.id))[0];
  expect(
    (
      await page.request.patch(
        `/api/workspaces/${ws.id}/time-blocks/${block.id}`,
        {
          headers: { origin },
          data: { revision: 1, changes: { label: "Peer version" } },
        },
      )
    ).status(),
  ).toBe(200);
  await edit.getByRole("button", { name: "Save block", exact: true }).click();
  await expect(
    edit.getByRole("region", { name: "Saved block version" }),
  ).toContainText("Peer version");
  await edit
    .getByRole("button", { name: "Reviewed: keep proposed input", exact: true })
    .click();
  await edit.getByRole("button", { name: "Save block", exact: true }).click();
  await saved(page);
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page
    .getByRole("button", {
      name: "Edit block: Retained calendar input",
      exact: true,
    })
    .click();
  edit = page.getByRole("form", {
    name: "Edit time block Retained calendar input",
    exact: true,
  });
  await expect(edit.getByLabel("Start time", { exact: true })).toHaveValue(
    "2030-06-03T08:00",
  );
  await expect(edit.getByLabel("End time", { exact: true })).toHaveValue(
    "2030-06-03T11:00",
  );
  let first = true;
  await page.route(`**/time-blocks/${block.id}`, async (route) => {
    if (route.request().method() === "DELETE" && first) {
      first = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await edit.getByRole("button", { name: "Remove block", exact: true }).click();
  await edit
    .getByRole("button", { name: "Confirm removal", exact: true })
    .click();
  await expect(
    edit.getByRole("alert").filter({ hasText: "unconfirmed" }),
  ).toBeVisible();
  await edit
    .getByRole("button", { name: "Confirm removal", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await events(page, ws.id)).toHaveLength(0);
});
test("calendar scheduling in the user zone exposes workspace equivalents and requires DST choices", async ({
  page,
  testWorkspaces,
}) => {
  const shared = await post(page, "/api/workspaces", {
    name: "Tokyo workspace",
    timeZone: "Asia/Tokyo",
  });
  testWorkspaces.push(shared.id);
  await page.request.patch("/api/planner/preferences", {
    headers: { origin },
    data: { defaultWorkspaceId: shared.id, timeZone: "America/Los_Angeles" },
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await expect(
    page.getByText("Display zone: America/Los_Angeles.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New block", exact: true }).click();
  const form = createForm(page);
  await expect(
    page.getByLabel("Destination workspace", { exact: true }),
  ).toHaveValue(shared.id);
  await form.getByLabel("Start time", { exact: true }).fill("2030-03-10T02:30");
  await form.getByLabel("End time", { exact: true }).fill("2030-03-10T04:00");
  await expect(
    form.getByRole("alert").filter({ hasText: "Invalid or nonexistent" }),
  ).toBeVisible();
  await form.getByRole("button", { name: "Create block", exact: true }).click();
  await expect(
    form.getByRole("alert").filter({ hasText: "gaps cannot be saved" }),
  ).toBeVisible();
  await form.getByLabel("Start time", { exact: true }).fill("2030-11-03T01:15");
  await form.getByLabel("End time", { exact: true }).fill("2030-11-03T01:45");
  await expect(
    form.getByLabel("Start occurrence (repeated local time)", { exact: true }),
  ).toHaveValue("");
  await form
    .getByLabel("Start occurrence (repeated local time)", { exact: true })
    .selectOption({ label: "1: UTC-07:00" });
  await form
    .getByLabel("End occurrence (repeated local time)", { exact: true })
    .selectOption({ label: "2: UTC-08:00" });
  await expect(
    form.getByText("Actual elapsed hours: 1.5", { exact: true }),
  ).toBeVisible();
  await expect(
    form.getByText("Workspace local:", { exact: false }),
  ).toContainText("2030-11-03 17:15");
  await form.getByRole("button", { name: "Create block", exact: true }).click();
  await saved(page);
  const blocks = await (
    await page.request.get(
      `/api/workspaces/${shared.id}/time-blocks?start=2030-11-03T00%3A00Z&end=2030-11-04T00%3A00Z`,
    )
  ).json();
  expect(blocks).toHaveLength(1);
  expect(blocks[0].startAt).toBe("2030-11-03T08:15:00.000Z");
});

test("work drops distinguish original-block assignment, foreground rejection and one-hour blank-slot creation", async ({
  page,
  isMobile,
  testWorkspaces,
}, info) => {
  const ws = (await (await page.request.get("/api/workspaces")).json()).find(
    (w: { kind: string }) => w.kind === "personal",
  );
  const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Schedule project",
  });
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Schedule task",
  });
  const empty = await provisionBlock(page, ws.id, "Existing three hours");
  const foreign = await post(page, "/api/workspaces", {
    name: "Foreign scheduling",
  });
  testWorkspaces.push(foreign.id);
  await provisionBlock(page, foreign.id, "Foreign block");
  await open(page);
  await page
    .getByRole("checkbox", { name: "Foreign scheduling (shared)", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Apply calendar preferences", exact: true })
    .click();
  if (isMobile) {
    await page.getByText("Schedule work with buttons", { exact: true }).click();
    await page
      .getByRole("button", {
        name: "Schedule task: Schedule task",
        exact: true,
      })
      .tap();
    const form = createForm(page);
    await expect(form.getByLabel("Assigned work", { exact: true })).toHaveValue(
      `task:${task.id}`,
    );
    await expect(
      form.getByText("Actual elapsed hours: 1", { exact: true }),
    ).toBeVisible();
    await form.getByRole("button", { name: "Create block", exact: true }).tap();
    await saved(page);
  } else {
    const grid = page.locator(".fc");
    await grid.scrollIntoViewIfNeeded();
    const palette = page.getByRole("button", {
      name: "Drag project: Schedule project",
      exact: true,
    });
    const targetEvent = grid.locator(
      `.fc-event[data-calendar-block-id="${empty.id}"]`,
    );
    await showGridTime(page, "12:00:00");
    const source = (await palette.boundingBox())!;
    const target = (await targetEvent.boundingBox())!;
    await drag(
      page,
      { x: source.x + 20, y: source.y + 20 },
      { x: target.x + Math.min(8, target.width / 4), y: target.y + 20 },
    );
    await expect
      .poll(
        async () =>
          (await events(page, ws.id)).find((b) => b.id === empty.id)?.projectId,
      )
      .toBe(project.id);
    expect(await events(page, ws.id)).toHaveLength(1);
    expect((await events(page, ws.id))[0].endAt).toBe(empty.endAt);
    await expect(page.getByRole("status").filter({ hasText: "Saved calendar change." })).toBeVisible();
    await closedEditor(page);
    await expect(targetEvent).toContainText("Schedule project");
    await showGridTime(page, "12:00:00");
    const before = (await events(page, ws.id))[0];
    const again = (await palette.boundingBox())!;
    const occupied = (await targetEvent.boundingBox())!;
    await drag(
      page,
      { x: again.x + 20, y: again.y + 20 },
      { x: occupied.x + Math.min(8, occupied.width / 4), y: occupied.y + 20 },
    );
    await expect(
      page.getByText("No assignment saved.", { exact: false }),
    ).toBeVisible();
    expect((await events(page, ws.id))[0]).toEqual(before);
    await showGridTime(page, "10:00:00");
    const column = (await grid
      .locator('.fc-timegrid-col[data-date="2030-06-03"]')
      .boundingBox())!;
    const slot = (await grid
      .locator('.fc-timegrid-slot-lane[data-time="10:00:00"]')
      .boundingBox())!;
    const next = (await page
      .getByRole("button", { name: "Drag task: Schedule task", exact: true })
      .boundingBox())!;
    await drag(
      page,
      { x: next.x + 20, y: next.y + 20 },
      { x: column.x + column.width / 2, y: slot.y + slot.height * 0.75 },
    );
    await expect.poll(async () => (await events(page, ws.id)).length).toBe(2);
    const created = (await events(page, ws.id)).find((b) => b.id !== empty.id)!;
    expect(created.taskId).toBe(task.id);
    expect(created.startAt).toBe("2030-06-03T10:15:00.000Z");
    expect(Date.parse(created.endAt) - Date.parse(created.startAt)).toBe(
      3600000,
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const original = (await palette.boundingBox())!;
    await page.mouse.move(original.x + 20, original.y + 20);
    await page.mouse.down();
    await page.mouse.move(original.x + 80, original.y + 80, { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await events(page, ws.id)).toHaveLength(2);
  }
  expect(
    (
      await (
        await page.request.get(`/api/workspaces/${ws.id}/tasks/${task.id}`)
      ).json()
    ).revision,
  ).toBe(1);
  expect(
    (
      await (
        await page.request.get(
          `/api/workspaces/${ws.id}/projects/${project.id}`,
        )
      ).json()
    ).revision,
  ).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("calendar.png"),
    fullPage: true,
  });
});

test("calendar marks failed scopes and pickers incomplete and ignores obsolete range responses", async ({
  page,
  testWorkspaces,
}) => {
  const ws = (await (await page.request.get("/api/workspaces")).json()).find(
    (w: { kind: string }) => w.kind === "personal",
  );
  await provisionBlock(page, ws.id, "Current block");
  const shared = await post(page, "/api/workspaces", {
    name: "Incomplete calendar",
  });
  testWorkspaces.push(shared.id);
  await open(page);
  await page
    .getByRole("checkbox", {
      name: "Incomplete calendar (shared)",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Apply calendar preferences", exact: true })
    .click();
  await page.route(`**/api/workspaces/${shared.id}/tasks`, (route) =>
    route.fulfill({ status: 503, json: { error: "Picker fixture" } }),
  );
  await refreshCalendar(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "Work picker incomplete" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New block", exact: true }).click();
  await page
    .getByLabel("Destination workspace", { exact: true })
    .selectOption(shared.id);
  await expect(
    createForm(page).getByRole("button", { name: "Create block", exact: true }),
  ).toBeDisabled();
  await cleanClose(page);
  await page.route(`**/api/workspaces/${shared.id}/time-blocks?*`, (route) =>
    route.fulfill({ status: 503, json: { error: "Range fixture" } }),
  );
  await refreshCalendar(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "Calendar incomplete" }),
  ).toBeVisible();
  await expect(
    page.getByText("Loaded blocks in range: 1.", { exact: false }),
  ).toBeVisible();
  await page.unroute(`**/api/workspaces/${shared.id}/tasks`);
  await page.unroute(`**/api/workspaces/${shared.id}/time-blocks?*`);
  let release!: () => void, ready!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    waiting = new Promise<void>((r) => (ready = r));
  let first = true;
  await page.route(
    `**/api/workspaces/${ws.id}/time-blocks?*`,
    async (route) => {
      if (!first) return route.continue();
      first = false;
      const r = await route.fetch();
      ready();
      await gate;
      await route.fulfill({ response: r }).catch(() => {});
    },
  );
  try {
    await refreshCalendar(page);
    await waiting;
    await page.getByLabel("Date", { exact: true }).fill("2030-07-02");
    release();
    await expect(
      page.getByText("Total blocks in range: 0.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Edit block: Current block",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});

test("calendar isolates pending saves across cookie account switches, failed checks, revocation and logout", async ({
  browser,
  context,
  page,
  testAccounts,
  testWorkspaces,
}) => {
  await context.addInitScript(() => {
    window.addEventListener = new Proxy(window.addEventListener, {
      apply(target, receiver, args) {
        if (args[0] === "storage") return;
        return Reflect.apply(target, receiver, args);
      },
    });
  });
  const a = (await (await page.request.get("/api/auth/get-session")).json())
    .user;
  const owner = await browser.newContext({
    baseURL: origin,
    storageState: await context.storageState(),
  });
  const provisioning = await browser.newContext({ baseURL: origin });
  const email = `${randomUUID()}@example.invalid`;
  const password = randomUUID() + randomUUID();
  testAccounts.push(email);
  const gate = () => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    return { promise, release };
  };
  const heldA = gate(),
    readyA = gate(),
    doneA = gate(),
    heldB = gate(),
    readyB = gate();
  try {
    const signup = await provisioning.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: { email, password, name: "Calendar editor" },
    });
    expect(signup.status()).toBe(200);
    const b = (await signup.json()).user;
    const shared = await post(page, "/api/workspaces", {
      name: "Session calendar",
    });
    testWorkspaces.push(shared.id);
    await page.request.post(`/api/workspaces/${shared.id}/members`, {
      headers: { origin },
      data: { email },
    });
    const block = await provisionBlock(page, shared.id, "Session block");
    await open(page);
    await page
      .getByRole("checkbox", { name: "Session calendar (shared)", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Apply calendar preferences", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit block: Session block", exact: true })
      .click();
    const edit = page.getByRole("form", {
      name: "Edit time block Session block",
      exact: true,
    });
    await edit
      .getByLabel("Block label", { exact: true })
      .fill("A obsolete block draft");
    const control = await context.newPage();
    await control.goto("/sign-in");
    await page.bringToFront();
    const { testDB } = await import("../database");
    await testDB.session.updateMany({
      where: { userId: a.id },
      data: { expiresAt: new Date(Date.now() + 3600000) },
    });
    let first = true,
      cookieHeader = false,
      oldWrites = 0;
    await page.route("**/api/planner-session", async (route) => {
      if (!first) return route.continue();
      first = false;
      const response = await route.fetch();
      cookieHeader = response.headers()["set-cookie"] !== undefined;
      readyA.release();
      await heldA.promise;
      await route.fulfill({ response }).catch(() => {});
      doneA.release();
    });
    await page.route(`**/time-blocks/${block.id}`, async (route) => {
      if (route.request().headers()["x-kanbrik-account"] === a.id) {
        oldWrites++;
        return route.continue();
      }
      readyB.release();
      await heldB.promise;
      await route.continue().catch(() => {});
    });
    await edit.getByRole("button", { name: "Save block", exact: true }).click();
    await readyA.promise;
    await control.getByLabel("Email", { exact: true }).fill(email);
    await control.getByLabel("Password", { exact: true }).fill(password);
    await control.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      control.getByText(`Signed in as ${email}`, { exact: true }),
    ).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText(`Signed in as ${email}`, { exact: true }),
    ).toBeVisible();
    await open(page);
    await expect(
      page.getByRole("checkbox", {
        name: "Session calendar (shared)",
        exact: true,
      }),
    ).not.toBeChecked();
    await page
      .getByRole("checkbox", { name: "Session calendar (shared)", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Apply calendar preferences", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edit block: Session block", exact: true })
      .click();
    await expect(edit.getByLabel("Block label", { exact: true })).toHaveValue(
      "Session block",
    );
    await edit
      .getByLabel("Block label", { exact: true })
      .fill("B pending block");
    await edit.getByRole("button", { name: "Save block", exact: true }).click();
    await readyB.promise;
    heldA.release();
    await doneA.promise;
    await expect(
      edit.getByLabel("Block label", { exact: true }),
    ).toBeDisabled();
    expect(oldWrites).toBe(0);
    expect(cookieHeader).toBe(false);
    expect(
      (await (await context.request.get("/api/auth/get-session")).json()).user
        .id,
    ).toBe(b.id);
    heldB.release();
    await saved(page);
    const savedEdit = page.getByRole("form", {
      name: "Edit time block B pending block",
      exact: true,
    });
    await refreshCalendar(page); // Finish a clean load before injecting failure.
    await page
      .getByRole("button", { name: "Edit block: B pending block", exact: true })
      .click();
    await expect(
      savedEdit.getByLabel("Block label", { exact: true }),
    ).toBeVisible();
    await savedEdit
      .getByLabel("Block label", { exact: true })
      .fill("Draft retained after failed check");
    await page.route("**/api/planner-session", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Fixture identity failure" },
      }),
    );
    // A save's background refetch can reach this stub before a button click.
    // Focus is an explicit supported verification trigger and avoids that race.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("heading", {
        name: "Could not verify your session",
        exact: true,
      }),
    ).toBeVisible();
    await page.unroute("**/api/planner-session");
    await page
      .getByRole("button", { name: "Retry session check", exact: true })
      .click();
    await expect(
      savedEdit.getByLabel("Block label", { exact: true }),
    ).toHaveValue("Draft retained after failed check");
    const roster = await (
      await owner.request.get(`/api/workspaces/${shared.id}`)
    ).json();
    const member = roster.members.find(
      (m: { email: string }) => m.email === email,
    );
    expect(
      (
        await owner.request.delete(
          `/api/workspaces/${shared.id}/members/${member.id}`,
          { headers: { origin }, data: {} },
        )
      ).status(),
    ).toBe(200);
    await retained(page);
    await page
      .getByRole("button", { name: "Refresh calendar", exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", {
        name: "Session calendar (shared)",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(savedEdit).toHaveCount(0);
    // Same-cookie logout while a new block is pending: its completion belongs to
    // B's old document and cannot revive protected data or an account draft.
    await page.getByRole("button", { name: "New block", exact: true }).click();
    await createForm(page)
      .getByLabel("Block label", { exact: true })
      .fill("Logout pending calendar draft");
    const logoutHeld = gate(),
      logoutReady = gate();
    await page.route("**/api/workspaces/*/time-blocks", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      logoutReady.release();
      await logoutHeld.promise;
      await route.fulfill({ response }).catch(() => {});
    });
    try {
      await createForm(page)
        .getByRole("button", { name: "Create block", exact: true })
        .click();
      await logoutReady.promise;
      await control.goto("/projects");
      await control
        .getByRole("button", { name: "Sign out", exact: true })
        .click();
      await expect(control).toHaveURL(/\/sign-in$/);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page).toHaveURL(/\/sign-in$/);
      logoutHeld.release();
      await expect(page.getByLabel("Block label", { exact: true })).toHaveCount(
        0,
      );
      expect(
        (await (await context.request.get("/api/auth/get-session")).json())
          ?.user,
      ).toBeUndefined();
    } finally {
      logoutHeld.release();
    }
  } finally {
    heldA.release();
    heldB.release();
    await owner.close();
    await provisioning.close();
  }
});
