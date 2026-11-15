import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import {
  post,
  personal,
  origin,
  openTask,
  cleanClose,
  retained,
} from "./planner-helpers";
test.setTimeout(120000);
test.use({ actionTimeout: 15000 });

test("checklists and shopping lists save independent typed rows and workspace vendor choices", async ({
  page,
}) => {
  const ws = await personal(page),
    task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "List work",
    });
  await page.reload();
  await openTask(page, task.title);
  const panel = page.getByRole("region", {
    name: "Checklists and shopping lists",
    exact: true,
  });
  await expect(
    panel.getByRole("button", { name: "Add checklist", exact: true }),
  ).toBeEnabled();
  let workWrites = 0;
  page.on("request", (r) => {
    if (
      r.method() !== "GET" &&
      (/time-blocks/.test(r.url()) || r.url().endsWith(`/tasks/${task.id}`))
    )
      workWrites++;
  });
  await panel
    .getByRole("button", { name: "Add checklist", exact: true })
    .click();
  await panel
    .getByLabel("Section name", { exact: true })
    .fill("Installation steps");
  await panel
    .getByRole("button", { name: "Save section", exact: true })
    .click();
  const checklist = panel.getByRole("region", {
    name: "Checklist: Installation steps",
    exact: true,
  });
  await expect(checklist).toBeVisible();
  await checklist
    .getByRole("button", {
      name: "Add item to Installation steps",
      exact: true,
    })
    .click();
  await panel.getByLabel("Item text", { exact: true }).fill("Mount the shelf");
  await panel.getByLabel("Checked", { exact: true }).check();
  await expect(panel.getByLabel("Quantity", { exact: true })).toHaveCount(0);
  await expect(panel.getByLabel("Vendor", { exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    checklist.getByText("1 of 1 checked", { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "Add shopping list", exact: true })
    .click();
  await panel.getByLabel("Section name", { exact: true }).fill("Things to buy");
  await panel
    .getByRole("button", { name: "Save section", exact: true })
    .click();
  await panel.getByText("Workspace vendor choices", { exact: true }).click();
  await panel.getByRole("button", { name: "Add vendor", exact: true }).click();
  await panel.getByLabel("Vendor name", { exact: true }).fill("Local supplier");
  await panel.getByRole("button", { name: "Save vendor", exact: true }).click();
  const shop = panel.getByRole("region", {
    name: "Shopping list: Things to buy",
    exact: true,
  });
  await shop
    .getByRole("button", { name: "Add item to Things to buy", exact: true })
    .click();
  await panel.getByLabel("Item text", { exact: true }).fill("Brackets");
  await panel.getByLabel("Quantity", { exact: true }).fill("2.5");
  await panel
    .getByRole("combobox", { name: "Vendor", exact: true })
    .selectOption({ label: "Local supplier" });
  await panel.getByLabel("Purchased", { exact: true }).check();
  await panel.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(shop.getByText(/Quantity: 2.5/)).toBeVisible();
  expect(workWrites).toBe(0);
  await cleanClose(page);
  await page.goto("/board");
  await page
    .getByRole("article", { name: task.title, exact: true })
    .getByRole("button")
    .click();
  await expect(
    page.getByRole("region", {
      name: "Checklist: Installation steps",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: "Shopping list: Things to buy",
      exact: true,
    }),
  ).toContainText("Local supplier");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await cleanClose(page);
});

test("uncertain list creates keep work/comment input and reconcile without duplicate sections", async ({
  page,
}) => {
  const ws = await personal(page),
    task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Retained list work",
    }),
    base = `/api/workspaces/${ws.id}/tasks/${task.id}`;
  await page.reload();
  await openTask(page, task.title);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Retained work");
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  await page
    .getByLabel("New comment text", { exact: true })
    .fill("Retained comment");
  await page
    .getByRole("button", { name: "Add checklist", exact: true })
    .click();
  await page.getByLabel("Section name", { exact: true }).fill("Retained list");
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    arrived = new Promise<void>((r) => (entered = r));
  await page.route("**/lists", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    entered();
    await gate;
    await route.abort();
  });
  try {
    await page
      .getByRole("button", { name: "Save section", exact: true })
      .click();
    await arrived;
    await expect(
      page.getByRole("button", { name: "Close editor", exact: true }),
    ).toBeDisabled();
    release();
    await expect(
      page.getByRole("button", { name: "Retry same list save", exact: true }),
    ).toBeEnabled();
    await page.unroute("**/lists");
    await retained(page);
    await page.getByRole("link", { name: "Calendar", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Review retained input: Checklist",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Retry same list save", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("textbox", { name: "Description", exact: true }),
    ).toHaveValue("Retained work");
    await expect(
      page.getByLabel("New comment text", { exact: true }),
    ).toHaveValue("Retained comment");
    await page
      .getByRole("button", { name: "Retry same list save", exact: true })
      .click();
    await expect(
      page.getByRole("region", {
        name: "Checklist: Retained list",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await (await page.request.get(base + "/lists")).json()).lists,
    ).toHaveLength(1);
    await page
      .getByRole("button", { name: "Close editor", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
  } finally {
    release?.();
  }
});

test("item conflicts and reversible archives preserve independent data in read-only Trash", async ({
  page,
}) => {
  const ws = await personal(page),
    task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Archived list work",
    }),
    base = `/api/workspaces/${ws.id}/tasks/${task.id}`;
  const list = (
      await post(page, base + "/lists", {
        name: "Steps",
        kind: "checklist",
        requestKey: randomUUID(),
      })
    ).list,
    item = (
      await post(page, base + "/lists/" + list.id + "/items", {
        text: "Saved item",
        requestKey: randomUUID(),
      })
    ).item;
  await page.reload();
  await openTask(page, task.title);
  const panel = page.getByRole("region", {
    name: "Checklists and shopping lists",
    exact: true,
  });
  await panel
    .getByRole("button", { name: "Edit item / archive / restore", exact: true })
    .click();
  await panel.getByLabel("Item text", { exact: true }).fill("Local item input");
  expect(
    (
      await page.request.patch(
        base + "/lists/" + list.id + "/items/" + item.id,
        {
          headers: { origin },
          data: {
            text: "Concurrent item",
            checked: false,
            archived: false,
            revision: 1,
          },
        },
      )
    ).status(),
  ).toBe(200);
  await panel.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    panel.getByRole("region", {
      name: "Saved supplemental version",
      exact: true,
    }),
  ).toContainText("Concurrent item");
  await panel
    .getByRole("button", {
      name: "Review complete: keep list input",
      exact: true,
    })
    .click();
  await panel
    .getByLabel("Archived (uncheck to restore)", { exact: true })
    .check();
  await panel.getByRole("button", { name: "Save item", exact: true }).click();
  await panel
    .getByLabel("Show archived sections and items", { exact: true })
    .check();
  await expect(
    panel.getByText("Local item input (archived)", { exact: true }),
  ).toBeVisible();
  await cleanClose(page);
  const target = { kind: "task", id: task.id },
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
  await page.goto(`/trash?workspaceId=${ws.id}`);
  await page
    .getByRole("button", { name: "View read-only detail", exact: true })
    .click();
  const detail = page.getByRole("region", {
    name: "Trashed work detail",
    exact: true,
  });
  await detail
    .getByLabel("Show archived sections and items", { exact: true })
    .check();
  await expect(
    detail.getByText("Local item input (archived)", { exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", {
      name: "Edit item / archive / restore",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  const after = (await (await page.request.get(base + "/lists")).json())
    .lists[0].items[0];
  expect(after).toMatchObject({
    id: item.id,
    text: "Local item input",
    revision: 3,
  });
  expect(after.archivedAt).toBeTruthy();
});

test("an obsolete list completion cannot clear another account's input or pending lock", async ({
  page,
  context,
  browser,
  testAccounts,
}) => {
  const ws = await personal(page),
    oldTask = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Old account list target",
    }),
    email = randomUUID() + "@example.invalid";
  testAccounts.push(email);
  const other = await browser.newContext({ baseURL: origin });
  let releaseOld!: () => void,
    releaseNew!: () => void,
    oldEntered!: () => void,
    newEntered!: () => void,
    oldSettled!: () => void;
  const oldGate = new Promise<void>((r) => (releaseOld = r)),
    newGate = new Promise<void>((r) => (releaseNew = r)),
    oldReady = new Promise<void>((r) => (oldEntered = r)),
    newReady = new Promise<void>((r) => (newEntered = r)),
    oldDone = new Promise<void>((r) => (oldSettled = r));
  let newId = "";
  try {
    expect(
      (
        await other.request.post("/api/auth/sign-up/email", {
          headers: { origin },
          data: {
            name: "New list account",
            email,
            password: randomUUID() + randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await openTask(page, oldTask.title);
    await page
      .getByRole("button", { name: "Add checklist", exact: true })
      .click();
    await page
      .getByLabel("Section name", { exact: true })
      .fill("Old account list");
    await page.route("**/lists", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      if (route.request().url().includes(`/${oldTask.id}/lists`)) {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        oldEntered();
        await oldGate;
        try {
          await route.fulfill({ response });
        } catch {
          /* Prior document may have left. */
        } finally {
          oldSettled();
        }
        return;
      }
      if (newId && route.request().url().includes(`/${newId}/lists`)) {
        newEntered();
        await newGate;
        return route.continue();
      }
      return route.continue();
    });
    await page
      .getByRole("button", { name: "Save section", exact: true })
      .click();
    await oldReady;
    await context.clearCookies();
    await context.addCookies(await other.cookies());
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText(`Signed in as ${email}`, { exact: true }),
    ).toBeVisible();
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("region", {
        name: "Retained list and configuration drafts",
        exact: true,
      }),
    ).toHaveCount(0);
    const own = await personal(page),
      newTask = await post(page, `/api/workspaces/${own.id}/tasks`, {
        title: "New account list target",
      });
    newId = newTask.id;
    await page.reload();
    await openTask(page, newTask.title);
    await page
      .getByRole("button", { name: "Add checklist", exact: true })
      .click();
    await page
      .getByLabel("Section name", { exact: true })
      .fill("New account list");
    await page
      .getByRole("button", { name: "Save section", exact: true })
      .click();
    await newReady;
    releaseOld();
    await oldDone;
    await expect(
      page.getByRole("button", { name: "Close editor", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Section name", { exact: true })).toHaveValue(
      "New account list",
    );
    releaseNew();
    await expect(
      page.getByRole("region", {
        name: "Checklist: New account list",
        exact: true,
      }),
    ).toBeVisible();
    await cleanClose(page);
  } finally {
    releaseOld?.();
    releaseNew?.();
    await other.close();
  }
});
