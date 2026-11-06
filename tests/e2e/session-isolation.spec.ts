import type { Browser, Page, Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { test, expect } from "./base";

test.setTimeout(90_000);
const origin = "http://127.0.0.1:3100";
const sessionPath = "**/api/auth/get-session*";
const taskPath = "**/api/workspaces/*/tasks/*";
type Account = { email: string; password: string; id: string };
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function signIn(page: Page, account: Account) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText(`Signed in as ${account.email}`, { exact: true })).toBeVisible();
}
async function setup(browser: Browser, page: Page, accounts: string[], workspaces: string[]) {
  const provisioning = await browser.newContext({ baseURL: origin });
  try {
    const users: Account[] = [];
    for (const request of [page.request, provisioning.request]) {
      const email = `${randomUUID()}@example.invalid`; accounts.push(email);
      const password = randomUUID() + randomUUID();
      const response = await request.post("/api/auth/sign-up/email", { headers: { origin }, data: { name: "Session fixture", email, password } });
      expect(response.status()).toBe(200);
      users.push({ email, password, id: (await response.json()).user.id });
    }
    const [a, b] = users;
    const response = await page.request.post("/api/workspaces", { headers: { origin }, data: { name: "Session isolation" } });
    expect(response.status()).toBe(201);
    const workspace = await response.json(); workspaces.push(workspace.id);
    expect((await page.request.post(`/api/workspaces/${workspace.id}/members`, { headers: { origin }, data: { email: b.email } })).status()).toBe(200);
    const creation = await page.request.post(`/api/workspaces/${workspace.id}/tasks`, { headers: { origin }, data: { title: "Shared session task", description: "Saved shared text" } });
    expect(creation.status()).toBe(201);
    const task = await creation.json();
    await signIn(page, a);
    return { a, b, workspaceId: workspace.id as string, taskId: task.id as string };
  } finally { await provisioning.close(); }
}
async function openTask(page: Page, workspaceId: string) {
  await page.getByLabel("Planning workspace").selectOption(workspaceId);
  await page.getByRole("button", { name: "Edit task: Shared session task", exact: true }).click();
  return page.getByRole("form", { name: "Edit task", exact: true });
}
async function fulfillIfActive(route: Route, response: Awaited<ReturnType<Route["fetch"]>>) {
  // An identity change deliberately aborts old requests/documents.
  await route.fulfill({ response }).catch(() => {});
}

