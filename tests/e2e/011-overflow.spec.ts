import { test, expect } from "./fixtures";
test("palette drag keeps scroll bounds stable", async ({ page, isMobile }) => {
  test.skip(isMobile, "Mouse palette is desktop-only");
  const ws = (await (await page.request.get("/api/workspaces")).json())[0];
  await page.request.post(`/api/workspaces/${ws.id}/projects`, {
    headers: { origin: "http://127.0.0.1:3100" },
    data: { title: "Overflow reproduction" },
  });
  await page.goto("/calendar");
  const palette = page.getByLabel("Calendar work palette");
  await palette.scrollIntoViewIfNeeded();
  const dims = () =>
    palette.evaluate((e) => ({
      width: e.scrollWidth,
      height: e.scrollHeight,
      document: document.documentElement.scrollWidth,
    }));
  const before = await dims();
  const box = (await page
    .getByRole("button", {
      name: "Drag project: Overflow reproduction",
      exact: true,
    })
    .boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 32, box.y + 20, { steps: 3 });
  await page.mouse.move(1400, Math.min(850, box.y + 200), { steps: 20 });
  const during = await dims();
  console.log({ before, during });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(during).toEqual(before);
  // A portal must stay inside the account/session gate even though it is
  // outside the palette's scroller.
  const source = (await page
    .getByRole("button", {
      name: "Drag project: Overflow reproduction",
      exact: true,
    })
    .boundingBox())!;
  await page.mouse.move(source.x + 20, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(source.x + 60, source.y + 40, { steps: 8 });
  await expect(page.locator("[data-drag-preview]")).toBeVisible();
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/time-blocks"))
      writes++;
  });
  await page.route("**/api/planner-session", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Fixture identity check failure" },
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", {
      name: "Could not verify your session",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("[data-drag-preview]")).toBeHidden();
  await page.mouse.up();
  expect(writes).toBe(0);
  await page.unroute("**/api/planner-session");
  await page
    .getByRole("button", { name: "Retry session check", exact: true })
    .click();
  await expect(palette).toBeVisible();
  await expect(page.locator("[data-drag-preview]")).toHaveCount(0);
});
