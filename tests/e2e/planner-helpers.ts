import { expect, type Page } from "@playwright/test";
export const origin = "http://127.0.0.1:3100";
export async function post(page: Page, path: string, data: object) {
  const r = await page.request.post(path, { headers: { origin }, data });
  expect(r.status()).toBe(201);
  return r.json();
}
export async function personal(page: Page) {
  return (await (await page.request.get("/api/workspaces")).json()).find(
    (w: { kind: string }) => w.kind === "personal",
  );
}
export async function setZone(page: Page, timeZone = "UTC") {
  expect(
    (
      await page.request.patch("/api/planner/preferences", {
        headers: { origin },
        data: { timeZone },
      })
    ).status(),
  ).toBe(200);
}
export async function retained(page: Page) {
  await page
    .getByRole("button", { name: "Keep draft for later", exact: true })
    .click();
  await closedEditor(page);
}
export async function closedEditor(page: Page) {
  await expect(page.locator("dialog")).toHaveCount(0);
  // Dialog unmount starts an asynchronous owned-history traversal. Coordinate
  // based gestures must observe its completion before measuring their targets.
  await expect.poll(() => page.evaluate(() => window.history.state?.kanbrikDialog ?? null)).toBeNull();
  await expect(page.locator('[data-session-state="ready"]')).toBeVisible();
}
export async function cleanClose(page: Page) {
  await page.getByRole("button", { name: "Close editor", exact: true }).click();
  await closedEditor(page);
}
export async function saved(page: Page) {
  await closedEditor(page);
  await expect(
    page.getByRole("status").filter({ hasText: /Saved/ }).last(),
  ).toBeVisible();
}
export async function openTask(page: Page, title: string) {
  await page
    .getByRole("button", { name: "Expand Standalone tasks", exact: true })
    .click();
  await page.getByRole("button", { name: title, exact: true }).click();
  return page.getByRole("form", { name: "Edit task", exact: true });
}
export async function drag(
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