test("same-cookie tabs refresh account context, prevent draft resurrection, and clear background logout", async ({ browser, context, page, testAccounts, testWorkspaces, isMobile }) => {
  const { a, b, workspaceId, taskId } = await setup(browser, page, testAccounts, testWorkspaces);
  const form = await openTask(page, workspaceId);
  const draft = "Account A private unsaved draft";
  await form.getByLabel("Description").fill(draft);
  const control = await context.newPage(); // Intentionally the SAME cookie jar.
  const prompts: string[] = [];
  page.on("dialog", dialog => { prompts.push(dialog.type()); void dialog.dismiss(); });
  await control.goto("/sign-in"); await control.bringToFront(); await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(form.getByLabel("Description")).toHaveValue(draft);
  await expect(page.getByLabel("Planning workspace")).toHaveValue(workspaceId);
  await page.getByRole("navigation").getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Projects", exact: true }).click();
  const restored = await openTask(page, workspaceId);
  await expect(restored.getByLabel("Description")).toHaveValue(draft);
  let staleWrites = 0;
  page.on("request", request => { if (request.method() === "PATCH" && request.url().includes(`/tasks/${taskId}`) && request.postDataJSON().description === draft) staleWrites++; });
  await control.bringToFront(); await signIn(control, b);
  expect((await (await context.request.get("/api/auth/get-session")).json()).user.id).toBe(b.id);
  await page.bringToFront();
  // Navigation must be safe even when Next would otherwise reuse its layout.
  const board = page.getByRole("navigation").getByRole("link", { name: "Board", exact: true });
  if (isMobile) await board.tap(); else await board.click();
  await page.getByRole("navigation").getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByText(`Signed in as ${b.email}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Planning workspace")).toHaveValue("");
  const bForm = await openTask(page, workspaceId);
  await expect(bForm.getByLabel("Description")).toHaveValue("Saved shared text");
  expect(staleWrites).toBe(0); expect(prompts).toEqual([]);
  await control.bringToFront(); await signIn(control, a);
  await page.bringToFront();
  await expect(page.getByText(`Signed in as ${a.email}`, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Planning workspace")).toHaveValue("");
  const aAgain = await openTask(page, workspaceId);
  await expect(aAgain.getByLabel("Description")).toHaveValue("Saved shared text");
  await aAgain.getByLabel("Description").fill("Draft invalidated by remote logout");
  const current = await (await context.request.get(`/api/workspaces/${workspaceId}/tasks/${taskId}`)).json();
  expect((await context.request.patch(`/api/workspaces/${workspaceId}/tasks/${taskId}`, { headers: { origin }, data: { title: current.title, description: current.description, status: current.status, revision: current.revision } })).status()).toBe(200);
  await aAgain.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(aAgain.getByRole("region", { name: "Saved version" })).toBeVisible();
  const sameUserCheck = page.waitForResponse(response => response.url().includes("/api/auth/get-session"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await sameUserCheck;
  await expect(aAgain.getByLabel("Description")).toHaveValue("Draft invalidated by remote logout");
  await expect(aAgain.getByRole("region", { name: "Saved version" })).toBeVisible();
  await expect(aAgain.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await control.bringToFront();
  await control.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(control).toHaveURL(/\/sign-in$/);
  await page.bringToFront();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("form", { name: "Edit task", exact: true })).toHaveCount(0);
  expect((await context.request.get(`/api/workspaces/${workspaceId}/tasks`)).status()).toBe(401);
  expect(staleWrites).toBe(0); expect(prompts).toEqual([]);
});

test("session verification failures pause editing and obsolete verification cannot dispatch a draft", async ({ browser, context, page, testAccounts, testWorkspaces }) => {
  const { a, b, workspaceId, taskId } = await setup(browser, page, testAccounts, testWorkspaces);
  const form = await openTask(page, workspaceId);
  await form.getByLabel("Description").fill("Unconfirmed account A draft");
  let writes = 0;
  page.on("request", request => { if (request.method() === "PATCH" && request.url().includes(`/tasks/${taskId}`)) writes++; });
  await page.route(sessionPath, route => route.fulfill({ status: 503, json: { error: "Fixture verification unavailable" } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Could not verify your session" })).toBeVisible();
  await expect(form).toBeHidden();
  await expect(page.getByText(`Signed in as ${a.email}`, { exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Retry session check" }).click();
  await expect(page.getByRole("heading", { name: "Could not verify your session" })).toBeVisible();
  expect(writes).toBe(0); await expect(page).toHaveURL(/\/projects$/);
  await page.unroute(sessionPath);
  await page.getByRole("button", { name: "Retry session check" }).click();
  await expect(form.getByLabel("Description")).toHaveValue("Unconfirmed account A draft");
  await expect(page.getByLabel("Planning workspace")).toHaveValue(workspaceId);
  const control = await context.newPage(); await control.goto("/sign-in");
  await page.bringToFront();
  await expect(form.getByLabel("Description")).toBeVisible();
  const held = gate(); const waiting = gate(); const settled = gate();
  let first = true;
  await page.route(sessionPath, async route => {
    if (!first) return route.continue();
    first = false; const response = await route.fetch(); waiting.release();
    await held.promise; await fulfillIfActive(route, response); settled.release();
  });
  try {
    await form.getByRole("button", { name: "Save changes", exact: true }).click();
    await waiting.promise;
    await expect(page.getByRole("heading", { name: "Checking your session…", exact: true })).toBeVisible();
    expect(writes).toBe(0);
    await signIn(control, b);
    await expect(page.getByText(`Signed in as ${b.email}`, { exact: true })).toBeVisible();
    held.release(); await settled.promise;
    const bForm = await openTask(page, workspaceId);
    await expect(bForm.getByLabel("Description")).toHaveValue("Saved shared text");
    expect(writes).toBe(0);
    const saved = await (await context.request.get(`/api/workspaces/${workspaceId}/tasks/${taskId}`)).json();
    expect(saved.description).toBe("Saved shared text"); expect(saved.revision).toBe(1);
  } finally { held.release(); }
});

test("an obsolete save completion cannot clear the new account's draft or pending-save lock", async ({ browser, context, page, testAccounts, testWorkspaces }) => {
  const { a, b, workspaceId, taskId } = await setup(browser, page, testAccounts, testWorkspaces);
  const form = await openTask(page, workspaceId);
  const aText = "A save authorized before the account switch";
  const bText = "B draft and pending save";
  await form.getByLabel("Description").fill(aText);
  const heldA = gate(); const waitingA = gate(); const settledA = gate();
  const heldB = gate(); const waitingB = gate();
  let bWrites = 0;
  await page.route(taskPath, async route => {
    if (route.request().method() !== "PATCH") return route.continue();
    const body = route.request().postDataJSON();
    if (body.description === aText) {
      expect(route.request().headers()["x-kanbrik-account"]).toBe(a.id);
      const response = await route.fetch(); expect(response.status()).toBe(200);
      waitingA.release(); await heldA.promise;
      await fulfillIfActive(route, response); settledA.release(); return;
    }
    bWrites++;
    expect(route.request().headers()["x-kanbrik-account"]).toBe(b.id);
    waitingB.release(); await heldB.promise; await route.continue();
  });
  try {
    await form.getByRole("button", { name: "Save changes", exact: true }).click(); await waitingA.promise;
    await expect(form.getByRole("button", { name: "Saving…" })).toBeDisabled();
    const control = await context.newPage(); await signIn(control, b);
    await expect(page.getByText(`Signed in as ${b.email}`, { exact: true })).toBeVisible();
    const bForm = await openTask(page, workspaceId);
    // The A transaction really committed; aborting its UI response never undoes it.
    await expect(bForm.getByLabel("Description")).toHaveValue(aText);
    await bForm.getByLabel("Description").fill(bText);
    await bForm.getByRole("button", { name: "Save changes", exact: true }).click(); await waitingB.promise;
    await expect(bForm.getByRole("button", { name: "Saving…" })).toBeDisabled();
    heldA.release(); await settledA.promise;
    await expect(bForm.getByLabel("Description")).toHaveValue(bText);
    await expect(bForm.getByRole("button", { name: "Saving…" })).toBeDisabled();
    await expect(bForm.getByRole("status")).toHaveCount(0); expect(bWrites).toBe(1);
    heldB.release();
    await expect(bForm.getByRole("status")).toHaveText("Saved.");
    const saved = await (await context.request.get(`/api/workspaces/${workspaceId}/tasks/${taskId}`)).json();
    expect(saved.description).toBe(bText); expect(saved.revision).toBe(3);
  } finally { heldA.release(); heldB.release(); }
});
