import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";

test("password recovery delivers email and confirms the new password before resetting", async ({ page, request, testAccounts, isMobile }) => {
  const email = testAccounts[0];
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  const forgot = page.getByRole("link", { name: "Forgot your password?", exact: true });
  if (isMobile) await forgot.tap(); else { await forgot.focus(); await page.keyboard.press("Enter"); }
  await expect(page.getByRole("heading", { name: "Forgot your password?", exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("If an account matches");
  const response = await request.get(`http://127.0.0.1:3126/messages?to=${encodeURIComponent(email)}`, { headers: { "x-test-mail-secret": process.env.TEST_MAIL_SECRET! } });
  const messages = await response.json();
  expect(messages.length).toBe(1);
  const link = messages[0].text.match(/http[^\s]+/)[0] as string;
  await page.goto(link);
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  expect(new URL(page.url()).hash.length).toBe(0);
  const password = randomUUID() + randomUUID();
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm your password", { exact: true }).fill(randomUUID());
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Passwords do not match");
  await page.getByLabel("Confirm your password", { exact: true }).fill(password);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Your password has been reset");
  await page.getByRole("link", { name: "Back to sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
});
