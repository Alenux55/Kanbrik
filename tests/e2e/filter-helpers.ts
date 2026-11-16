import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
export async function picker(page: Page, name: "Tags" | "Project") {
  const dialog = page.getByRole("dialog", {
    name: `${name} filters`,
    exact: true,
  });
  if (!(await dialog.isVisible()))
    await page
      .getByRole("button", { name: new RegExp(`^${name}( \\([0-9]+\\))?$`) })
      .click();
  await expect(dialog).toBeVisible();
  return dialog;
}
export async function finishPicker(page: Page) {
  const dialog = page.getByRole("dialog", { name: /^(Tags|Project) filters$/ });
  if (await dialog.isVisible())
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
}
export async function tagMode(page: Page, value: "any" | "all") {
  await finishPicker(page);
  await page.getByRole("button", { name: /^Advanced/ }).click();
  await page
    .getByRole("combobox", { name: "Match selected tags", exact: true })
    .selectOption(value);
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  return picker(page, "Tags");
}
