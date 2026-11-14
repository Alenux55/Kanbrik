import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import {
  post,
  personal,
  origin,
  openTask,
  retained,
  cleanClose,
  closedEditor,
  setZone,
} from "./planner-helpers";
test.setTimeout(90000);

test("an older out-of-range block draft links to Trash without losing its retained reference", async ({
  page,
}) => {
  const ws = await personal(page);
  await setZone(page);
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Retained reference work",
  });
  const block = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
    requestKey: randomUUID(),
    label: "Old reservation",
    schedule: {
      startAt: "2030-06-03T12:00Z",
      endAt: "2030-06-03T13:00Z",
      timeZone: "UTC",
    },
    assignment: { taskId: task.id, projectId: null },
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page
    .getByRole("button", { name: "Edit block: Old reservation", exact: true })
    .click();
  await page
    .getByLabel("Block label", { exact: true })
    .fill("Retained interval input");
  await retained(page);
  const impact = await (
    await page.request.post(`/api/workspaces/${ws.id}/trash/preview`, {
      headers: { origin },
      data: { kind: "task", id: task.id },
    })
  ).json();
  expect(
    (
      await page.request.post(`/api/workspaces/${ws.id}/trash`, {
        headers: { origin },
        data: {
          kind: "task",
          id: task.id,
          impactDigest: impact.impactDigest,
          requestKey: randomUUID(),
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Date", { exact: true }).fill("2030-07-01");
  await page
    .getByRole("button", {
      name: "Review draft: Retained interval input",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Assigned work", { exact: true })).toHaveValue(
    `task:${task.id}`,
  );
  await expect(
    page.getByRole("link", {
      name: "Review workspace Trash / Restore",
      exact: true,
    }),
  ).toHaveAttribute("href", `/trash?workspaceId=${ws.id}`);
  await expect(
    page.getByRole("button", {
      name: "Keep block draft and edit assigned work",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save block", exact: true }).click();
  await closedEditor(page);
  const blocks = await (
    await page.request.get(
      `/api/workspaces/${ws.id}/time-blocks?start=2030-06-01T00%3A00Z&end=2030-06-10T00%3A00Z`,
    )
  ).json();
  expect(blocks).toHaveLength(1);
  expect(blocks[0]).toMatchObject({
    id: block.id,
    taskId: task.id,
    label: "Retained interval input",
    workInTrash: true,
    revision: 2,
  });
});

test("an uncertain Calendar create can reconcile its original intent after its work enters Trash", async ({
  page,
}) => {
  const ws = await personal(page);
  await setZone(page);
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Uncertain scheduled work",
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByRole("button", { name: "New block", exact: true }).click();
  const form = page.getByRole("form", {
    name: "Create time block",
    exact: true,
  });
  await form
    .getByLabel("Assigned work", { exact: true })
    .selectOption(`task:${task.id}`);
  let lose = true;
  const payloads: object[] = [];
  await page.route(`**/api/workspaces/${ws.id}/time-blocks`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    payloads.push(route.request().postDataJSON());
    if (!lose) return route.continue();
    lose = false;
    await route.fetch();
    await route.abort("failed");
  });
  await form.getByRole("button", { name: "Create block", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("unconfirmed");
  await retained(page);
  const impact = await (
    await page.request.post(`/api/workspaces/${ws.id}/trash/preview`, {
      headers: { origin },
      data: { kind: "task", id: task.id },
    })
  ).json();
  expect(
    (
      await page.request.post(`/api/workspaces/${ws.id}/trash`, {
        headers: { origin },
        data: {
          kind: "task",
          id: task.id,
          impactDigest: impact.impactDigest,
          requestKey: randomUUID(),
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Edit task: Uncertain scheduled work",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Review new block draft: Time block",
      exact: true,
    })
    .click();
  await expect(form.getByLabel("Assigned work", { exact: true })).toHaveValue(
    `task:${task.id}`,
  );
  await expect(
    form.getByRole("button", { name: "Create block", exact: true }),
  ).toBeEnabled();
  await form.getByRole("button", { name: "Create block", exact: true }).click();
  await closedEditor(page);
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1]).toEqual(payloads[0]);
  const blocks = await (
    await page.request.get(
      `/api/workspaces/${ws.id}/time-blocks?start=2030-06-01T00%3A00Z&end=2030-06-10T00%3A00Z`,
    )
  ).json();
  expect(blocks).toHaveLength(1);
  expect(blocks[0]).toMatchObject({
    taskId: task.id,
    workInTrash: true,
    revision: 1,
  });
  expect(
    (
      await page.request.get(`/api/workspaces/${ws.id}/tasks/${task.id}`)
    ).status(),
  ).toBe(404);
});

test("Trash confirmation, subtree detail, lost responses and Restore preserve canonical work and blocks", async ({
  page,
}) => {
  const ws = await personal(page);
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Restore parent",
    status: "blocked",
  });
  const child = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Restore child",
    parentId: task.id,
    status: "done",
  });
  const block = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
    requestKey: randomUUID(),
    label: "Reservation",
    schedule: {
      startAt: "2030-06-03T12:00Z",
      endAt: "2030-06-03T13:00Z",
      timeZone: "UTC",
    },
    assignment: { taskId: child.id, projectId: null },
  });
  await page.goto("/projects");
  await openTask(page, task.title);
  await page
    .getByRole("button", { name: "Preview Move to Trash", exact: true })
    .click();
  await expect(
    page.getByText("0 projects, 1 tasks, 1 subtasks.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel Move to Trash", exact: true })
    .click();
  expect(
    (
      await page.request.get(`/api/workspaces/${ws.id}/tasks/${task.id}`)
    ).status(),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Preview Move to Trash", exact: true })
    .click();
  const moves: object[] = [];
  let lose = true;
  let release!: () => void, ready!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    waiting = new Promise<void>((resolve) => {
      ready = resolve;
    });
  await page.route(`**/api/workspaces/${ws.id}/trash`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    moves.push(route.request().postDataJSON());
    if (!lose) return route.continue();
    lose = false;
    await route.fetch();
    ready();
    await held;
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "Confirm Move to Trash", exact: true })
    .click();
  try {
    await waiting;
    await expect(
      page.getByRole("button", { name: "Close editor", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Discard unconfirmed intent",
        exact: true,
      }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    expect(moves).toHaveLength(1);
  } finally {
    release();
  }
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Move unconfirmed",
  );
  await retained(page);
  await page.getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("button", { name: /Review Trash action:/ }).click();
  await page
    .getByRole("button", { name: "Retry same Trash operation", exact: true })
    .click();
  await closedEditor(page);
  expect(moves).toHaveLength(2);
  expect(moves[1]).toEqual(moves[0]);
  expect(
    (
      await page.request.get(`/api/workspaces/${ws.id}/tasks/${task.id}`)
    ).status(),
  ).toBe(404);
  await setZone(page);
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await expect(
    page.getByText("Work in Trash ·", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit block: Reservation", exact: true })
    .click();
  await expect(page.getByLabel("Assigned work", { exact: true })).toHaveValue(
    `task:${child.id}`,
  );
  await cleanClose(page);
  await page.goto(`/trash?workspaceId=${ws.id}`);
  let card = page.getByRole("article", {
    name: "Trash operation: Restore parent",
    exact: true,
  });
  await card
    .getByRole("button", { name: "View read-only detail", exact: true })
    .click();
  await expect(
    card.getByRole("heading", { name: "Subtask: Restore child", exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("region", { name: "Trashed work detail" }),
  ).toContainText("Done");
  const restores: object[] = [];
  lose = true;
  await page.route("**/trash/*/restore", async (route) => {
    restores.push(route.request().postDataJSON());
    if (!lose) return route.continue();
    lose = false;
    await route.fetch();
    await route.abort("failed");
  });
  await card.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(card.getByRole("alert")).toContainText("Restore unconfirmed");
  await page.getByRole("link", { name: "Projects", exact: true }).click();
  await page
    .getByRole("link", { name: "Review Restore in Trash", exact: true })
    .click();
  card = page.getByRole("article", {
    name: "Trash operation: Restore parent",
    exact: true,
  });
  await card
    .getByRole("button", { name: "Retry same Restore", exact: true })
    .click();
  await expect.poll(() => restores.length).toBe(2);
  await expect(page.locator('[data-session-state="ready"]')).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(restores).toHaveLength(2);
  expect(restores[1]).toEqual(restores[0]);
  for (const row of [task, child]) {
    const current = await (
      await page.request.get(`/api/workspaces/${ws.id}/tasks/${row.id}`)
    ).json();
    expect(current).toMatchObject({
      id: row.id,
      status: row.status,
      parentId: row.parentId,
      revision: 3,
    });
  }
  const blocks = await (
    await page.request.get(
      `/api/workspaces/${ws.id}/time-blocks?start=2030-06-01T00%3A00Z&end=2030-06-10T00%3A00Z`,
    )
  ).json();
  expect(blocks).toHaveLength(1);
  expect(blocks[0]).toMatchObject({
    id: block.id,
    taskId: child.id,
    startAt: block.startAt,
    revision: 1,
    workInTrash: false,
  });
  const other = await post(page, `/api/workspaces/${ws.id}/time-blocks`, {
    requestKey: randomUUID(),
    label: "Other reservation",
    schedule: {
      startAt: "2030-06-03T15:00Z",
      endAt: "2030-06-03T16:00Z",
      timeZone: "UTC",
    },
    assignment: { taskId: child.id, projectId: null },
  });
  await page.goto("/calendar");
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page
    .getByRole("button", { name: "Edit block: Reservation", exact: true })
    .click();
  const edit = page.getByRole("form", {
    name: "Edit time block Reservation",
    exact: true,
  });
  await edit
    .getByRole("button", {
      name: "Remove time block: Reservation",
      exact: true,
    })
    .click();
  await expect(edit.getByRole("alert")).toContainText(
    "Only this time block is removed. The task or project and its other blocks are kept.",
  );
  await edit
    .getByRole("button", { name: "Cancel removal", exact: true })
    .click();
  await edit
    .getByRole("button", {
      name: "Remove time block: Reservation",
      exact: true,
    })
    .click();
  await edit
    .getByRole("button", { name: "Confirm removal", exact: true })
    .click();
  await closedEditor(page);
  await expect
    .poll(async () =>
      (
        await (
          await page.request.get(
            `/api/workspaces/${ws.id}/time-blocks?start=2030-06-01T00%3A00Z&end=2030-06-10T00%3A00Z`,
          )
        ).json()
      ).map((row: { id: string }) => row.id),
    )
    .toEqual([other.id]);
  expect(
    await (
      await page.request.get(`/api/workspaces/${ws.id}/tasks/${child.id}`)
    ).json(),
  ).toMatchObject({ id: child.id, status: "done", revision: 3 });
});

test("obsolete Trash replies cannot retire a newer account's draft or release its pending save", async ({
  browser,
  context,
  page,
  testAccounts,
  testWorkspaces,
}) => {
  const peer = await browser.newContext({ baseURL: origin });
  const email = randomUUID() + "@example.invalid",
    password = randomUUID() + randomUUID();
  testAccounts.push(email);
  let releaseMove!: () => void, readyMove!: () => void, doneMove!: () => void;
  const heldMove = new Promise<void>((resolve) => {
      releaseMove = resolve;
    }),
    waitingMove = new Promise<void>((resolve) => {
      readyMove = resolve;
    }),
    settledMove = new Promise<void>((resolve) => {
      doneMove = resolve;
    });
  let releaseSave!: () => void, readySave!: () => void;
  const heldSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    }),
    waitingSave = new Promise<void>((resolve) => {
      readySave = resolve;
    });
  try {
    expect(
      (
        await peer.request.post("/api/auth/sign-up/email", {
          headers: { origin },
          data: { name: "New account", email, password },
        })
      ).status(),
    ).toBe(200);
    const ws = await post(page, "/api/workspaces", { name: "Account Trash" });
    testWorkspaces.push(ws.id);
    expect(
      (
        await page.request.post(`/api/workspaces/${ws.id}/members`, {
          headers: { origin },
          data: { email },
        })
      ).status(),
    ).toBe(200);
    const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Same canonical target",
    });
    await page.request.patch("/api/planner/preferences", {
      headers: { origin },
      data: { defaultWorkspaceId: ws.id },
    });
    await page.goto("/projects");
    await openTask(page, task.title);
    await page
      .getByRole("button", { name: "Preview Move to Trash", exact: true })
      .click();
    let batchId = "";
    await page.route(`**/api/workspaces/${ws.id}/trash`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      batchId = (await response.json()).batch.id;
      readyMove();
      await heldMove;
      await route.fulfill({ response }).catch(() => {});
      doneMove();
    });
    await page
      .getByRole("button", { name: "Confirm Move to Trash", exact: true })
      .click();
    await waitingMove;
    const control = await context.newPage();
    await control.goto("/sign-in");
    await control.getByLabel("Email", { exact: true }).fill(email);
    await control.getByLabel("Password", { exact: true }).fill(password);
    await control.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(control).toHaveURL(/\/projects$/);
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText(`Signed in as ${email}`, { exact: true }),
    ).toBeVisible();
    expect(
      (
        await peer.request.post(
          `/api/workspaces/${ws.id}/trash/${batchId}/restore`,
          { headers: { origin }, data: { revision: 1 } },
        )
      ).status(),
    ).toBe(200);
    await page
      .getByLabel("Creation workspace", { exact: true })
      .selectOption(ws.id);
    await openTask(page, task.title);
    await page.getByLabel("Title", { exact: true }).fill("New account input");
    await page.route(
      `**/api/workspaces/${ws.id}/tasks/${task.id}`,
      async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        readySave();
        await heldSave;
        await route.continue();
      },
    );
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await waitingSave;
    releaseMove();
    await settledMove;
    await expect(
      page.getByRole("button", { name: "Close editor", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "New account input",
    );
    releaseSave();
    await closedEditor(page);
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(
                `/api/workspaces/${ws.id}/tasks/${task.id}`,
              )
            ).json()
          ).title,
      )
      .toBe("New account input");
    await expect(
      page.getByRole("button", { name: /Review Trash action:/ }),
    ).toHaveCount(0);
  } finally {
    releaseMove();
    releaseSave();
    await peer.close();
  }
});

