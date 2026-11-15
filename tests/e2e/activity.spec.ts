import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  post,
  personal,
  origin,
  setZone,
  cleanClose,
  retained,
  closedEditor,
  openTask,
} from "./planner-helpers";
import { testDB } from "../database";
test.setTimeout(120000);
test.use({ actionTimeout: 15000 });
const comments = (page: Page) =>
  activity(page).getByRole("region", { name: "Comments", exact: true });
const activity = (page: Page) =>
  page
    .locator("dialog")
    .getByRole("region", { name: "Work activity", exact: true });
async function ready(page: Page) {
  await expect(
    activity(page).getByRole("button", {
      name: "Refresh activity",
      exact: true,
    }),
  ).toBeEnabled();
}
async function add(page: Page, text: string) {
  await ready(page);
  await activity(page)
    .getByRole("button", { name: "Add comment", exact: true })
    .click();
  await page.getByLabel("New comment text", { exact: true }).fill(text);
}
async function posted(page: Page, text: string) {
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(
    comments(page)
      .getByRole("article")
      .filter({ has: page.getByText(text, { exact: true }) }),
  ).toBeVisible();
  await ready(page);
}
async function getComments(page: Page, base: string) {
  return (await (await page.request.get(base + "/comments")).json()).items;
}
async function openStandalone(page: Page, title: string) {
  const expand = page.getByRole("button", {
    name: "Expand Standalone tasks",
    exact: true,
  });
  if ((await expand.getAttribute("aria-expanded")) === "false")
    await expand.click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await ready(page);
}

test("comments and edit history are canonical across Projects, Board and Calendar for all work types", async ({
  page,
  context,
  isMobile,
}) => {
  const ws = await personal(page);
  await setZone(page);
  const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
    title: "Activity project",
  });
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Activity parent",
    projectId: project.id,
  });
  const child = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Activity child",
    parentId: task.id,
  });
  await page.reload();
  await page.getByRole("button", { name: project.title, exact: true }).click();
  await add(page, "Project comment <b>plain</b>");
  await posted(page, "Project comment <b>plain</b>");
  await cleanClose(page);
  await page
    .getByRole("button", {
      name: `Expand project: ${project.title}`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: task.title, exact: true }).click();
  await add(page, "Parent comment");
  await posted(page, "Parent comment");
  const base = `/api/workspaces/${ws.id}/tasks/${task.id}`,
    before = (await getComments(page, base))[0];
  await activity(page)
    .getByRole("button", { name: "Edit comment", exact: true })
    .click();
  await page
    .getByLabel("Edit comment text", { exact: true })
    .fill("Edited parent comment");
  await page
    .getByRole("button", { name: "Save comment edit", exact: true })
    .click();
  await expect(
    comments(page).getByText("Edited parent comment", { exact: true }),
  ).toBeVisible();
  await ready(page);
  const after = (await getComments(page, base))[0];
  expect(after.createdAt).toBe(before.createdAt);
  expect(after.editedAt).toBeTruthy();
  await expect(
    comments(page)
      .getByText(/^Edited /)
      .first(),
  ).toBeVisible();
  await cleanClose(page);
  await page
    .getByRole("button", { name: `Expand task: ${task.title}`, exact: true })
    .click();
  await page.getByRole("button", { name: child.title, exact: true }).click();
  await add(page, "Child comment");
  await posted(page, "Child comment");
  await cleanClose(page);
  const second = await context.newPage();
  await second.goto("/board");
  await second
    .getByRole("article", { name: child.title, exact: true })
    .getByRole("button")
    .click();
  await ready(second);
  await expect(
    comments(second).getByText("Child comment", { exact: true }),
  ).toBeVisible();
  await cleanClose(second);
  await second.close();
  await page.goto("/calendar");
  for (const [kind, title, text] of [
    ["project", project.title, "Project comment <b>plain</b>"],
    ["task", task.title, "Edited parent comment"],
    ["task", child.title, "Child comment"],
  ]) {
    const opener = page.getByRole("button", {
      name: `Edit ${kind}: ${title}`,
      exact: true,
    });
    if (isMobile) await opener.tap();
    else await opener.click();
    await ready(page);
    await expect(comments(page).getByText(text, { exact: true })).toBeVisible();
    await expect(
      activity(page).getByRole("heading", {
        name: "Edit history",
        exact: true,
      }),
    ).toBeVisible();
    await cleanClose(page);
  }
});

