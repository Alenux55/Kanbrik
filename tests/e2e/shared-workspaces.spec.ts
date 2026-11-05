import { devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("owner grants and revokes editor access; editor can leave without losing personal work", async ({ browser, page, isMobile, testAccounts, testWorkspaces }, testInfo) => {
  const editorEmail = `${randomUUID()}@example.invalid`;
  const outsiderEmail = `${randomUUID()}@example.invalid`;
  const name = `Shared ${randomUUID()}`;
  const origin = "http://127.0.0.1:3100";
  const device = isMobile ? devices["Pixel 7"] : devices["Desktop Chrome"];
  const editorContext = await browser.newContext({ ...device, baseURL: origin });
  const outsiderContext = await browser.newContext({ ...device, baseURL: origin });
  try {
    for (const [context, email] of [[editorContext, editorEmail], [outsiderContext, outsiderEmail]] as const) {
      testAccounts.push(email);
      const response = await context.request.post("/api/auth/sign-up/email", { headers: { origin }, data: { email, name: "Shared browser user", password: randomUUID() + randomUUID() } });
      expect(response.status()).toBe(200);
    }
    const editorPage = await editorContext.newPage();
    await editorPage.goto("/workspaces");
    await page.getByRole("navigation").getByRole("link", { name: "Workspaces", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Workspaces", exact: true })).toBeVisible();
    await page.getByLabel("Workspace name", { exact: true }).fill(name);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/workspaces", async route => { await gate; await route.fulfill({ status: 503, json: { error: "Temporary connection failure" } }); });
    await page.getByRole("button", { name: "Create shared workspace", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
    release();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Could not confirm creation");
    await expect(page.getByLabel("Workspace name", { exact: true })).toHaveValue(name);
    await page.unroute("**/api/workspaces");
    await page.getByRole("button", { name: "Create shared workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/workspaces\/[^/]+$/);
    const id = new URL(page.url()).pathname.split("/").pop()!;
    testWorkspaces.push(id);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(page.getByText("shared workspace · owner", { exact: true })).toBeVisible();
    await expect(editorPage.getByRole("link", { name, exact: true })).toHaveCount(0);
    const outsiderPage = await outsiderContext.newPage();
    await outsiderPage.goto(`/workspaces/${id}`);
    await expect(outsiderPage.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
    await expect(outsiderPage.getByRole("heading", { name, exact: true })).toHaveCount(0);
    expect((await outsiderContext.request.get(`/api/workspaces/${id}`)).status()).toBe(404);

    await page.getByLabel("Account email", { exact: true }).fill(editorEmail);
    await page.getByRole("button", { name: "Add existing account", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Saved");
    await expect(page.getByText(editorEmail, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("workspaces.png"), fullPage: true });
    await editorPage.reload();
    await editorPage.getByRole("link", { name, exact: true }).click();
    await expect(editorPage.getByText("shared workspace · editor", { exact: true })).toBeVisible();
    await expect(editorPage.getByRole("button", { name: "Add existing account", exact: true })).toHaveCount(0);
    await expect(editorPage.getByRole("button", { name: "Leave workspace", exact: true })).toBeVisible();
    for (const checked of [page, editorPage]) expect(await checked.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.getByRole("button", { name: `Remove ${editorEmail}`, exact: true }).click();
    await expect(page.getByText(editorEmail, { exact: true })).toHaveCount(0);
    if (isMobile) await editorPage.getByRole("button", { name: "Refresh access", exact: true }).tap();
    else await editorPage.getByRole("button", { name: "Refresh access", exact: true }).click();
    await expect(editorPage.getByRole("heading", { name: "Workspace unavailable" })).toBeVisible();
    expect((await editorContext.request.get(`/api/workspaces/${id}`)).status()).toBe(404);
    await editorPage.getByRole("link", { name: "Back to your workspaces", exact: true }).click();
    await expect(editorPage.getByRole("link", { name: "Personal workspace", exact: true })).toBeVisible();
    await expect(editorPage.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();

    await page.getByLabel("Account email", { exact: true }).fill(editorEmail);
    await page.getByRole("button", { name: "Add existing account", exact: true }).click();
    await expect(page.getByText(editorEmail, { exact: true })).toBeVisible();
    await editorPage.reload();
    await editorPage.getByRole("link", { name, exact: true }).click();
    await editorPage.getByRole("button", { name: "Leave workspace", exact: true }).click();
    await expect(editorPage).toHaveURL(/\/workspaces$/);
    await expect(editorPage.getByRole("link", { name, exact: true })).toHaveCount(0);
    await expect(editorPage.getByRole("link", { name: "Personal workspace", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Refresh access", exact: true }).click();
    await expect(page.getByText(editorEmail, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Leave workspace", exact: true })).toHaveCount(0);
  } finally { await editorContext.close(); await outsiderContext.close(); }
});
