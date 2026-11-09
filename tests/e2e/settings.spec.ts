import { test, expect } from "./fixtures";
import { post, personal, origin } from "./planner-helpers";
test("user settings and owner-only workspace reference zones persist without changing scheduling instants", async ({
  page,
  testWorkspaces,
}) => {
  const ws = await personal(page);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "User settings", exact: true })
    .click();
  await page
    .getByLabel("Preferred time zone", { exact: true })
    .fill("Invalid/zone");
  await expect(
    page.getByRole("button", { name: "Save time zone", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Preferred time zone", { exact: true })
    .fill("Europe/London");
  await page
    .getByRole("button", { name: "Save time zone", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Time zone saved." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Preferred time zone", { exact: true }),
  ).toHaveValue("Europe/London");
  const shared = await post(page, "/api/workspaces", {
    name: "User zone default",
  });
  testWorkspaces.push(shared.id);
  expect(shared.timeZone).toBe("Europe/London");
  await page.goto(`/workspaces/${shared.id}`);
  await page
    .getByLabel("Workspace time zone", { exact: true })
    .fill("Asia/Tokyo");
  await page
    .getByRole("button", { name: "Save workspace settings", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Workspace reference zone saved." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Workspace time zone", { exact: true }),
  ).toHaveValue("Asia/Tokyo");
  expect(
    (await (await page.request.get(`/api/workspaces/${ws.id}/settings`)).json())
      .timeZone,
  ).toBe("UTC");
  const current = await (
    await page.request.get(`/api/workspaces/${shared.id}/settings`)
  ).json();
  await page.request.patch(`/api/workspaces/${shared.id}/settings`, {
    headers: { origin },
    data: { timeZone: "America/New_York", revision: current.settingsRevision },
  });
  await page.getByLabel("Workspace time zone", { exact: true }).fill("UTC");
  await page
    .getByRole("button", { name: "Save workspace settings", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Settings changed." }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Workspace time zone", { exact: true }),
  ).toHaveValue("UTC");
});
