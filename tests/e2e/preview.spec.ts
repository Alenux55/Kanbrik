import { test, expect } from "./base";
import { randomUUID } from "node:crypto";

const origin = "https://kanbrik.example.invalid";
test.setTimeout(60000);
test.afterEach(async ({ context }) => {
  // Context teardown can cancel unrelated prefetches after the checked workflow.
  await context.unrouteAll({ behavior: "ignoreErrors" });
});

test("HTTPS preview accounts persist with secure cookies and can sign in after signup closes", async ({ page, context, request, testAccounts }) => {
  let backendPort = 3104;
  // Proxy only this fictional HTTPS origin to the isolated loopback app. This
  // exercises the browser's real HTTPS cookie/context rules and the app's
  // canonical Origin checks without touching DNS, certificates or a real proxy.
  await context.route(`${origin}/**`, async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `http://127.0.0.1:${backendPort}${url.pathname}${url.search}`,
      headers: { ...await route.request().allHeaders(), host: url.host, "x-forwarded-host": url.host, "x-forwarded-proto": "https" },
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
  const email = `${randomUUID()}@example.invalid`, password = randomUUID() + randomUUID();
  testAccounts.push(email);
  await page.goto(`${origin}/sign-up`);
  await page.getByLabel("Name", { exact: true }).fill("HTTPS preview user");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm your password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/projects`);
  expect(await page.evaluate(() => isSecureContext)).toBe(true);
  const cookie = (await context.cookies(origin)).find(value => value.name.includes("session_token"));
  expect(cookie?.secure).toBe(true);
  expect(cookie?.httpOnly).toBe(true);
  const personalId = await page.evaluate(async () => (await (await fetch("/api/workspaces")).json()).find((w: { kind: string }) => w.kind === "personal").id);
  await page.reload();
  await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Calendar", exact: true }).click();
  await page.getByRole("button", { name: "New block", exact: true }).click();
  const form = page.getByRole("form", { name: "Create time block", exact: true });
  await form.getByRole("button", { name: "Create block", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Saved time block." }).last()).toBeVisible();

  // The opt-in never changes the exact trusted Origin or workspace boundary.
  const rejectedEmail = `${randomUUID()}@example.invalid`; testAccounts.push(rejectedEmail);
  const foreign = await request.post("http://127.0.0.1:3104/api/auth/sign-up/email", {
    headers: { origin: "https://untrusted.invalid" },
    data: { email: rejectedEmail, password, name: "Rejected origin" },
  });
  expect(foreign.status()).toBe(403);

  backendPort = 3106;
  await context.clearCookies();
  await page.goto(`${origin}/sign-up`);
  await expect(page.getByText("Registration is disabled.", { exact: false })).toBeVisible();
  const disabledEmail = `${randomUUID()}@example.invalid`; testAccounts.push(disabledEmail);
  const disabled = await request.post("http://127.0.0.1:3106/api/auth/sign-up/email", {
    headers: { origin }, data: { email: disabledEmail, password, name: "Closed preview signup" },
  });
  expect(disabled.status()).toBe(400);
  await page.goto(`${origin}/sign-in`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/projects`);
  expect(await page.evaluate(async () => (await (await fetch("/api/workspaces")).json()).find((w: { kind: string }) => w.kind === "personal").id)).toBe(personalId);
  await expect(page.getByRole("combobox", { name: "Creation workspace", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
});
