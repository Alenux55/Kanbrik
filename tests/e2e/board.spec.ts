import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import {
  post,
  personal,
  origin,
  saved,
  drag,
  cleanClose,
} from "./planner-helpers";
import { testDB } from "../database";
test.setTimeout(90000);
const filters = async (page: import("@playwright/test").Page) => {
  await expect(page.getByRole("button", { name: /^Filters \(/ })).toBeEnabled();
  await page.getByRole("button", { name: /^Filters \(/ }).focus();
  await page.keyboard.press("Space", { delay: 75 });
  await expect(
    page.getByRole("dialog", { name: "Board filters", exact: true }),
  ).toBeVisible();
};
test("compact cards use stable project colors, whole-card mouse dragging and touch/keyboard editors with applied filters", async ({
  page,
  isMobile,
  testWorkspaces,
}, info) => {
  const ws = await personal(page);
  const shared = await post(page, "/api/workspaces", { name: "Board shared" });
  testWorkspaces.push(shared.id);
  const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Project label",
  });
  const parent = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Parent card",
    projectId: project.id,
  });
  await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Subtask card",
    parentId: parent.id,
    status: "blocked",
  });
  const other = await post(page, `/api/workspaces/${shared.id}/tasks`, {
    title: "Whole card move",
  });
  await page.goto("/board");
  await expect(
    page.getByText("Matching tasks: 2 of 2 total.", { exact: false }),
  ).toBeVisible();
  await filters(page);
  await page
    .getByRole("checkbox", { name: "Board shared (shared)", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByText("Matching tasks: 3 of 3 total.", { exact: false }),
  ).toBeVisible();
  const card = page.getByRole("article", { name: "Parent card", exact: true });
  await expect(card).toContainText("Project label");
  const color = await card
    .getByRole("button")
    .evaluate((e) => getComputedStyle(e).backgroundColor);
  await card.getByRole("button").focus();
  await page.keyboard.press("Enter");
  const edit = page.getByRole("form", { name: "Edit task", exact: true });
  await edit.getByLabel("Status").selectOption("in_progress");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await saved(page);
  expect(
    (
      await (
        await page.request.get(`/api/workspaces/${ws.id}/tasks/${parent.id}`)
      ).json()
    ).revision,
  ).toBe(2);
  if (!isMobile) {
    const source = (await page
      .getByRole("article", { name: "Whole card move", exact: true })
      .getByRole("button")
      .boundingBox())!;
    const target = (await page
      .getByRole("region", { name: "Done column", exact: true })
      .boundingBox())!;
    await drag(
      page,
      { x: source.x + 20, y: source.y + 20 },
      { x: target.x + target.width / 2, y: target.y + 100 },
    );
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(
                `/api/workspaces/${shared.id}/tasks/${other.id}`,
              )
            ).json()
          ).status,
      )
      .toBe("done");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const current = (await page
      .getByRole("article", { name: "Whole card move", exact: true })
      .getByRole("button")
      .boundingBox())!;
    await page.mouse.move(current.x + 20, current.y + 20);
    await page.mouse.down();
    await page.mouse.move(current.x - 60, current.y + 40, { steps: 8 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(
      (
        await (
          await page.request.get(
            `/api/workspaces/${shared.id}/tasks/${other.id}`,
          )
        ).json()
      ).revision,
    ).toBe(2);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // Opening a filter dialog during a mouse gesture cancels the pending drop.
    await page.mouse.move(current.x + 20, current.y + 20);
    await page.mouse.down();
    await page.mouse.move(current.x - 40, current.y + 30, { steps: 6 });
    await filters(page);
    await page.mouse.up();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(
      (
        await (
          await page.request.get(
            `/api/workspaces/${shared.id}/tasks/${other.id}`,
          )
        ).json()
      ).revision,
    ).toBe(2);
  } else {
    const touchCard = page.getByRole("article", {
      name: "Whole card move",
      exact: true,
    });
    await touchCard.scrollIntoViewIfNeeded();
    const box = (await touchCard.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.synthesizeScrollGesture", {
      x: box.x + 20,
      y: box.y + 20,
      yDistance: -100,
      speed: 500,
      gestureSourceType: "touch",
      preventFling: true,
    });
    await cdp.detach();
    expect(
      (
        await (
          await page.request.get(
            `/api/workspaces/${shared.id}/tasks/${other.id}`,
          )
        ).json()
      ).revision,
    ).toBe(1);
    await page
      .getByRole("article", { name: "Whole card move", exact: true })
      .getByRole("button")
      .tap();
    await page
      .getByRole("form", { name: "Edit task", exact: true })
      .getByLabel("Status")
      .selectOption("done");
    await page.getByRole("button", { name: "Save changes", exact: true }).tap();
    await saved(page);
  }
  await filters(page);
  await page
    .getByRole("checkbox", { name: "Project label", exact: true })
    .check();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByText("Matching tasks: 3 of 3 total.", { exact: false }),
  ).toBeVisible();
  await filters(page);
  await page
    .getByLabel("Created from", { exact: true })
    .fill(new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10));
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByText("No tasks match these filters.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await filters(page);
  await page
    .getByRole("checkbox", { name: "Project label", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByText("Matching tasks: 2 of 3 total.", { exact: false }),
  ).toBeVisible();
  if (isMobile) await page.getByRole("region", { name: "Blocked column", exact: true }).scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("article", { name: "Subtask card", exact: true }),
  ).toContainText("Subtask of Parent card");
  if (isMobile) await card.scrollIntoViewIfNeeded();
  expect(
    await card
      .getByRole("button")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe(color);
  await filters(page);
  await page.getByLabel("Title search").fill("No matching title");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByText("No tasks match these filters.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(
    page.getByText("Matching tasks: 3 of 3 total.", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await filters(page);
  await page.getByLabel("Title search", { exact: true }).fill("Parent card");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await card.getByRole("button").click();
  const filteredEdit = page.getByRole("form", {
    name: "Edit task",
    exact: true,
  });
  await filteredEdit.getByLabel("Title", { exact: true }).fill("L".repeat(200));
  await filteredEdit
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await saved(page);
  await expect(
    page.getByText("No tasks match these filters.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Dismiss save confirmation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(
    page.getByText("Matching tasks: 3 of 3 total.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("board.png"), fullPage: true });
  await page.reload();
  await expect(
    page.getByText("Matching tasks: 3 of 3 total.", { exact: false }),
  ).toBeVisible();
});
test("board retains conflicted and failed status proposals and reports incomplete authorized scopes", async ({
  page,
  isMobile,
  testWorkspaces,
}) => {
  const ws = await personal(page);
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Conflict card",
    description: "Original",
  });
  await page.goto("/board");
  const card = page.getByRole("article", {
    name: "Conflict card",
    exact: true,
  });
  await expect(card).toBeVisible();
  await page.request.patch(`/api/workspaces/${ws.id}/tasks/${task.id}`, {
    headers: { origin },
    data: {
      title: task.title,
      description: "New server text",
      status: "todo",
      revision: 1,
    },
  });
  if (!isMobile) {
    const source = (await card.getByRole("button").boundingBox())!;
    const target = (await page
      .getByRole("region", { name: "Done column", exact: true })
      .boundingBox())!;
    await drag(
      page,
      { x: source.x + 20, y: source.y + 20 },
      { x: target.x + target.width / 2, y: target.y + 100 },
    );
    await expect(
      page.getByText("Move conflicted.", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Review work draft: Conflict card",
        exact: true,
      })
      .click();
  } else {
    await card.getByRole("button").tap();
    await page
      .getByRole("form", { name: "Edit task", exact: true })
      .getByLabel("Status")
      .selectOption("done");
    await page.getByRole("button", { name: "Save changes", exact: true }).tap();
  }
  const edit = page.getByRole("form", { name: "Edit task", exact: true });
  await expect(
    edit.getByRole("region", { name: "Saved version" }),
  ).toContainText("New server text");
  await edit
    .getByRole("button", {
      name: "Review complete: keep my draft",
      exact: true,
    })
    .click();
  await page.route("**/api/workspaces/*/tasks/*", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({
          status: 503,
          json: { error: "Fixture unconfirmed save" },
        })
      : route.continue(),
  );
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit.getByRole("alert")).toContainText("unconfirmed");
  await expect(edit.getByLabel("Status")).toHaveValue("done");
  await page.unroute("**/api/workspaces/*/tasks/*");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await saved(page);
  const shared = await post(page, "/api/workspaces", {
    name: "Incomplete workspace",
  });
  testWorkspaces.push(shared.id);
  await page
    .getByRole("button", { name: "Refresh board", exact: true })
    .click();
  await filters(page);
  await page
    .getByRole("checkbox", {
      name: "Incomplete workspace (shared)",
      exact: true,
    })
    .check();
  await page.route(`**/api/workspaces/${shared.id}/tasks`, (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable fixture" } }),
  );
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Board incomplete" }),
  ).toBeVisible();
  await expect(
    page.getByText("Matching tasks: 1 of 1 loaded.", { exact: false }),
  ).toBeVisible();
});

test("board ignores a delayed renewal probe after account switch and keeps the new account's pending move isolated", async ({
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
  const provision = await browser.newContext({ baseURL: origin });
  const email = `${randomUUID()}@example.invalid`;
  const password = randomUUID() + randomUUID();
  testAccounts.push(email);
  try {
    const signup = await provision.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: { email, password, name: "Board editor" },
    });
    expect(signup.status()).toBe(200);
    const b = (await signup.json()).user;
    const shared = await (
      await page.request.post("/api/workspaces", {
        headers: { origin },
        data: { name: "Session board shared" },
      })
    ).json();
    testWorkspaces.push(shared.id);
    await page.request.post(`/api/workspaces/${shared.id}/members`, {
      headers: { origin },
      data: { email },
    });
    const task = await (
      await page.request.post(`/api/workspaces/${shared.id}/tasks`, {
        headers: { origin },
        data: { title: "Session board task" },
      })
    ).json();
    await page.goto("/board");
    await filters(page);
    await page
      .getByRole("checkbox", {
        name: "Session board shared (shared)",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    await page
      .getByRole("article", { name: "Session board task", exact: true })
      .getByRole("button")
      .click();
    const status = page
      .getByRole("form", { name: "Edit task", exact: true })
      .getByLabel("Status", { exact: true });
    await expect(status).toBeVisible();
    const control = await context.newPage();
    await control.goto("/sign-in");
    await page.bringToFront();
    await expect(status).toBeVisible();
    await testDB.session.updateMany({
      where: { userId: a.id },
      data: { expiresAt: new Date(Date.now() + 3600000) },
    });
    let releaseA!: () => void, readyA!: () => void, settledA!: () => void;
    const heldA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const waitingA = new Promise<void>((resolve) => {
      readyA = resolve;
    });
    const doneA = new Promise<void>((resolve) => {
      settledA = resolve;
    });
    let first = true;
    let cookieHeader = false;
    await page.route("**/api/planner-session", async (route) => {
      if (!first) return route.continue();
      first = false;
      const response = await route.fetch();
      cookieHeader = response.headers()["set-cookie"] !== undefined;
      readyA();
      await heldA;
      await route.fulfill({ response }).catch(() => {});
      settledA();
    });
    let releaseB!: () => void, readyB!: () => void;
    const heldB = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    const waitingB = new Promise<void>((resolve) => {
      readyB = resolve;
    });
    let oldMoves = 0;
    await page.route("**/api/workspaces/*/tasks/*", async (route) => {
      if (route.request().headers()["x-kanbrik-account"] === a.id) {
        oldMoves++;
        return route.continue();
      }
      readyB();
      await heldB;
      await route.continue();
    });
    try {
      await status.selectOption("done");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await waitingA;
      await control.getByLabel("Email", { exact: true }).fill(email);
      await control.getByLabel("Password", { exact: true }).fill(password);
      await control
        .getByRole("button", { name: "Sign in", exact: true })
        .click();
      await expect(
        control.getByText(`Signed in as ${email}`, { exact: true }),
      ).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(
        page.getByText(`Signed in as ${email}`, { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "Board", exact: true })
        .click();
      await filters(page);
      await expect(
        page.getByRole("checkbox", {
          name: "Session board shared (shared)",
          exact: true,
        }),
      ).not.toBeChecked();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await filters(page);
      await page
        .getByRole("checkbox", {
          name: "Session board shared (shared)",
          exact: true,
        })
        .check();
      await page
        .getByRole("button", { name: "Apply filters", exact: true })
        .click();
      await page
        .getByRole("article", { name: "Session board task", exact: true })
        .getByRole("button")
        .click();
      await expect(status).toHaveValue("todo");
      await status.selectOption("in_progress");
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await waitingB;
      releaseA();
      await doneA;
      await expect(status).toBeDisabled();
      expect(oldMoves).toBe(0);
      expect(cookieHeader).toBe(false);
      expect(
        (await (await context.request.get("/api/auth/get-session")).json()).user
          .id,
      ).toBe(b.id);
      releaseB();
      await saved(page);
      expect(
        (
          await (
            await page.request.get(
              `/api/workspaces/${shared.id}/tasks/${task.id}`,
            )
          ).json()
        ).revision,
      ).toBe(2);
      const roster = await (
        await owner.request.get(`/api/workspaces/${shared.id}`)
      ).json();
      const member = roster.members.find(
        (item: { email: string }) => item.email === email,
      );
      expect(
        (
          await owner.request.delete(
            `/api/workspaces/${shared.id}/members/${member.id}`,
            { headers: { origin }, data: {} },
          )
        ).status(),
      ).toBe(200);
      await page
        .getByRole("button", { name: "Refresh board", exact: true })
        .click();
      await filters(page);
      await expect(
        page.getByRole("checkbox", {
          name: "Session board shared (shared)",
          exact: true,
        }),
      ).toHaveCount(0);
      await cleanClose(page);
      await expect(
        page.getByRole("article", { name: "Session board task", exact: true }),
      ).toHaveCount(0);
    } finally {
      releaseA();
      releaseB();
    }
  } finally {
    await owner.close();
    await provision.close();
  }
});
