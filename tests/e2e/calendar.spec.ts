import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { BlockRecord } from "../../src/lib/calendar-contracts";
const origin = "http://127.0.0.1:3100";
const range = "?start=2030-06-01T00%3A00Z&end=2030-06-10T00%3A00Z";
test.setTimeout(60000);
const createForm = (page: Page) => page.getByRole("form", { name: "Create time block", exact: true });
async function post(page: Page, path: string, data: object) { const response = await page.request.post(path, { headers: { origin }, data }); expect(response.status()).toBe(201); return response.json(); }
async function open(page: Page) {
  await page.goto("/calendar");
  await page.getByLabel("Display time zone", { exact: true }).fill("Invalid/zone");
  await expect(page.getByRole("button", { name: "Apply calendar preferences", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Today", exact: true })).toHaveCount(0);
  await page.getByLabel("Display time zone", { exact: true }).fill("UTC");
  await page.getByRole("button", { name: "Apply calendar preferences", exact: true }).click();
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await expect(createForm(page)).toBeVisible();
}
async function events(page: Page, workspaceId: string): Promise<BlockRecord[]> { return (await page.request.get(`/api/workspaces/${workspaceId}/time-blocks${range}`)).json(); }
async function provisionBlock(page: Page, workspaceId: string, label = "Time block") {
  return post(page, `/api/workspaces/${workspaceId}/time-blocks`, { requestKey: randomUUID(), label, schedule: { startAt: "2030-06-03T12:00Z", endAt: "2030-06-03T15:00Z", timeZone: "UTC" }, assignment: { projectId: null, taskId: null } });
}
async function drag(page: Page, source: { x: number; y: number }, target: { x: number; y: number }) {
  await page.mouse.move(source.x, source.y); await page.mouse.down(); await page.mouse.move(source.x + 12, source.y, { steps: 3 }); await page.mouse.move(target.x, target.y, { steps: 24 }); await page.mouse.up();
}

test("calendar combines workspaces and creates, assigns, edits, unassigns and removes canonical blocks", async ({ page, isMobile, testWorkspaces }, testInfo) => {
  const personal = (await (await page.request.get("/api/workspaces")).json()).find((w: { kind: string }) => w.kind === "personal");
  const shared = [];
  for (const name of ["Calendar shared one", "Calendar shared two"]) { const ws = await post(page, "/api/workspaces", { name }); shared.push(ws); testWorkspaces.push(ws.id); }
  const project = await post(page, `/api/workspaces/${personal.id}/projects`, { title: "Calendar project" });
  const parent = await post(page, `/api/workspaces/${personal.id}/tasks`, { title: "Calendar parent", projectId: project.id, status: "done" });
  const child = await post(page, `/api/workspaces/${personal.id}/tasks`, { title: "Calendar subtask", parentId: parent.id });
  await open(page);
  for (const ws of shared) await page.getByRole("checkbox", { name: `${ws.name} (shared)`, exact: true }).check();
  await page.getByRole("button", { name: "Apply calendar preferences", exact: true }).click();
  await createForm(page).getByRole("button", { name: "Create block", exact: true }).click();
  await expect(page.getByText("Total blocks in range: 1.", { exact: false })).toBeVisible();
  const original = (await events(page, personal.id))[0]; expect(Date.parse(original.endAt) - Date.parse(original.startAt)).toBe(10800000); expect(original.taskId).toBeNull(); expect(original.projectId).toBeNull();
  if (!isMobile) {
    const grid = page.locator(".fc"); await grid.scrollIntoViewIfNeeded();
    const source = (await page.getByRole("button", { name: "Drag project: Calendar project", exact: true }).boundingBox())!;
    const target = (await grid.locator(`[data-block-id="${original.id}"]`).boundingBox())!;
    await drag(page, { x: source.x + 20, y: source.y + 20 }, { x: target.x + target.width / 2, y: target.y + 20 });
    await expect.poll(async () => (await events(page, personal.id))[0].projectId).toBe(project.id);
    expect(await events(page, personal.id)).toHaveLength(1);
    const assigned = (await events(page, personal.id))[0]; expect(assigned.id).toBe(original.id); expect(assigned.startAt).toBe(original.startAt); expect(assigned.endAt).toBe(original.endAt);
    const before = assigned.revision;
    await grid.scrollIntoViewIfNeeded();
    const occupiedTarget = (await grid.locator(`[data-block-id="${original.id}"]`).boundingBox())!;
    const task = (await page.getByRole("button", { name: "Drag task: Calendar parent", exact: true }).boundingBox())!;
    await drag(page, { x: task.x + 15, y: task.y + 15 }, { x: occupiedTarget.x + occupiedTarget.width / 2, y: occupiedTarget.y + 20 });
    await expect(page.getByRole("status").filter({ hasText: "No assignment saved" })).toBeVisible(); expect((await events(page, personal.id))[0].revision).toBe(before);
    const foreignBlock = await provisionBlock(page, shared[0].id, "Foreign empty block");
    await page.getByRole("button", { name: "Refresh calendar", exact: true }).click();
    await expect(page.getByText("Total blocks in range: 2.", { exact: false })).toBeVisible(); await grid.scrollIntoViewIfNeeded();
    const wrong = (await grid.locator(`[data-block-id="${foreignBlock.id}"]`).boundingBox())!;
    const again = (await page.getByRole("button", { name: "Drag project: Calendar project", exact: true }).boundingBox())!;
    await drag(page, { x: again.x + 15, y: again.y + 15 }, { x: wrong.x + wrong.width / 2, y: wrong.y + 20 });
    await expect(page.getByRole("status").filter({ hasText: "No assignment saved" })).toBeVisible(); expect((await events(page, shared[0].id))[0]).toEqual(foreignBlock);
    expect((await page.request.delete(`/api/workspaces/${shared[0].id}/time-blocks/${foreignBlock.id}`, { headers: { origin }, data: { revision: 1 } })).status()).toBe(200);
    // dnd-kit briefly suppresses click events after a pointer drop. Use a real
    // deliberate keyboard activation, whose keyup occurs after that cleanup.
    await page.getByRole("button", { name: "Refresh calendar", exact: true }).focus(); await page.keyboard.press("Space", { delay: 75 });
    await expect(page.getByText("Total blocks in range: 1.", { exact: false })).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Edit block: Time block", exact: true }).tap();
    const edit = page.getByRole("form", { name: "Edit time block Time block", exact: true });
    await edit.getByLabel("Assigned work", { exact: true }).selectOption(`project:${project.id}`);
    await edit.getByRole("button", { name: "Save block", exact: true }).tap();
    await expect(edit.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  }
  await createForm(page).getByLabel("Block label", { exact: true }).fill("Subtask schedule");
  const assignedWork = createForm(page).getByLabel("Assigned work", { exact: true });
  if (isMobile) await assignedWork.selectOption(`task:${child.id}`);
  else { await assignedWork.focus(); await page.keyboard.press("End"); await page.keyboard.press("Enter"); }
  await expect(assignedWork).toHaveValue(`task:${child.id}`);
  await createForm(page).getByRole("button", { name: "Create block", exact: true }).click();
  await expect(page.getByText("Total blocks in range: 2.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Edit block: Time block", exact: true }).click();
  const edit = page.getByRole("form", { name: "Edit time block Time block", exact: true });
  await edit.getByLabel("Assigned work", { exact: true }).selectOption("");
  await edit.getByLabel("End time", { exact: true }).fill("2030-06-04T15:00");
  const longLabel = "Long schedule " + "L".repeat(180);
  await edit.getByLabel("Block label", { exact: true }).fill(longLabel);
  await edit.getByRole("button", { name: "Save block", exact: true }).click();
  const renamed = page.getByRole("form", { name: `Edit time block ${longLabel}`, exact: true });
  await expect(renamed.getByLabel("Assigned work", { exact: true })).toHaveValue("");
  const saved = (await events(page, personal.id)).find(e => e.id === original.id)!; expect((Date.parse(saved.endAt) - Date.parse(saved.startAt)) / 3600000).toBe(27);
  await page.getByLabel("Display time zone", { exact: true }).fill("Asia/Tokyo");
  await page.getByRole("button", { name: "Apply calendar preferences", exact: true }).click();
  await expect(createForm(page)).toBeVisible();
  expect((await events(page, personal.id)).find(e => e.id === original.id)).toEqual(saved);
  await page.screenshot({ path: testInfo.outputPath("calendar.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: `Edit block: ${longLabel}`, exact: true }).click();
  await renamed.getByRole("button", { name: "Remove block", exact: true }).click();
  expect(await events(page, personal.id)).toHaveLength(2);
  await renamed.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Block removed. Referenced work is unchanged." })).toBeVisible();
  await expect(page.getByRole("button", { name: `Edit block: ${longLabel}`, exact: true })).toHaveCount(0);
  expect(await events(page, personal.id)).toHaveLength(1);
  const canonical = await (await page.request.get(`/api/workspaces/${personal.id}/tasks/${parent.id}`)).json(); expect(canonical).toMatchObject({ status: "done", revision: 1, projectId: project.id });
  expect((await page.request.get(`/api/workspaces/${personal.id}/tasks/${child.id}`)).status()).toBe(200);
  await page.getByRole("button", { name: "Clear calendar selection", exact: true }).click(); await page.getByRole("button", { name: "Apply calendar preferences", exact: true }).click();
  await expect(page.getByText("No calendar workspaces selected.", { exact: false })).toBeVisible();
  await page.reload(); await expect(page.getByText("No calendar workspaces selected.", { exact: false })).toBeVisible(); expect(await page.getByLabel("Display time zone", { exact: true }).inputValue()).toBe("Asia/Tokyo");
});

test("calendar retains uncertain create/delete intents and dirty drafts through navigation, refresh and conflicts", async ({ page }) => {
  const personal = (await (await page.request.get("/api/workspaces")).json()).find((w: { kind: string }) => w.kind === "personal");
  await open(page);
  let creates = 0;
  await page.route(`**/api/workspaces/${personal.id}/time-blocks`, async route => {
    if (route.request().method() !== "POST") return route.continue(); creates++; await route.fetch(); await route.fulfill({ status: 503, json: { error: "Fixture uncertain response" } });
  });
  await createForm(page).getByRole("button", { name: "Create block", exact: true }).click();
  await expect(createForm(page).getByRole("alert")).toContainText("Fixture uncertain"); expect(await events(page, personal.id)).toHaveLength(1);
  await page.getByRole("navigation").getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Calendar", exact: true }).click();
  await expect(createForm(page).getByLabel("Block label", { exact: true })).toBeDisabled();
  await page.unroute(`**/api/workspaces/${personal.id}/time-blocks`);
  await createForm(page).getByRole("button", { name: "Create block", exact: true }).click();
  await expect(createForm(page).getByRole("status").filter({ hasText: "Saved." })).toBeVisible(); expect(await events(page, personal.id)).toHaveLength(1); expect(creates).toBe(1);
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByRole("button", { name: "Edit block: Time block", exact: true }).click();
  let edit = page.getByRole("form", { name: "Edit time block Time block", exact: true });
  await edit.getByLabel("Block label", { exact: true }).fill("Retained calendar draft");
  await page.getByRole("navigation").getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Calendar", exact: true }).click();
  await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  await page.getByLabel("Display time zone", { exact: true }).fill("America/Los_Angeles"); await page.getByRole("button", { name: "Apply calendar preferences", exact: true }).click();
  await page.getByRole("button", { name: "Edit block: Time block", exact: true }).click();
  await expect(edit.getByLabel("Block label", { exact: true })).toHaveValue("Retained calendar draft"); await expect(edit.getByLabel("Editing time zone", { exact: true })).toHaveValue("UTC");
  await page.getByRole("button", { name: "Refresh calendar", exact: true }).click();
  await expect(edit.getByLabel("Block label", { exact: true })).toHaveValue("Retained calendar draft");
  const block = (await events(page, personal.id))[0];
  expect((await page.request.patch(`/api/workspaces/${personal.id}/time-blocks/${block.id}`, { headers: { origin }, data: { revision: block.revision, changes: { label: "New server block" } } })).status()).toBe(200);
  await edit.getByRole("button", { name: "Save block", exact: true }).click();
  await expect(edit.getByRole("region", { name: "Saved block version", exact: true })).toContainText("New server block"); await expect(edit.getByRole("button", { name: "Save block", exact: true })).toBeDisabled();
  await edit.getByRole("button", { name: "Reviewed: keep proposed input", exact: true }).click(); await edit.getByRole("button", { name: "Save block", exact: true }).click();
  edit = page.getByRole("form", { name: "Edit time block Retained calendar draft", exact: true }); await expect(edit.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.route(`**/time-blocks/${block.id}`, async route => { if (route.request().method() !== "DELETE") return route.continue(); await route.fetch(); await route.fulfill({ status: 503, json: { error: "Fixture uncertain delete" } }); });
  await edit.getByRole("button", { name: "Remove block", exact: true }).click(); await edit.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(edit.getByRole("alert").filter({ hasText: "Fixture uncertain delete" })).toBeVisible();
  await page.unroute(`**/time-blocks/${block.id}`);
  await page.getByRole("navigation").getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "Review draft: Retained calendar draft", exact: true }).click();
  // The saved block is already absent, but its original removal intent remains
  // reviewable outside the range and can be reconciled without recreating it.
  edit = page.getByRole("form", { name: "Edit time block Retained calendar draft", exact: true });
  await edit.getByRole("button", { name: "Confirm removal", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Block removed. Referenced work is unchanged." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit block: Retained calendar draft", exact: true })).toHaveCount(0); expect(await events(page, personal.id)).toHaveLength(0);
});

test("calendar reports incomplete scopes/pickers and ignores obsolete range loads and save completions", async ({ page, testWorkspaces }) => {
  const personal = (await (await page.request.get("/api/workspaces")).json()).find((w: { kind: string }) => w.kind === "personal");
  const shared = await post(page, "/api/workspaces", { name: "Calendar incomplete" }); testWorkspaces.push(shared.id);
  const block = await provisionBlock(page, personal.id); await provisionBlock(page, shared.id, "Shared block");
  await open(page);
  await page.getByRole("checkbox", { name: "Calendar incomplete (shared)", exact: true }).check(); await page.getByRole("button", { name: "Apply calendar preferences", exact: true }).click();
  await expect(page.getByText("Total blocks in range: 2.", { exact: false })).toBeVisible();
  await page.route(`**/api/workspaces/${shared.id}/tasks`, route => route.fulfill({ status: 503, json: { error: "Fixture picker" } }));
  await page.getByRole("button", { name: "Refresh calendar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Work picker incomplete" })).toBeVisible();
  await page.getByLabel("Destination workspace", { exact: true }).selectOption(shared.id); await expect(createForm(page).getByRole("button", { name: "Create block", exact: true })).toBeDisabled();
  await page.route(`**/api/workspaces/${shared.id}/time-blocks?*`, route => route.fulfill({ status: 503, json: { error: "Fixture range" } }));
  await page.getByRole("button", { name: "Refresh calendar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Calendar incomplete" })).toBeVisible(); await expect(page.getByText("Loaded blocks in range: 1.", { exact: false })).toBeVisible();
  await page.unroute(`**/api/workspaces/${shared.id}/time-blocks?*`); await page.unroute(`**/api/workspaces/${shared.id}/tasks`);
  let release!: () => void, ready!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }); const waiting = new Promise<void>(resolve => { ready = resolve; });
  await page.route(`**/time-blocks/${block.id}`, async route => { ready(); await held; await route.continue().catch(() => {}); });
  try {
    await page.getByRole("button", { name: "Edit block: Time block", exact: true }).click(); const edit = page.getByRole("form", { name: "Edit time block Time block", exact: true });
    await edit.getByLabel("Block label", { exact: true }).fill("Late saved block"); await edit.getByRole("button", { name: "Save block", exact: true }).click(); await waiting;
    await page.getByLabel("Date", { exact: true }).fill("2030-07-01"); await expect(page.getByText("Total blocks in range: 0.", { exact: false })).toBeVisible();
    release(); await expect.poll(async () => (await events(page, personal.id)).find(e => e.id === block.id)?.label).toBe("Late saved block");
    await expect(page.getByRole("button", { name: "Edit block: Late saved block", exact: true })).toHaveCount(0);
    // Hold an old range read, change range again and release: old events cannot return.
    let oldReady!: () => void, oldRelease!: () => void;
    const oldWaiting = new Promise<void>(resolve => { oldReady = resolve; }); const oldHeld = new Promise<void>(resolve => { oldRelease = resolve; });
    let first = true;
    await page.route(`**/api/workspaces/${personal.id}/time-blocks?*`, async route => { if (!first) return route.continue(); first = false; const response = await route.fetch(); oldReady(); await oldHeld; await route.fulfill({ response }).catch(() => {}); });
    try { await page.getByLabel("Date", { exact: true }).fill("2030-06-03"); await oldWaiting; await page.getByLabel("Date", { exact: true }).fill("2030-07-02"); oldRelease(); await expect(page.getByText("Total blocks in range: 0.", { exact: false })).toBeVisible(); await expect(page.getByRole("button", { name: "Edit block: Late saved block", exact: true })).toHaveCount(0); }
    finally { oldRelease(); }
  } finally { release(); }
});

test("calendar explicitly rejects gaps and requires both fall-back occurrence choices", async ({ page }) => {
  await open(page);
  const form = createForm(page);
  await form.getByLabel("Editing time zone", { exact: true }).fill("America/Los_Angeles");
  await form.getByLabel("Start time", { exact: true }).fill("2026-03-08T02:30"); await form.getByLabel("End time", { exact: true }).fill("2026-03-08T04:00");
  await expect(form.getByRole("alert").filter({ hasText: "Invalid or nonexistent" })).toBeVisible();
  await form.getByRole("button", { name: "Create block", exact: true }).click(); await expect(form.getByRole("alert").filter({ hasText: "gaps cannot be saved" })).toBeVisible();
  await form.getByLabel("Start time", { exact: true }).fill("2026-11-01T01:15"); await form.getByLabel("End time", { exact: true }).fill("2026-11-01T01:45");
  const start = form.getByLabel("Start occurrence (repeated local time)", { exact: true }); const end = form.getByLabel("End occurrence (repeated local time)", { exact: true });
  await expect(start).toHaveValue(""); await expect(end).toHaveValue("");
  await start.selectOption({ label: "1: UTC-07:00" }); await end.selectOption({ label: "2: UTC-08:00" }); await expect(form.getByText("Actual elapsed hours: 1.5", { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Create block", exact: true }).click(); await expect(form.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
});

test("calendar isolates pending saves across cookie account switches, failed checks, revocation and logout", async ({ browser, context, page, testAccounts, testWorkspaces }) => {
  await context.addInitScript(() => { window.addEventListener = new Proxy(window.addEventListener, { apply(target, receiver, args) { if (args[0] === "storage") return; return Reflect.apply(target, receiver, args); } }); });
  const a = (await (await page.request.get("/api/auth/get-session")).json()).user;
  const owner = await browser.newContext({ baseURL: origin, storageState: await context.storageState() });
  const provisioning = await browser.newContext({ baseURL: origin });
  const email = `${randomUUID()}@example.invalid`; const password = randomUUID() + randomUUID(); testAccounts.push(email);
  const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
  const heldA = gate(), readyA = gate(), doneA = gate(), heldB = gate(), readyB = gate();
  try {
    const signup = await provisioning.request.post("/api/auth/sign-up/email", { headers: { origin }, data: { email, password, name: "Calendar editor" } }); expect(signup.status()).toBe(200); const b = (await signup.json()).user;
    const shared = await post(page, "/api/workspaces", { name: "Session calendar" }); testWorkspaces.push(shared.id);
    await page.request.post(`/api/workspaces/${shared.id}/members`, { headers: { origin }, data: { email } });
    const block = await provisionBlock(page, shared.id, "Session block");
    await open(page); await page.getByRole("checkbox", { name: "Session calendar (shared)", exact: true }).check(); await page.getByRole("button", { name: "Apply calendar preferences", exact: true }).click();
    await page.getByRole("button", { name: "Edit block: Session block", exact: true }).click();
    const edit = page.getByRole("form", { name: "Edit time block Session block", exact: true }); await edit.getByLabel("Block label", { exact: true }).fill("A obsolete block draft");
    const control = await context.newPage(); await control.goto("/sign-in"); await page.bringToFront();
    const { testDB } = await import("../database"); await testDB.session.updateMany({ where: { userId: a.id }, data: { expiresAt: new Date(Date.now() + 3600000) } });
    let first = true, cookieHeader = false, oldWrites = 0;
    await page.route("**/api/planner-session", async route => { if (!first) return route.continue(); first = false; const response = await route.fetch(); cookieHeader = response.headers()["set-cookie"] !== undefined; readyA.release(); await heldA.promise; await route.fulfill({ response }).catch(() => {}); doneA.release(); });
    await page.route(`**/time-blocks/${block.id}`, async route => { if (route.request().headers()["x-kanbrik-account"] === a.id) { oldWrites++; return route.continue(); } readyB.release(); await heldB.promise; await route.continue().catch(() => {}); });
    await edit.getByRole("button", { name: "Save block", exact: true }).click(); await readyA.promise;
    await control.getByLabel("Email", { exact: true }).fill(email); await control.getByLabel("Password", { exact: true }).fill(password); await control.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(control.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
    await open(page); await expect(page.getByRole("checkbox", { name: "Session calendar (shared)", exact: true })).not.toBeChecked();
    await page.getByRole("checkbox", { name: "Session calendar (shared)", exact: true }).check(); await page.getByRole("button", { name: "Apply calendar preferences", exact: true }).click();
    await page.getByRole("button", { name: "Edit block: Session block", exact: true }).click(); await expect(edit.getByLabel("Block label", { exact: true })).toHaveValue("Session block");
    await edit.getByLabel("Block label", { exact: true }).fill("B pending block"); await edit.getByRole("button", { name: "Save block", exact: true }).click(); await readyB.promise;
    heldA.release(); await doneA.promise; await expect(edit.getByLabel("Block label", { exact: true })).toBeDisabled(); expect(oldWrites).toBe(0); expect(cookieHeader).toBe(false); expect((await (await context.request.get("/api/auth/get-session")).json()).user.id).toBe(b.id);
    heldB.release(); const savedEdit = page.getByRole("form", { name: "Edit time block B pending block", exact: true }); await expect(savedEdit.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await savedEdit.getByLabel("Block label", { exact: true }).fill("Draft retained after failed check");
    await page.route("**/api/planner-session", route => route.fulfill({ status: 503, json: { error: "Fixture identity failure" } }));
    await savedEdit.getByRole("button", { name: "Save block", exact: true }).click(); await expect(page.getByRole("heading", { name: "Could not verify your session", exact: true })).toBeVisible();
    await page.unroute("**/api/planner-session"); await page.getByRole("button", { name: "Retry session check", exact: true }).click();
    await expect(savedEdit.getByLabel("Block label", { exact: true })).toHaveValue("Draft retained after failed check");
    const roster = await (await owner.request.get(`/api/workspaces/${shared.id}`)).json(); const member = roster.members.find((m: { email: string }) => m.email === email);
    expect((await owner.request.delete(`/api/workspaces/${shared.id}/members/${member.id}`, { headers: { origin }, data: {} })).status()).toBe(200);
    await page.getByRole("button", { name: "Refresh calendar", exact: true }).click(); await expect(page.getByRole("checkbox", { name: "Session calendar (shared)", exact: true })).toHaveCount(0); await expect(savedEdit).toHaveCount(0);
    // Same-cookie logout while a new block is pending: its completion belongs to
    // B's old document and cannot revive protected data or an account draft.
    await createForm(page).getByLabel("Block label", { exact: true }).fill("Logout pending calendar draft");
    const logoutHeld = gate(), logoutReady = gate();
    await page.route("**/api/workspaces/*/time-blocks", async route => { if (route.request().method() !== "POST") return route.continue(); const response = await route.fetch(); logoutReady.release(); await logoutHeld.promise; await route.fulfill({ response }).catch(() => {}); });
    try {
      await createForm(page).getByRole("button", { name: "Create block", exact: true }).click(); await logoutReady.promise;
      await control.goto("/projects"); await control.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(control).toHaveURL(/\/sign-in$/);
      await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await expect(page).toHaveURL(/\/sign-in$/); logoutHeld.release();
      await expect(page.getByLabel("Block label", { exact: true })).toHaveCount(0); expect((await (await context.request.get("/api/auth/get-session")).json())?.user).toBeUndefined();
    } finally { logoutHeld.release(); }
  } finally { heldA.release(); heldB.release(); await owner.close(); await provisioning.close(); }
});

test("calendar pointer move/resize persist duration while no-op, canceled and touch gestures do not save", async ({ page, isMobile }) => {
  const personal = (await (await page.request.get("/api/workspaces")).json()).find((w: { kind: string }) => w.kind === "personal");
  const block = await provisionBlock(page, personal.id, "Pointer schedule");
  await open(page);
  if (isMobile) {
    await expect(page.getByLabel("View", { exact: true })).toHaveValue("day");
    const agendaLabel = page.locator(`[data-block-id="${block.id}"]:visible`);
    await agendaLabel.scrollIntoViewIfNeeded(); const agendaBox = (await agendaLabel.boundingBox())!;
    const touchX = agendaBox.x + agendaBox.width / 2, touchY = agendaBox.y + agendaBox.height / 2;
    const touch = await page.context().newCDPSession(page);
    // Chromium synthesizes a real touch scroll with controlled velocity and no
    // fling, so the following tap is a navigation action, not a fling stop.
    await touch.send("Input.synthesizeScrollGesture", { x: touchX, y: touchY, yDistance: -200, speed: 500, gestureSourceType: "touch", preventFling: true });
    await touch.detach();
    expect((await events(page, personal.id))[0].revision).toBe(1);
    await page.getByRole("button", { name: "Next", exact: true }).tap();
    await expect(page.getByText("Total blocks in range: 0.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Previous", exact: true }).tap(); await expect(page.getByRole("button", { name: "Edit block: Pointer schedule", exact: true })).toBeVisible();
    return;
  }
  const grid = page.locator(".fc"); await grid.scrollIntoViewIfNeeded();
  const event = grid.locator(".fc-timegrid-event").filter({ has: page.locator(`[data-block-id="${block.id}"]`) });
  const slot = (await grid.locator('.fc-timegrid-slot-lane[data-time="12:00:00"]').boundingBox())!;
  let box = (await event.boundingBox())!;
  let point = { x: box.x + box.width / 2, y: box.y + 20 };
  await drag(page, point, { x: point.x, y: point.y + slot.height * 2 });
  await expect.poll(async () => (await events(page, personal.id))[0].revision).toBe(2);
  let saved = (await events(page, personal.id))[0]; expect(Date.parse(saved.endAt) - Date.parse(saved.startAt)).toBe(10800000); expect(Date.parse(saved.startAt) - Date.parse(block.startAt)).toBe(3600000);
  await expect(page.getByRole("status").filter({ hasText: "Saved calendar change." })).toBeVisible();
  await expect(event).toBeVisible(); await grid.scrollIntoViewIfNeeded(); await event.hover();
  await expect(event.locator(".fc-event-resizer-end")).toBeVisible();
  const resize = (await event.locator(".fc-event-resizer-end").boundingBox())!;
  await drag(page, { x: resize.x + resize.width / 2, y: resize.y + resize.height / 2 }, { x: resize.x + resize.width / 2, y: resize.y + resize.height / 2 + slot.height * 2 });
  await expect.poll(async () => (await events(page, personal.id))[0].revision).toBe(3);
  await expect(event).toHaveClass(/fc-event-draggable/);
  saved = (await events(page, personal.id))[0]; expect(Date.parse(saved.endAt) - Date.parse(saved.startAt)).toBe(14400000);
  await grid.scrollIntoViewIfNeeded(); box = (await event.boundingBox())!; point = { x: box.x + box.width / 2, y: box.y + 20 };
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 12, point.y, { steps: 3 }); await page.mouse.move(point.x, point.y); await page.mouse.up();
  expect((await events(page, personal.id))[0].revision).toBe(3);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 12, point.y, { steps: 3 }); await page.mouse.move(point.x, point.y + slot.height * 2, { steps: 5 }); await page.keyboard.press("Escape"); await page.mouse.up();
  expect((await events(page, personal.id))[0].revision).toBe(3);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 12, point.y, { steps: 3 }); await page.mouse.move(point.x, point.y + slot.height * 2, { steps: 5 });
  await page.getByRole("checkbox", { name: "Personal workspace (personal)", exact: true }).focus(); await page.keyboard.press("Space"); await page.mouse.up();
  expect((await events(page, personal.id))[0].revision).toBe(3);
  await page.reload(); await page.getByLabel("Date", { exact: true }).fill("2030-06-03");
  expect((await events(page, personal.id))[0]).toEqual(saved);
});
