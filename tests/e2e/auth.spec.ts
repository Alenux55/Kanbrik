import { test, expect } from "./base";
import { randomUUID } from "node:crypto";

test("signup, session refresh, sign-out/back, invalid login, and sign-in", async ({ page, isMobile, testAccounts }) => {
  const email = `${randomUUID()}@example.invalid`;
  const password = randomUUID() + randomUUID();
  testAccounts.push(email);
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole("link", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Browser auth user");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  let signups = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/auth/sign-up/email") signups++; });
  await page.getByLabel("Confirm your password", { exact: true }).fill(randomUUID());
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Passwords do not match");
  await expect(page.getByLabel("Confirm your password", { exact: true })).toBeFocused();
  expect(signups).toBe(0);
  await page.getByLabel("Confirm your password", { exact: true }).fill(password);
  const submit = page.getByRole("button", { name: "Create account", exact: true });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/auth/sign-up/email", async route => { await gate; await route.continue(); });
  if (isMobile) await submit.tap(); else await submit.click();
  await expect(page.getByRole("button", { name: "Please wait…" })).toBeDisabled();
  release();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
  await expect(page.getByText("Personal workspace", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goBack();
  await page.waitForURL("**/sign-in", { waitUntil: "networkidle" });
  await page.reload();
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(randomUUID());
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("deployed-mode registration is denied at the server even when local flag is true", async ({ request, page }) => {
  await page.goto("http://127.0.0.1:3102/sign-up");
  await expect(page.getByText("Registration is disabled.", { exact: false })).toBeVisible();
  const result = await request.post("http://127.0.0.1:3102/api/auth/sign-up/email", {
    headers: { origin: "http://127.0.0.1:3102" },
    data: { email: `${randomUUID()}@example.invalid`, password: randomUUID() + randomUUID(), name: "Disabled signup" },
  });
  expect(result.status()).toBe(400);
});

test("untrusted auth origins are rejected and forms remain usable with keyboard", async ({ request, page }) => {
  const result = await request.post("/api/auth/sign-up/email", {
    headers: { origin: "https://untrusted.invalid" }, data: { email: `${randomUUID()}@example.invalid`, password: randomUUID() + randomUUID(), name: "Origin test" },
  });
  expect(result.status()).toBe(403);
  await page.goto("/sign-in");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("forgot password explains missing SMTP configuration and rejects requests server-side", async ({ page, request }) => {
  await page.goto("http://127.0.0.1:3102/sign-in");
  await page.getByRole("link", { name: "Forgot your password?", exact: true }).click();
  await expect(page.getByText("Email password recovery is not configured yet.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toHaveCount(0);
  const response = await request.post("http://127.0.0.1:3102/api/auth/request-password-reset", { headers: { origin: "http://127.0.0.1:3102" }, data: { email: `${randomUUID()}@example.invalid` } });
  expect(response.status()).toBe(400);
  await page.goto("/reset-password");
  await expect(page.getByText("This reset link is missing or invalid.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a new reset link", exact: true })).toBeVisible();
});