test("a collaborator's Trash does not revoke workspace access or erase unrelated drafts", async ({
  browser,
  page,
  testAccounts,
  testWorkspaces,
}) => {
  const actor = (await (await page.request.get("/api/auth/get-session")).json())
    .user;
  const peer = await browser.newContext({ baseURL: origin });
  const email = randomUUID() + "@example.invalid";
  testAccounts.push(email);
  try {
    expect(
      (
        await peer.request.post("/api/auth/sign-up/email", {
          headers: { origin },
          data: {
            name: "Peer owner",
            email,
            password: randomUUID() + randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
    const ws = await (
      await peer.request.post("/api/workspaces", {
        headers: { origin },
        data: { name: "Peer Trash" },
      })
    ).json();
    testWorkspaces.push(ws.id);
    expect(
      (
        await peer.request.post(`/api/workspaces/${ws.id}/members`, {
          headers: { origin },
          data: { email: actor.email },
        })
      ).status(),
    ).toBe(200);
    const target = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Shared stale target",
    });
    const own = await personal(page);
    await post(page, `/api/workspaces/${own.id}/tasks`, {
      title: "Unrelated local work",
    });
    await page.goto("/projects");
    await openTask(page, "Unrelated local work");
    await page
      .getByLabel("Title", { exact: true })
      .fill("Keep unrelated input");
    await retained(page);
    await page.getByRole("link", { name: "Calendar", exact: true }).click();
    await page
      .getByRole("checkbox", { name: "Peer Trash (shared)", exact: true })
      .check();
    await page
      .getByRole("button", { name: "Apply calendar preferences", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Edit task: Shared stale target",
        exact: true,
      })
      .click();
    await page.getByLabel("Title", { exact: true }).fill("Keep stale input");
    const impact = await (
      await peer.request.post(`/api/workspaces/${ws.id}/trash/preview`, {
        headers: { origin },
        data: { kind: "task", id: target.id },
      })
    ).json();
    const moved = await peer.request.post(`/api/workspaces/${ws.id}/trash`, {
      headers: { origin },
      data: {
        kind: "task",
        id: target.id,
        impactDigest: impact.impactDigest,
        requestKey: randomUUID(),
      },
    });
    expect(moved.status()).toBe(200);
    const batch = (await moved.json()).batch;
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "work is in Trash or unavailable" }),
    ).toBeVisible();
    expect((await page.request.get(`/api/workspaces/${ws.id}`)).status()).toBe(
      200,
    );
    await retained(page);
    await page
      .getByRole("button", {
        name: "Review work draft: Keep unrelated input",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "Keep unrelated input",
    );
    await retained(page);
    expect(
      (
        await peer.request.post(
          `/api/workspaces/${ws.id}/trash/${batch.id}/restore`,
          { headers: { origin }, data: { revision: batch.revision } },
        )
      ).status(),
    ).toBe(200);
    await page
      .getByRole("button", {
        name: "Review work draft: Keep stale input",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Saved version", exact: true }),
    ).toContainText("revision 3");
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "Keep stale input",
    );
    await retained(page);
    await page.route(`**/api/workspaces/${ws.id}/trash`, (route) =>
      route.fulfill({ status: 503, json: { error: "Fixture unavailable" } }),
    );
    await page.getByRole("link", { name: "Trash", exact: true }).click();
    await page
      .getByLabel("Trash workspace", { exact: true })
      .selectOption(ws.id);
    await expect(page).toHaveURL(`${origin}/trash?workspaceId=${ws.id}`);
    await expect(
      page.getByLabel("Creation workspace", { exact: true }),
    ).toHaveValue(own.id);
    await expect(
      page.getByRole("alert").filter({ hasText: "not confirmed empty" }),
    ).toBeVisible();
    await expect(
      page.getByText("No work in this workspace’s Trash.", { exact: true }),
    ).toHaveCount(0);
    await page.unroute(`**/api/workspaces/${ws.id}/trash`);
    await page
      .getByRole("button", { name: "Refresh Trash", exact: true })
      .click();
    await expect(
      page.getByText("No work in this workspace’s Trash.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Review work draft: Keep unrelated input",
        exact: true,
      })
      .click();
    await page
      .getByRole("link", { name: "Open workspace Trash", exact: true })
      .click();
    await closedEditor(page);
    await expect(
      page.getByLabel("Trash workspace", { exact: true }),
    ).toHaveValue(own.id);
    await page
      .getByLabel("Trash workspace", { exact: true })
      .selectOption(ws.id);
    await expect(page).toHaveURL(`${origin}/trash?workspaceId=${ws.id}`);
    const workspace = await (
      await peer.request.get(`/api/workspaces/${ws.id}`)
    ).json();
    const membership = workspace.members.find(
      (row: { email: string }) => row.email === actor.email,
    );
    expect(
      (
        await peer.request.delete(
          `/api/workspaces/${ws.id}/members/${membership.id}`,
          { headers: { origin }, data: {} },
        )
      ).status(),
    ).toBe(200);
    await page
      .getByRole("button", { name: "Refresh Trash", exact: true })
      .click();
    await expect(
      page.getByText(
        "This workspace is not accessible. Select one of your workspaces.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Review work draft: Keep stale input",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Review work draft: Keep unrelated input",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "Keep unrelated input",
    );
    await retained(page);
  } finally {
    await peer.close();
  }
});
