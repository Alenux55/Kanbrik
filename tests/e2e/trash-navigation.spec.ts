import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  post,
  personal,
  origin,
  openTask,
  retained,
  closedEditor,
} from "./planner-helpers";
test.setTimeout(180000);
test.use({ actionTimeout: 15000 });
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    release,
    wait: () => {
      let timeout: ReturnType<typeof setTimeout>;
      return Promise.race([
        promise,
        new Promise<void>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Fixture request did not arrive")),
            15000,
          );
        }),
      ]).finally(() => clearTimeout(timeout));
    },
  };
};
async function trash(page: Page, workspaceId: string, id: string) {
  const target = { kind: "task", id };
  const preview = await page.request.post(
    `/api/workspaces/${workspaceId}/trash/preview`,
    { headers: { origin }, data: target },
  );
  expect(preview.status()).toBe(200);
  const response = await page.request.post(
    `/api/workspaces/${workspaceId}/trash`,
    {
      headers: { origin },
      data: {
        ...target,
        impactDigest: (await preview.json()).impactDigest,
        requestKey: randomUUID(),
      },
    },
  );
  expect(response.status()).toBe(200);
  return (await response.json()).batch;
}
async function source(
  page: Page,
  path: string,
  workspaceId: string,
  ownId: string,
  title: string,
) {
  expect(
    (
      await page.request.patch("/api/planner/preferences", {
        headers: { origin },
        data: { defaultWorkspaceId: path === "projects" ? workspaceId : ownId },
      })
    ).status(),
  ).toBe(200);
  for (const view of ["board", "calendar"])
    expect(
      (
        await page.request.put(`/api/${view}/preferences`, {
          headers: { origin },
          data: { workspaceIds: [ownId, workspaceId] },
        })
      ).status(),
    ).toBe(200);
  await page.goto("/" + path);
  if (path === "projects") await openTask(page, title);
  else if (path === "board")
    await page
      .getByRole("article", { name: title, exact: true })
      .getByRole("button")
      .click();
  else
    await page
      .getByRole("button", { name: `Edit task: ${title}`, exact: true })
      .click();
  await expect(
    page
      .getByRole("form", { name: "Edit task", exact: true })
      .getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() => page.evaluate(() => typeof history.state?.kanbrikDialog))
    .toBe("string");
}
async function destination(
  page: Page,
  workspaceId: string,
  title: string,
  isMobile: boolean,
) {
  await expect(page).toHaveURL(`${origin}/trash?workspaceId=${workspaceId}`);
  await closedEditor(page);
  const restore = page
    .getByRole("article", { name: `Trash operation: ${title}`, exact: true })
    .getByRole("button", { name: "Restore", exact: true });
  const response = page.waitForResponse(
    (value) =>
      value.request().method() === "POST" && value.url().endsWith("/restore"),
  );
  if (isMobile) await restore.tap();
  else await restore.click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('[data-session-state="ready"]')).toBeVisible();
}
async function backToSource(page: Page, path: string) {
  await page.goBack();
  await expect(page).toHaveURL(`${origin}/${path}`);
  await closedEditor(page);
}

test("clean and dirty work-editor Trash links close before direct Restore from Projects, Board and Calendar", async ({
  page,
  isMobile,
  testWorkspaces,
}) => {
  const own = await personal(page),
    ws = await post(page, "/api/workspaces", {
      name: "Navigation destination",
    });
  testWorkspaces.push(ws.id);
  const work = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Navigation source",
  });
  for (const path of ["projects", "board", "calendar"])
    for (const dirty of [false, true]) {
      const label = `Restore ${path} ${dirty}`;
      const removed = await post(page, `/api/workspaces/${ws.id}/tasks`, {
        title: label,
      });
      await trash(page, ws.id, removed.id);
      await source(page, path, ws.id, own.id, work.title);
      const initial = await page.evaluate(() => history.length);
      const documentId = randomUUID();
      await page.evaluate((value) => {
        (
          window as typeof window & { navigationDocument?: string }
        ).navigationDocument = value;
      }, documentId);
      const input = `Retained ${path}`;
      if (dirty)
        await page
          .getByRole("textbox", { name: "Description", exact: true })
          .fill(input);
      const link = page.getByRole("link", {
        name: "Open workspace Trash",
        exact: true,
      });
      if (!dirty) {
        await link.focus();
        await page.keyboard.press("Enter");
      } else if (isMobile) await link.tap();
      else await link.click();
      await destination(page, ws.id, label, isMobile);
      await expect(
        page.getByLabel("Creation workspace", { exact: true }),
      ).toHaveValue(path === "projects" ? ws.id : own.id);
      // The dialog slot is replaced by a real route, not left as a phantom step.
      expect(await page.evaluate(() => history.length)).toBe(initial);
      await backToSource(page, path);
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { navigationDocument?: string })
              .navigationDocument,
        ),
      ).toBe(documentId);
      if (dirty) {
        await page
          .getByRole("button", {
            name: "Review work draft: Navigation source",
            exact: true,
          })
          .click();
        await expect(
          page.getByRole("textbox", { name: "Description", exact: true }),
        ).toHaveValue(input);
        await retained(page);
      }
      expect(
        (
          await page.request.get(`/api/workspaces/${ws.id}/tasks/${removed.id}`)
        ).status(),
      ).toBe(200);
    }
});

