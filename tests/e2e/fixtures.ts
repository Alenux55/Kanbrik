import { test as base, expect } from "./base";
import { randomUUID } from "node:crypto";

export const test = base.extend<{ signedIn: void }>({
  signedIn: [async ({ page, testAccounts }, use) => {
    const email = `${randomUUID()}@example.invalid`;
    testAccounts.push(email);
    const password = randomUUID() + randomUUID();
    // Planner fixtures require an authenticated actor, not a signup UI test.
    // Use the real registration API and its context cookies; this avoids native
    // form submission before hydration. Dedicated auth.spec.ts tests the UI.
    const response = await page.request.post("/api/auth/sign-up/email", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: { name: "Browser user", email, password },
    });
    expect(response.status()).toBe(200);
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
    await use();
  }, { auto: true }],
});
export { expect };
