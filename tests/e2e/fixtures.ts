import { test as base, expect } from "./base";
import { randomUUID } from "node:crypto";

export const test = base.extend<{ signedIn: void }>({
  signedIn: [async ({ page, testAccounts }, use) => {
    const email = `${randomUUID()}@example.invalid`;
    testAccounts.push(email);
    await page.goto("/sign-up");
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Browser user");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(randomUUID() + randomUUID());
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await use();
  }, { auto: true }],
});
export { expect };