test("record-unavailable recovery goes directly to Restore and retains stale input across all work-editor surfaces", async ({
  page,
  isMobile,
  testWorkspaces,
}) => {
  const own = await personal(page),
    ws = await post(page, "/api/workspaces", {
      name: "Unavailable navigation",
    });
  testWorkspaces.push(ws.id);
  for (const path of ["projects", "board", "calendar"]) {
    const work = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: `Unavailable ${path}`,
    });
    await source(page, path, ws.id, own.id, work.title);
    await page
      .getByRole("textbox", { name: "Description", exact: true })
      .fill(`Keep ${path} recovery input`);
    await trash(page, ws.id, work.id);
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "work is in Trash or unavailable" }),
    ).toBeVisible();
    const recovery = page.getByRole("link", {
      name: "Review workspace Trash",
      exact: true,
    });
    if (path === "projects") {
      const preview = gate(),
        previewReady = gate();
      await page.route(
        `**/workspaces/${ws.id}/trash/preview`,
        async (route) => {
          previewReady.release();
          await preview.promise;
          await route.continue();
        },
      );
      await page
        .getByRole("button", { name: "Preview Move to Trash", exact: true })
        .click();
      try {
        await previewReady.wait();
        await expect(recovery).toHaveAttribute("aria-disabled", "true");
        await recovery.scrollIntoViewIfNeeded();
        const box = (await recovery.boundingBox())!;
        if (isMobile) await page.touchscreen.tap(box.x + 10, box.y + 10);
        else await page.mouse.click(box.x + 10, box.y + 10);
        await expect(page).toHaveURL(`${origin}/projects`);
      } finally {
        preview.release();
      }
      await expect(recovery).not.toHaveAttribute("aria-disabled", "true");
      await page.unroute(`**/workspaces/${ws.id}/trash/preview`);
    }
    if (isMobile) await recovery.tap();
    else await recovery.click();
    await destination(page, ws.id, work.title, isMobile);
    await backToSource(page, path);
    await page
      .getByRole("button", {
        name: `Review work draft: ${work.title}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Description", exact: true }),
    ).toHaveValue(`Keep ${path} recovery input`);
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Saved version", exact: true }),
    ).toContainText("revision 3");
    await retained(page);
  }
});

test("pending saves guard navigation and an uncertain Trash intent survives direct recovery navigation", async ({
  page,
  isMobile,
}) => {
  const ws = await personal(page),
    work = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Pending navigation",
    });
  await page.goto("/projects");
  await openTask(page, work.title);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Confirmed first edit");
  const save = gate(),
    readySave = gate();
  await page.route(`**/tasks/${work.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    readySave.release();
    await save.promise;
    await route.continue();
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  try {
    await readySave.wait();
    await expect(
      page.getByRole("link", { name: "Open workspace Trash", exact: true }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(`${origin}/projects`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close editor", exact: true }),
    ).toBeDisabled();
    await page.goBack();
    await expect
      .poll(() => page.evaluate(() => typeof history.state?.kanbrikDialog))
      .toBe("string");
    await expect(page).toHaveURL(`${origin}/projects`);
  } finally {
    save.release();
  }
  await closedEditor(page);
  await page.getByRole("button", { name: work.title, exact: true }).click();
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Retain uncertain input");
  await page
    .getByRole("button", { name: "Preview Move to Trash", exact: true })
    .click();
  const move = gate(),
    readyMove = gate();
  const payloads: object[] = [];
  let first = true;
  await page.route(`**/workspaces/${ws.id}/trash`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    payloads.push(route.request().postDataJSON());
    if (!first) return route.continue();
    first = false;
    await route.fetch();
    readyMove.release();
    await move.promise;
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "Confirm Move to Trash", exact: true })
    .click();
  try {
    await readyMove.wait();
    await expect(
      page.getByRole("link", { name: "Open workspace Trash", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Close editor", exact: true }),
    ).toBeDisabled();
  } finally {
    move.release();
  }
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Move unconfirmed",
  );
  await page
    .getByRole("link", { name: "Open workspace Trash", exact: true })
    .click();
  await destination(page, ws.id, work.title, isMobile);
  await backToSource(page, "projects");
  await page
    .getByRole("button", {
      name: `Review Trash action: ${work.title}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Retain uncertain input");
  await page
    .getByRole("button", { name: "Retry same Trash operation", exact: true })
    .click();
  await closedEditor(page);
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
  expect(
    (
      await page.request.get(`/api/workspaces/${ws.id}/tasks/${work.id}`)
    ).status(),
  ).toBe(200);
});

test("failed session checks retain the editor and obsolete navigation cannot affect a newer account's pending edit", async ({
  browser,
  context,
  page,
  testAccounts,
}) => {
  const own = await personal(page),
    work = await post(page, `/api/workspaces/${own.id}/tasks`, {
      title: "Old navigation target",
    });
  await page.goto("/projects");
  await openTask(page, work.title);
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("Preserve on verification error");
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
  await page.route("**/api/planner-session", (route) =>
    route.fulfill({ status: 503, json: { error: "Fixture check failure" } }),
  );
  await page
    .getByRole("link", { name: "Open workspace Trash", exact: true })
    .click();
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
    page.getByRole("textbox", { name: "Description", exact: true }),
  ).toHaveValue("Preserve on verification error");
  await expect(page).toHaveURL(`${origin}/projects`);
  const provisioning = await browser.newContext({ baseURL: origin });
  const email = randomUUID() + "@example.invalid",
    password = randomUUID() + randomUUID();
  testAccounts.push(email);
  const held = gate(),
    ready = gate(),
    settled = gate(),
    pending = gate(),
    saveReady = gate();
  try {
    expect(
      (
        await provisioning.request.post("/api/auth/sign-up/email", {
          headers: { origin },
          data: { email, password, name: "Navigation account" },
        })
      ).status(),
    ).toBe(200);
    let first = true;
    await page.route("**/api/planner-session", async (route) => {
      if (!first) return route.continue();
      first = false;
      const response = await route.fetch();
      ready.release();
      await held.promise;
      await route.fulfill({ response }).catch(() => {});
      settled.release();
    });
    await page
      .getByRole("link", { name: "Open workspace Trash", exact: true })
      .click();
    await ready.wait();
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
    const current = await personal(page),
      newer = await post(page, `/api/workspaces/${current.id}/tasks`, {
        title: "New navigation account",
      });
    await page.getByRole("link", { name: "Board", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/board`);
    await expect(
      page.getByRole("heading", { name: "Board", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/projects`);
    await openTask(page, newer.title);
    await page
      .getByRole("textbox", { name: "Description", exact: true })
      .fill("New account retained save");
    await page.route(`**/tasks/${newer.id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      saveReady.release();
      await pending.promise;
      await route.continue();
    });
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await saveReady.wait();
    held.release();
    await settled.wait();
    await expect(page).toHaveURL(`${origin}/projects`);
    await expect(
      page.getByRole("button", { name: "Close editor", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("textbox", { name: "Description", exact: true }),
    ).toHaveValue("New account retained save");
    pending.release();
    await closedEditor(page);
    expect(
      (
        await (
          await page.request.get(
            `/api/workspaces/${current.id}/tasks/${newer.id}`,
          )
        ).json()
      ).description,
    ).toBe("New account retained save");
  } finally {
    held.release();
    pending.release();
    await provisioning.close();
  }
});
