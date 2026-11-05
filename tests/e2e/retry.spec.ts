import { test, expect } from "./fixtures";
import { failFixtureMembership, testDB } from "../database";

test("retry requests fresh server content after a fixture-scoped bootstrap failure", async ({ page, testAccounts, isMobile }) => {
  const user = await testDB.user.findUniqueOrThrow({ where: { email: testAccounts[0] } });
  const original = await testDB.workspace.findUniqueOrThrow({ where: { personalOwnerId: user.id } });
  let release = await failFixtureMembership(user.id);
  let requests = 0;
  page.on("request", request => { if (request.method() === "GET" && new URL(request.url()).pathname === "/calendar") requests++; });
  try {
    await page.goto("/calendar");
    const heading = page.getByRole("heading", { name: "Could not load this page" });
    const button = page.getByRole("button", { name: "Try again", exact: true });
    await expect(heading).toBeVisible();
    const failedCount = requests;
    if (isMobile) await button.tap(); else { await button.focus(); await page.keyboard.press("Enter"); }
    await expect.poll(() => requests).toBeGreaterThan(failedCount);
    await expect(heading).toBeVisible();
    await expect(button).toBeEnabled();
    await release(); release = async () => {};
    const beforeRecovery = requests;
    if (isMobile) await button.tap(); else await button.click();
    await expect.poll(() => requests).toBeGreaterThan(beforeRecovery);
    await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/calendar$/);
    expect(await testDB.workspace.count({ where: { personalOwnerId: user.id } })).toBe(1);
    expect((await testDB.workspace.findUniqueOrThrow({ where: { personalOwnerId: user.id } })).id).toBe(original.id);
    expect(await testDB.membership.count({ where: { workspaceId: original.id, userId: user.id, role: "owner" } })).toBe(1);
  } finally { await release(); }
});