test("pending and uncertain comments retain independent work drafts through native Back and safe replay", async ({
  page,
}) => {
  const ws = await personal(page),
    task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Independent drafts",
    });
  const base = `/api/workspaces/${ws.id}/tasks/${task.id}`;
  await page.reload();
  await openTask(page, task.title);
  await ready(page);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Unsaved work text");
  await add(page, "Uncertain post");
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    arrived = new Promise<void>((r) => (entered = r));
  let attempts = 0;
  await page.route("**/comments", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    entered();
    await gate;
    await route.abort();
  });
  try {
    await page
      .getByRole("button", { name: "Post comment", exact: true })
      .click();
    await arrived;
    await expect(
      page.getByRole("button", { name: "Close editor", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Saving…", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Preview Move to Trash", exact: true }),
    ).toBeDisabled();
    expect(attempts).toBe(1);
    release();
    await expect(
      page.getByRole("button", { name: "Retry comment save", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("New comment text", { exact: true }),
    ).toBeDisabled();
    await page.unroute("**/comments");
    await page.goBack();
    await expect(
      page.getByRole("button", { name: "Keep editing", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .click();
    await retained(page);
    await page.getByRole("link", { name: "Board", exact: true }).click();
    await page
      .getByRole("button", {
        name: `Review comment draft: ${task.title}`,
        exact: true,
      })
      .click();
    await ready(page);
    await expect(
      page.getByRole("textbox", { name: "Description", exact: true }),
    ).toHaveValue("Unsaved work text");
    await page
      .getByRole("button", { name: "Retry comment save", exact: true })
      .click();
    await expect(
      page.getByLabel("New comment text", { exact: true }),
    ).toHaveCount(0);
    await ready(page);
    expect(await getComments(page, base)).toHaveLength(1);
    await expect(
      page.getByRole("textbox", { name: "Description", exact: true }),
    ).toHaveValue("Unsaved work text");
    await add(page, "Comment left after work save");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Save changes", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("New comment text", { exact: true }),
    ).toHaveValue("Comment left after work save");
    await expect(
      page.getByRole("textbox", { name: "Description", exact: true }),
    ).toHaveValue("Unsaved work text");
    await page
      .getByRole("button", { name: "Discard this comment draft", exact: true })
      .click();
    await cleanClose(page);
    await expect(
      page.getByRole("region", {
        name: "Retained comment drafts",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    release();
  }
});

test("shared comments enforce author-only editing and explicit conflicts without replacing dirty work on refresh", async ({
  page,
  browser,
  testAccounts,
  testWorkspaces,
}) => {
  const shared = await post(page, "/api/workspaces", {
    name: "Shared activity",
  });
  testWorkspaces.push(shared.id);
  const task = await post(page, `/api/workspaces/${shared.id}/tasks`, {
      title: "Shared comment work",
    }),
    base = `/api/workspaces/${shared.id}/tasks/${task.id}`;
  const email = randomUUID() + "@example.invalid";
  testAccounts.push(email);
  const member = await browser.newContext({ baseURL: origin });
  try {
    const signup = await member.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: {
        name: "Comment reader",
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
        await page.request.patch("/api/planner/preferences", {
          headers: { origin },
          data: { defaultWorkspaceId: shared.id },
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await openTask(page, task.title);
    await add(page, "Owner comment");
    await posted(page, "Owner comment");
    const c = (await getComments(page, base))[0];
    await page
      .getByRole("textbox", { name: "Description", exact: true })
      .fill("Work stays dirty");
    await activity(page)
      .getByRole("button", { name: "Edit comment", exact: true })
      .click();
    await page
      .getByLabel("Edit comment text", { exact: true })
      .fill("Local comment edit");
    expect(
      (
        await page.request.patch(base + "/comments/" + c.id, {
          headers: { origin },
          data: { text: "Concurrent comment edit", revision: 1 },
        })
      ).status(),
    ).toBe(200);
    await page
      .getByRole("button", { name: "Save comment edit", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Saved comment version", exact: true }),
    ).toContainText("Concurrent comment edit");
    await activity(page)
      .getByRole("button", { name: "Refresh activity", exact: true })
      .click();
    await ready(page);
    await expect(
      page.getByLabel("Edit comment text", { exact: true }),
    ).toHaveValue("Local comment edit");
    await expect(
      page.getByRole("textbox", { name: "Description", exact: true }),
    ).toHaveValue("Work stays dirty");
    await page
      .getByRole("button", {
        name: "Review complete: keep comment draft",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Save comment edit", exact: true })
      .click();
    await expect(
      page.getByLabel("Edit comment text", { exact: true }),
    ).toHaveCount(0);
    await ready(page);
    const mp = await member.newPage();
    await mp.goto("/projects");
    await mp
      .getByLabel("Creation workspace", { exact: true })
      .selectOption(shared.id);
    // Wait for the saved destination to replace the old personal hierarchy
    // before expanding its disclosure.
    await expect(
      mp.getByText(
        `Projects and tasks in ${shared.name}. Saves require a connection.`,
        { exact: true },
      ),
    ).toBeVisible();
    await openStandalone(mp, task.title);
    await expect(
      comments(mp).getByText("Local comment edit", { exact: true }),
    ).toBeVisible();
    await expect(
      activity(mp).getByRole("button", { name: "Edit comment", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await member.request.patch(base + "/comments/" + c.id, {
          headers: { origin },
          data: { text: "Not my comment", revision: 3 },
        })
      ).status(),
    ).toBe(403);
    await add(mp, "Member post");
    await posted(mp, "Member post");
    await activity(page)
      .getByRole("button", { name: "Refresh activity", exact: true })
      .click();
    await ready(page);
    await expect(
      comments(page).getByText("Member post", { exact: true }),
    ).toBeVisible();
    const details = (
      await (await page.request.get(`/api/workspaces/${shared.id}`)).json()
    ).members;
    const membership = details.find(
      (m: { email: string }) => m.email === email,
    );
    await add(mp, "Revoked draft");
    expect(
      (
        await page.request.delete(
          `/api/workspaces/${shared.id}/members/${membership.id}`,
          { headers: { origin }, data: {} },
        )
      ).status(),
    ).toBe(200);
    await page.bringToFront();
    await mp.bringToFront();
    // Any current protected read (including tag/context refresh after focus)
    // may already have confirmed revocation and closed the editor.
    const refresh = activity(mp).getByRole("button", {
      name: "Refresh activity",
      exact: true,
    });
    if (await refresh.count())
      await refresh
        .click({ trial: true })
        .then(() => refresh.click())
        .catch(async (error) => {
          if (await mp.locator("dialog").count()) throw error;
        });
    await expect(mp.locator("dialog")).toHaveCount(0);
    await expect(
      mp.getByRole("region", { name: "Retained comment drafts", exact: true }),
    ).toHaveCount(0);
    await page.bringToFront();
    await retained(page);
  } finally {
    await member.close();
  }
});

test("Trash activity stays read-only and restores original comment timestamps while preserving a paused draft", async ({
  page,
}) => {
  const ws = await personal(page),
    task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Comment Trash work",
    }),
    base = `/api/workspaces/${ws.id}/tasks/${task.id}`;
  await page.reload();
  await openTask(page, task.title);
  await add(page, "Retained original");
  await posted(page, "Retained original");
  const original = (await getComments(page, base))[0];
  await add(page, "Paused input");
  const target = { kind: "task", id: task.id },
    preview = await (
      await page.request.post(`/api/workspaces/${ws.id}/trash/preview`, {
        headers: { origin },
        data: target,
      })
    ).json();
  const moved = await page.request.post(`/api/workspaces/${ws.id}/trash`, {
    headers: { origin },
    data: {
      ...target,
      impactDigest: preview.impactDigest,
      requestKey: randomUUID(),
    },
  });
  expect(moved.status()).toBe(200);
  await activity(page)
    .getByRole("button", { name: "Refresh activity", exact: true })
    .click();
  await ready(page);
  await expect(
    page.getByLabel("New comment text", { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("link", { name: "Review workspace Trash", exact: true })
    .first()
    .click();
  await closedEditor(page);
  await page
    .getByRole("button", { name: "View read-only detail", exact: true })
    .click();
  const detail = page.getByRole("region", {
    name: "Trashed work detail",
    exact: true,
  });
  await expect(
    detail
      .getByRole("region", { name: "Comments", exact: true })
      .getByText("Retained original", { exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", { name: "Edit comment", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect
    .poll(async () => (await page.request.get(base)).status())
    .toBe(200);
  await page
    .getByRole("button", {
      name: `Review comment draft: ${task.title}`,
      exact: true,
    })
    .click();
  await ready(page);
  await expect(
    page.getByLabel("New comment text", { exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByLabel("New comment text", { exact: true }),
  ).toHaveValue("Paused input");
  expect((await getComments(page, base))[0]).toEqual(original);
  await posted(page, "Paused input");
  await cleanClose(page);
});

test("activity pagination, escaped long text and DST timestamps remain readable in two saved zones", async ({
  page,
}) => {
  const ws = await personal(page),
    task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Timestamp work",
    });
  const owner = (
    await testDB.workspace.findUniqueOrThrow({ where: { id: ws.id } })
  ).personalOwnerId!;
  const dates = ["2030-11-03T08:30:00.000Z", "2030-11-03T09:30:00.000Z"];
  for (let i = 0; i < 27; i++) {
    const id = randomUUID(),
      text =
        i === 0
          ? "<script>unsafe</script>" + "long".repeat(900)
          : "Timestamp comment " + i;
    await testDB.workComment.create({
      data: {
        id,
        workspaceId: ws.id,
        taskId: task.id,
        authorId: owner,
        authorName: "Timestamp member",
        requestKey: randomUUID(),
        createText: text,
        text,
        createdAt: new Date(dates[i % 2]),
      },
    });
    await testDB.workActivity.create({
      data: {
        workspaceId: ws.id,
        taskId: task.id,
        actorId: owner,
        actorName: "Timestamp member",
        occurredAt: new Date(dates[i % 2]),
        eventKey: id,
        action: "comment_created",
        commentId: id,
        commentRevision: 1,
        changes: [{ field: "text", before: null, after: text }],
      },
    });
  }
  await setZone(page, "America/Los_Angeles");
  await page.reload();
  await openTask(page, task.title);
  await ready(page);
  const pane = activity(page);
  await expect(pane.getByText(/01:30:00 PDT/).first()).toBeVisible();
  await expect(pane.getByText(/01:30:00 PST/).first()).toBeVisible();
  await expect(
    pane.locator(`time[datetime="${dates[0]}"]`).first(),
  ).toHaveAttribute("title", dates[0]);
  await expect(pane.locator("script")).toHaveCount(0);
  await pane
    .getByRole("button", { name: "Load more comments", exact: true })
    .click();
  await ready(page);
  await expect(
    pane
      .getByRole("region", { name: "Comments", exact: true })
      .getByRole("article"),
  ).toHaveCount(27);
  await pane
    .getByRole("button", { name: "Load more history", exact: true })
    .click();
  await ready(page);
  await expect(
    pane
      .getByRole("region", { name: "Edit history", exact: true })
      .getByRole("article"),
  ).toHaveCount(28);
  await pane.getByText("Comment changed", { exact: true }).first().click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await add(page, "Draft kept across failed activity load");
  await page.route("**/history", (route) =>
    route.fulfill({ status: 503, json: { error: "Fixture unavailable" } }),
  );
  await pane
    .getByRole("button", { name: "Refresh activity", exact: true })
    .click();
  await expect(pane.getByRole("alert")).toContainText(
    "unavailable or incomplete",
  );
  await expect(
    page.getByLabel("New comment text", { exact: true }),
  ).toHaveValue("Draft kept across failed activity load");
  await expect(
    pane.getByText("No saved comments.", { exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/history");
  await pane
    .getByRole("button", { name: "Refresh activity", exact: true })
    .click();
  await ready(page);
  await page
    .getByRole("button", { name: "Discard this comment draft", exact: true })
    .click();
  await cleanClose(page);
  await setZone(page, "Europe/London");
  await page.reload();
  await openTask(page, task.title);
  await ready(page);
  await expect(
    comments(page)
      .getByText(/08:30:00 GMT/)
      .first(),
  ).toBeVisible();
  await expect(
    comments(page)
      .getByText(/09:30:00 GMT/)
      .first(),
  ).toBeVisible();
});

test("late comment responses cannot populate another account or retain its protected drafts", async ({
  page,
  context,
  browser,
  testAccounts,
}) => {
  const ws = await personal(page),
    task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Old account comment",
    });
  const email = randomUUID() + "@example.invalid";
  testAccounts.push(email);
  const other = await browser.newContext({ baseURL: origin });
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    arrived = new Promise<void>((r) => (entered = r));
  try {
    const signup = await other.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: {
        name: "Next comment account",
        email,
        password: randomUUID() + randomUUID(),
      },
    });
    expect(signup.status()).toBe(200);
    await page.reload();
    await openTask(page, task.title);
    await add(page, "Old protected draft");
    await page.route("**/comments", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      entered();
      await gate;
      try {
        await route.fulfill({ response });
      } catch {
        /* The old document can be gone after account verification. */
      }
    });
    await page
      .getByRole("button", { name: "Post comment", exact: true })
      .click();
    await arrived;
    await context.clearCookies();
    await context.addCookies(await other.cookies());
    release();
    await expect(
      page.getByText(`Signed in as ${email}`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("region", {
        name: "Retained comment drafts",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Old protected draft", { exact: true }),
    ).toHaveCount(0);
    const own = await personal(page),
      next = await post(page, `/api/workspaces/${own.id}/tasks`, {
        title: "New account comment",
      });
    await page.reload();
    await openTask(page, next.title);
    await add(page, "Current account comment");
    await posted(page, "Current account comment");
    await expect(
      comments(page).getByText("Old protected draft", { exact: true }),
    ).toHaveCount(0);
    expect(
      await testDB.workComment.count({
        where: {
          workspaceId: ws.id,
          taskId: task.id,
          text: "Old protected draft",
        },
      }),
    ).toBe(1);
    await cleanClose(page);
  } finally {
    release?.();
    await other.close();
  }
});

test("activity refresh restores the same mounted work editor without rebasing its drafts", async ({
  page,
}) => {
  const ws = await personal(page);
  for (const kind of ["project", "task", "subtask"] as const) {
    const project = await post(page, `/api/workspaces/${ws.id}/projects`, {
      title: "Mounted " + kind,
    });
    const parent = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Mounted parent " + kind,
      projectId: project.id,
    });
    const child = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Mounted child " + kind,
      parentId: parent.id,
    });
    const work =
      kind === "project" ? project : kind === "task" ? parent : child;
    const base = `/api/workspaces/${ws.id}/${kind === "project" ? "projects" : "tasks"}/${work.id}`;
    await page.goto("/calendar");
    await page
      .getByRole("button", {
        name: `Edit ${kind === "project" ? "project" : "task"}: ${work.title}`,
        exact: true,
      })
      .click();
    await ready(page);
    const form = page.getByRole("form", {
      name:
        kind === "project"
          ? "Edit project"
          : kind === "task"
            ? "Edit task"
            : "Edit subtask",
      exact: true,
    });
    await form
      .getByRole("textbox", { name: "Description", exact: true })
      .fill("Kept work draft " + kind);
    await add(page, "Kept comment draft " + kind);
    const target = { kind: "project", id: project.id };
    const impact = await (
      await page.request.post(`/api/workspaces/${ws.id}/trash/preview`, {
        headers: { origin },
        data: target,
      })
    ).json();
    const moved = await page.request.post(`/api/workspaces/${ws.id}/trash`, {
      headers: { origin },
      data: {
        ...target,
        impactDigest: impact.impactDigest,
        requestKey: randomUUID(),
      },
    });
    expect(moved.status()).toBe(200);
    const batch = (await moved.json()).batch;
    await activity(page)
      .getByRole("button", { name: "Refresh activity", exact: true })
      .click();
    await ready(page);
    await expect(
      form.getByRole("textbox", { name: "Title", exact: true }),
    ).toBeDisabled();
    expect(
      (
        await page.request.post(
          `/api/workspaces/${ws.id}/trash/${batch.id}/restore`,
          { headers: { origin }, data: { revision: batch.revision } },
        )
      ).status(),
    ).toBe(200);
    await page.route("**/history", (route) =>
      route.fulfill({ status: 503, json: { error: "Unavailable" } }),
    );
    await activity(page)
      .getByRole("button", { name: "Refresh activity", exact: true })
      .click();
    await expect(activity(page).getByRole("alert")).toBeVisible();
    await expect(
      form.getByRole("textbox", { name: "Title", exact: true }),
    ).toBeDisabled();
    await page.unroute("**/history");
    await activity(page)
      .getByRole("button", { name: "Refresh activity", exact: true })
      .click();
    await ready(page);
    await expect(
      form.getByRole("textbox", { name: "Title", exact: true }),
    ).toBeEnabled();
    await expect(
      form.getByRole("textbox", { name: "Description", exact: true }),
    ).toHaveValue("Kept work draft " + kind);
    await expect(
      page.getByLabel("New comment text", { exact: true }),
    ).toHaveValue("Kept comment draft " + kind);
    await expect(
      page.getByText("This work is in Trash or unavailable.", { exact: false }),
    ).toHaveCount(0);
    await form
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      form.getByRole("region", { name: "Saved version", exact: true }),
    ).toBeVisible();
    expect((await (await page.request.get(base)).json()).description).toBe("");
    await page
      .getByRole("button", { name: "Close editor", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await closedEditor(page);
  }
});

test("an obsolete active refresh cannot unlock another inactive work editor", async ({
  page,
}) => {
  const ws = await personal(page),
    a = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Delayed active context",
    }),
    b = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Inactive current context",
    });
  await page.reload();
  await openTask(page, b.title);
  await add(page, "Inactive retained comment");
  await retained(page);
  const target = { kind: "task", id: b.id },
    impact = await (
      await page.request.post(`/api/workspaces/${ws.id}/trash/preview`, {
        headers: { origin },
        data: target,
      })
    ).json();
  expect(
    (
      await page.request.post(`/api/workspaces/${ws.id}/trash`, {
        headers: { origin },
        data: {
          ...target,
          impactDigest: impact.impactDigest,
          requestKey: randomUUID(),
        },
      })
    ).status(),
  ).toBe(200);
  let release!: () => void, entered!: () => void, settled!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    arrived = new Promise<void>((r) => (entered = r)),
    done = new Promise<void>((r) => (settled = r));
  await page.route(`**/tasks/${a.id}/comments`, async (route) => {
    const response = await route.fetch();
    entered();
    await gate;
    try {
      await route.fulfill({ response });
    } catch {
      /* The source editor can be gone. */
    } finally {
      settled();
    }
  });
  try {
    await page.getByRole("button", { name: a.title, exact: true }).click();
    await arrived;
    await page
      .getByRole("textbox", { name: "Description", exact: true })
      .fill("Old active draft");
    await retained(page);
    await page
      .getByRole("button", {
        name: "Review comment draft: " + b.title,
        exact: true,
      })
      .click();
    await ready(page);
    const title = page.getByRole("textbox", { name: "Title", exact: true });
    await expect(title).toBeDisabled();
    release();
    await done;
    await expect(title).toBeDisabled();
    await expect(
      page.getByLabel("New comment text", { exact: true }),
    ).toHaveValue("Inactive retained comment");
    await expect(
      page.getByLabel("New comment text", { exact: true }),
    ).toBeDisabled();
    await retained(page);
  } finally {
    release?.();
  }
});
