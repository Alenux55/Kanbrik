import { test, expect } from "./fixtures";
import { personal, post, saved } from "./planner-helpers";
import type { Page } from "@playwright/test";

async function board(page: Page) {
  const workspace = await personal(page);
  const task = await post(page, `/api/workspaces/${workspace.id}/tasks`, { title: "History task", description: "Saved description" });
  await page.getByRole("navigation").getByRole("link", { name: "Board", exact: true }).click();
  await expect(page).toHaveURL(/\/board$/);
  const trigger = page.getByRole("article", { name: "History task", exact: true }).getByRole("button");
  await expect(trigger).toBeVisible();
  return { task, path: `/api/workspaces/${workspace.id}/tasks/${task.id}`, trigger };
}
async function open(page: Page) {
  await page.getByRole("article", { name: "History task", exact: true }).getByRole("button").click();
  const form = page.getByRole("form", { name: "Edit task", exact: true });
  await expect(form.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
  return form;
}
async function reconciled(page: Page) {
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.history.state?.kanbrikDialog ?? null)).toBeNull();
}
async function previousRoute(page: Page) {
  await page.goBack();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
}

test("ordinary editor closure does not accumulate Back steps and native Back closes only the editor", async ({ page }) => {
  const { trigger } = await board(page);
  const length = await page.evaluate(() => history.length);
  for (const action of ["Close editor", "Cancel", "Escape"]) {
    await open(page);
    if (action === "Escape") await page.keyboard.press("Escape");
    else await page.getByRole("button", { name: action, exact: true }).click();
    await reconciled(page);
    await expect(trigger).toBeFocused();
  }
  // Consuming an owned entry can leave one Forward entry; reopening replaces it.
  const afterClose = await page.evaluate(() => history.length);
  console.log({ initialHistoryLength: length, afterRepeatedClose: afterClose });
  await previousRoute(page);
  expect(afterClose).toBeLessThanOrEqual(length + 1);
  await page.goForward();
  await expect(page).toHaveURL(/\/board$/);
  await open(page);
  await page.goBack();
  await reconciled(page);
  await expect(page).toHaveURL(/\/board$/);
  await previousRoute(page);
});

test("dirty Back keeps input, retained drafts and successful saves reconcile their own entries", async ({ page }) => {
  const { path } = await board(page);
  const form = await open(page);
  await form.getByLabel("Description").fill("History draft");
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goBack();
    await expect(page.getByRole("button", { name: "Keep editing", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(form.getByLabel("Description")).toHaveValue("History draft");
  }
  await page.getByRole("button", { name: "Keep draft for later", exact: true }).click();
  await reconciled(page);
  await previousRoute(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/board$/);
  const retained = await open(page);
  await expect(retained.getByLabel("Description")).toHaveValue("History draft");
  await retained.getByRole("button", { name: "Save changes", exact: true }).click();
  await saved(page);
  await reconciled(page);
  expect((await (await page.request.get(path)).json()).description).toBe("History draft");
  await previousRoute(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/board$/);
  const discard = await open(page);
  await discard.getByLabel("Description").fill("Discard this change");
  await page.goBack();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await reconciled(page);
  expect((await (await page.request.get(path)).json()).description).toBe("History draft");
  await previousRoute(page);
});

test("Back during a pending save cannot dismiss or duplicate it and save closure consumes one entry", async ({ page }) => {
  const { path } = await board(page);
  const form = await open(page);
  await form.getByLabel("Description").fill("Pending history save");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  await page.route("**" + path, async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    writes++;
    await gate;
    await route.continue();
  });
  try {
    await form.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(form.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
    await page.goBack();
    await expect.poll(() => page.evaluate(() => !!window.history.state?.kanbrikDialog)).toBe(true);
    await expect(page).toHaveURL(/\/board$/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Close editor", exact: true })).toBeDisabled();
    expect(writes).toBe(1);
  } finally { release(); }
  await saved(page);
  await reconciled(page);
  expect((await (await page.request.get(path)).json()).description).toBe("Pending history save");
  expect(writes).toBe(1);
  await previousRoute(page);
});
