import { test, expect } from "./fixtures";
import { randomUUID } from "node:crypto";
import { testDB } from "../database";
const origin = "http://127.0.0.1:3100";
test.setTimeout(90000);

test("board combines workspaces, preserves preferences and moves canonical tasks with explicit controls and dragging", async ({ page, isMobile, testWorkspaces }, testInfo) => {
  const workspaces = await (await page.request.get("/api/workspaces")).json();
  const personal = workspaces.find((item: { kind: string }) => item.kind === "personal");
  const create = async (path: string, data: object) => { const response = await page.request.post(path, { headers: { origin }, data }); expect(response.status()).toBe(201); return response.json(); };
  const shared: { id: string; name: string }[] = [];
  for (const name of ["Board shared one", "Board shared two"]) { const workspace = await create("/api/workspaces", { name }); shared.push(workspace); testWorkspaces.push(workspace.id); }
  const project = await create(`/api/workspaces/${personal.id}/projects`, { title: "Board project context" });
  const parent = await create(`/api/workspaces/${personal.id}/tasks`, { title: "Personal board task", description: "Plain <b>description</b>", projectId: project.id });
  await create(`/api/workspaces/${personal.id}/tasks`, { title: "Child board task", parentId: parent.id, status: "blocked" });
  const dragged = await create(`/api/workspaces/${shared[0].id}/tasks`, { title: "Shared one" });
  await create(`/api/workspaces/${shared[1].id}/tasks`, { title: "Shared two " + "L".repeat(189) });
  await page.goto("/board");
  await expect(page.getByText("Total tasks: 2.", { exact: false })).toBeVisible();
  for (const workspace of shared) await page.getByRole("checkbox", { name: `${workspace.name} (shared)`, exact: true }).check();
  await page.getByRole("button", { name: "Apply selection", exact: true }).click();
  await expect(page.getByText("Total tasks: 4.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (isMobile) await page.getByRole("button", { name: "Blocked (1)", exact: true }).tap();
  await expect(page.getByRole("article", { name: "Child board task", exact: true })).toContainText("Subtask of Personal board task");
  if (isMobile) await page.getByRole("button", { name: "To do (3)", exact: true }).tap();
  const card = page.getByRole("article", { name: "Personal board task", exact: true });
  await expect(card).toContainText("Board project context");
  await card.getByText("Task details", { exact: true }).click();
  await expect(card).toContainText("Plain <b>description</b>");
  const parentStatus = card.getByLabel("Status for Personal board task", { exact: true });
  if (isMobile) await parentStatus.selectOption("in_progress");
  else { await parentStatus.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); }
  await expect(page.getByRole("status").filter({ hasText: "Saved Personal board task" })).toBeVisible();
  await expect(card.getByLabel("Status for Personal board task", { exact: true })).toBeFocused();
  const saved = await (await page.request.get(`/api/workspaces/${personal.id}/tasks/${parent.id}`)).json();
  expect(saved.status).toBe("in_progress"); expect(saved.revision).toBe(2); expect(saved.description).toBe(parent.description); expect(saved.projectId).toBe(project.id);
  if (!isMobile) {
    const handle = page.getByRole("button", { name: "Drag Shared one", exact: true });
    const source = (await handle.boundingBox())!;
    const target = (await page.getByRole("region", { name: "Done column", exact: true }).boundingBox())!;
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2); await page.mouse.down();
    await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2, { steps: 3 });
    await page.mouse.move(target.x + target.width / 2, target.y + 110, { steps: 20 }); await page.mouse.up();
    await expect.poll(async () => (await (await page.request.get(`/api/workspaces/${shared[0].id}/tasks/${dragged.id}`)).json()).status).toBe("done");
    const revision = (await (await page.request.get(`/api/workspaces/${shared[0].id}/tasks/${dragged.id}`)).json()).revision;
    const sameColumn = (await handle.boundingBox())!;
    await page.mouse.move(sameColumn.x + 15, sameColumn.y + 15); await page.mouse.down(); await page.mouse.move(sameColumn.x + 30, sameColumn.y + 30, { steps: 3 }); await page.mouse.up();
    expect((await (await page.request.get(`/api/workspaces/${shared[0].id}/tasks/${dragged.id}`)).json()).revision).toBe(revision);
    await page.mouse.move(sameColumn.x + 15, sameColumn.y + 15); await page.mouse.down(); await page.mouse.move(sameColumn.x - 30, sameColumn.y + 35, { steps: 4 });
    const selectedWorkspace = page.getByRole("checkbox", { name: "Board shared one (shared)", exact: true });
    await selectedWorkspace.focus(); await page.keyboard.press("Space"); await page.mouse.up();
    await expect(page.getByText("Unsaved selection.", { exact: false })).toBeVisible();
    expect((await (await page.request.get(`/api/workspaces/${shared[0].id}/tasks/${dragged.id}`)).json()).revision).toBe(revision);
    await selectedWorkspace.check();
    await page.mouse.move(sameColumn.x + 15, sameColumn.y + 15); await page.mouse.down(); await page.mouse.move(sameColumn.x - 50, sameColumn.y + 40, { steps: 4 }); await page.keyboard.press("Escape"); await page.mouse.up();
    expect((await (await page.request.get(`/api/workspaces/${shared[0].id}/tasks/${dragged.id}`)).json()).revision).toBe(revision);
  }
  await page.reload(); await expect(page.getByText("Total tasks: 4.", { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("board.png"), fullPage: true });
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await page.getByRole("button", { name: "Apply selection", exact: true }).click();
  await expect(page.getByText("No workspaces selected.", { exact: false })).toBeVisible();
  await page.reload(); await expect(page.getByText("No workspaces selected.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("board reports conflicts, failed moves and incomplete loads while preserving Projects drafts", async ({ page, isMobile, testWorkspaces }) => {
  const personal = (await (await page.request.get("/api/workspaces")).json()).find((item: { kind: string }) => item.kind === "personal");
  const task = await (await page.request.post(`/api/workspaces/${personal.id}/tasks`, { headers: { origin }, data: { title: "Conflict board task", description: "Saved description" } })).json();
  await page.getByLabel("Planning workspace").selectOption(personal.id);
  await page.getByRole("button", { name: "Edit task: Conflict board task", exact: true }).click();
  const edit = page.getByRole("form", { name: "Edit task", exact: true });
  await edit.getByLabel("Description").fill("Retained Projects draft");
  await page.getByRole("navigation").getByRole("link", { name: "Board", exact: true }).click();
  const status = page.getByLabel("Status for Conflict board task", { exact: true });
  await expect(status).toBeVisible();
  expect((await page.request.patch(`/api/workspaces/${personal.id}/tasks/${task.id}`, { headers: { origin }, data: { title: task.title, description: "Newer server text", status: "todo", revision: 1 } })).status()).toBe(200);
  await status.selectOption("done");
  await expect(page.getByRole("alert").filter({ hasText: "Move conflicted" })).toContainText("Newer server text");
  await expect(status).toBeDisabled();
  await page.getByRole("button", { name: "Review saved version", exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let moves = 0;
  await page.route("**/tasks/*/status", async route => { moves++; await gate; await route.fulfill({ status: 503, json: { error: "Fixture failure" } }); });
  await status.selectOption("done"); await expect(status).toBeDisabled(); await expect.poll(() => moves).toBe(1); release();
  await expect(page.getByRole("alert").filter({ hasText: "Move not confirmed" })).toBeVisible();
  await page.unroute("**/tasks/*/status");
  await page.getByRole("button", { name: "Allow retry", exact: true }).click();
  await status.selectOption("done");
  await expect(page.getByRole("status").filter({ hasText: "Saved Conflict board task" })).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: "Edit task: Conflict board task", exact: true }).click();
  await expect(edit.getByLabel("Description")).toHaveValue("Retained Projects draft");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit.getByRole("region", { name: "Saved version" })).toBeVisible();
  await edit.getByRole("button", { name: "Load saved version", exact: true }).click();
  const shared = await (await page.request.post("/api/workspaces", { headers: { origin }, data: { name: "Incomplete workspace" } })).json(); testWorkspaces.push(shared.id);
  await page.getByRole("navigation").getByRole("link", { name: "Board", exact: true }).click();
  await page.getByRole("button", { name: "Refresh board", exact: true }).click();
  await page.getByRole("checkbox", { name: "Incomplete workspace (shared)", exact: true }).check();
  await page.route(`**/api/workspaces/${shared.id}/tasks`, route => route.fulfill({ status: 503, json: { error: "Fixture unavailable" } }));
  await page.getByRole("button", { name: "Apply selection", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Board incomplete" })).toBeVisible();
  await expect(page.getByText("Loaded tasks: 1.", { exact: false })).toBeVisible();
  if (isMobile) await page.getByRole("button", { name: "Done (1)", exact: true }).click();
  await expect(page.getByRole("article", { name: "Conflict board task", exact: true })).toBeVisible();
});

test("board ignores a delayed renewal probe after account switch and keeps the new account's pending move isolated", async ({ browser, context, page, testAccounts, testWorkspaces }) => {
  await context.addInitScript(() => { window.addEventListener = new Proxy(window.addEventListener, { apply(target, receiver, args) { if (args[0] === "storage") return; return Reflect.apply(target, receiver, args); } }); });
  const a = (await (await page.request.get("/api/auth/get-session")).json()).user;
  const owner = await browser.newContext({ baseURL: origin, storageState: await context.storageState() });
  const provision = await browser.newContext({ baseURL: origin });
  const email = `${randomUUID()}@example.invalid`; const password = randomUUID() + randomUUID(); testAccounts.push(email);
  try {
    const signup = await provision.request.post("/api/auth/sign-up/email", { headers: { origin }, data: { email, password, name: "Board editor" } });
    expect(signup.status()).toBe(200);
    const b = (await signup.json()).user;
    const shared = await (await page.request.post("/api/workspaces", { headers: { origin }, data: { name: "Session board shared" } })).json(); testWorkspaces.push(shared.id);
    await page.request.post(`/api/workspaces/${shared.id}/members`, { headers: { origin }, data: { email } });
    const task = await (await page.request.post(`/api/workspaces/${shared.id}/tasks`, { headers: { origin }, data: { title: "Session board task" } })).json();
    await page.goto("/board");
    await page.getByRole("checkbox", { name: "Session board shared (shared)", exact: true }).check();
    await page.getByRole("button", { name: "Apply selection", exact: true }).click();
    const status = page.getByLabel("Status for Session board task", { exact: true });
    await expect(status).toBeVisible();
    const control = await context.newPage(); await control.goto("/sign-in"); await page.bringToFront(); await expect(status).toBeVisible();
    await testDB.session.updateMany({ where: { userId: a.id }, data: { expiresAt: new Date(Date.now() + 3600000) } });
    let releaseA!: () => void, readyA!: () => void, settledA!: () => void;
    const heldA = new Promise<void>(resolve => { releaseA = resolve; }); const waitingA = new Promise<void>(resolve => { readyA = resolve; }); const doneA = new Promise<void>(resolve => { settledA = resolve; });
    let first = true; let cookieHeader = false;
    await page.route("**/api/planner-session", async route => {
      if (!first) return route.continue(); first = false;
      const response = await route.fetch(); cookieHeader = response.headers()["set-cookie"] !== undefined; readyA(); await heldA; await route.fulfill({ response }).catch(() => {}); settledA();
    });
    let releaseB!: () => void, readyB!: () => void;
    const heldB = new Promise<void>(resolve => { releaseB = resolve; }); const waitingB = new Promise<void>(resolve => { readyB = resolve; });
    let oldMoves = 0;
    await page.route("**/tasks/*/status", async route => {
      if (route.request().headers()["x-kanbrik-account"] === a.id) { oldMoves++; return route.continue(); }
      readyB(); await heldB; await route.continue();
    });
    try {
      await status.selectOption("done"); await waitingA;
      await control.getByLabel("Email", { exact: true }).fill(email); await control.getByLabel("Password", { exact: true }).fill(password);
      await control.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(control.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
      await page.getByRole("navigation").getByRole("link", { name: "Board", exact: true }).click();
      await expect(page.getByRole("checkbox", { name: "Session board shared (shared)", exact: true })).not.toBeChecked();
      await page.getByRole("checkbox", { name: "Session board shared (shared)", exact: true }).check();
      await page.getByRole("button", { name: "Apply selection", exact: true }).click();
      await expect(status).toHaveValue("todo"); await status.selectOption("in_progress"); await waitingB;
      releaseA(); await doneA;
      await expect(status).toBeDisabled(); expect(oldMoves).toBe(0); expect(cookieHeader).toBe(false);
      expect((await (await context.request.get("/api/auth/get-session")).json()).user.id).toBe(b.id);
      releaseB(); await expect(page.getByRole("status").filter({ hasText: "Saved Session board task" })).toBeVisible();
      expect((await (await page.request.get(`/api/workspaces/${shared.id}/tasks/${task.id}`)).json()).revision).toBe(2);
      const roster = await (await owner.request.get(`/api/workspaces/${shared.id}`)).json();
      const member = roster.members.find((item: { email: string }) => item.email === email);
      expect((await owner.request.delete(`/api/workspaces/${shared.id}/members/${member.id}`, { headers: { origin }, data: {} })).status()).toBe(200);
      await page.getByRole("button", { name: "Refresh board", exact: true }).click();
      await expect(page.getByRole("checkbox", { name: "Session board shared (shared)", exact: true })).toHaveCount(0);
      await expect(page.getByRole("article", { name: "Session board task", exact: true })).toHaveCount(0);
    } finally { releaseA(); releaseB(); }
  } finally { await owner.close(); await provision.close(); }
});
