import type { Page } from "@playwright/test";

export async function openOrderActions(page: Page, title: string) {
  const summary = page.getByLabel("Actions: " + title, { exact: true });
  if (
    !(await summary.evaluate(
      (node) => (node.closest("details") as HTMLDetailsElement).open,
    ))
  )
    await summary.click();
}
