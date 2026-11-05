import { expect, test } from "@playwright/test";

const destinations = [
  ["Projects", "projects"], ["Board", "board"], ["Calendar", "calendar"],
  ["Lists", "lists"], ["Inbox / Notes", "inbox"],
] as const;

test("navigation reaches every route with one active link and no horizontal overflow", async ({ page, isMobile }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveURL(/\/projects$/);
  await page.screenshot({ path: testInfo.outputPath("shell.png"), fullPage: true });
  for (const [label, slug] of destinations) {
    const link = page.getByRole("navigation").getByRole("link", { name: label, exact: true });
    if (isMobile) await link.tap(); else await link.click();
    await expect(page).toHaveURL(new RegExp(`/${slug}$`));
    await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    await expect(link).toHaveAttribute("aria-current", "page");
  }
  expect(errors).toEqual([]);
});

test("keyboard can skip navigation and activate a destination", async ({ page }) => {
  await page.goto("/projects");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  const calendar = page.getByRole("navigation").getByRole("link", { name: "Calendar" });
  await calendar.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/calendar$/);
});

test("unknown sections return a real 404", async ({ page }) => {
  const response = await page.goto("/not-a-section");
  expect(response?.status()).toBe(404);
});
