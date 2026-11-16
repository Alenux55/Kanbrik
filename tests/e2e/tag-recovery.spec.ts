import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { testDB } from "../database";
import {
  post,
  personal,
  origin,
  drag,
  openTask,
  retained,
  closedEditor,
} from "./planner-helpers";

test.setTimeout(150000);
test.use({ actionTimeout: 15000 });

async function selected(page: Page, names: string[]) {
  const panel = page.getByRole("region", { name: "Task tags", exact: true });
  for (const name of names)
    await expect(
      panel.getByRole("button", { name: `Remove ${name}`, exact: true }),
    ).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Remove / })).toHaveCount(
    names.length,
  );
}

for (const failure of ["503", "conflict", "lost response"] as const) {
  test(`Board ${failure} recovery preserves selected and archived tags without silently rebasing revisions`, async ({
    page,
    browser,
    isMobile,
    testAccounts,
    testWorkspaces,
  }) => {
    test.skip(
      isMobile,
      "Real Board mouse drag; migrated-tag explicit controls run on both profiles",
    );
    const mine = await personal(page);
    const ws = await post(page, "/api/workspaces", {
      name: "Tag recovery shared",
    });
    testWorkspaces.push(ws.id);
    const tags = await Promise.all(
      ["Keep active", "Keep archived", "Collaborator tag"].map(
        async (name) =>
          (
            await post(page, `/api/workspaces/${ws.id}/tags`, {
              name,
              color: "amber",
              requestKey: randomUUID(),
            })
          ).tag,
      ),
    );
    const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
      title: "Tagged Board recovery",
      description: "Original work",
      tagIds: tags.slice(0, 2).map((t) => t.id),
    });
    // Pre-021 archive fixture verifies retained legacy associations on Board recovery.
    await testDB.workspaceTag.update({where:{id:tags[1].id},data:{archivedAt:new Date(),revision:{increment:1}}});
    const base = `/api/workspaces/${ws.id}/tasks/${task.id}`;
    const other = await post(page, `/api/workspaces/${mine.id}/tasks`, {
      title: "Unrelated retained work",
    });
    await page.reload();
    await openTask(page, other.title);
    await page
      .getByRole("textbox", { name: "Description", exact: true })
      .fill("Retained work input");
    await page
      .getByRole("button", { name: "Add comment", exact: true })
      .click();
    await page
      .getByLabel("New comment text", { exact: true })
      .fill("Retained comment input");
    await page
      .getByRole("button", { name: "Add checklist", exact: true })
      .click();
    await page
      .getByLabel("Section name", { exact: true })
      .fill("Retained list input");
    await retained(page);
    await page.getByRole("link", { name: "Board", exact: true }).click();
    await page.getByRole("button", { name: /^Advanced/ }).click();
    await page
      .getByRole("checkbox", {
        name: "Tag recovery shared (shared)",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "Apply filters", exact: true })
      .click();
    const collaborator = await browser.newContext({ baseURL: origin });
    try {
      if (failure === "conflict") {
        const email = `${randomUUID()}@example.invalid`;
        testAccounts.push(email);
        expect(
          (
            await collaborator.request.post("/api/auth/sign-up/email", {
              headers: { origin },
              data: {
                email,
                name: "Tag collaborator",
                password: randomUUID() + randomUUID(),
              },
            })
          ).status(),
        ).toBe(200);
        expect(
          (
            await page.request.post(`/api/workspaces/${ws.id}/members`, {
              headers: { origin },
              data: { email },
            })
          ).status(),
        ).toBe(200);
      }
      let attempts = 0;
      await page.route(`**${base}/status`, async (route) => {
        attempts++;
        if (failure === "503") {
          await route.fulfill({
            status: 503,
            json: { error: "Fixture: no status write" },
          });
        } else if (failure === "conflict") {
          expect(
            (
              await collaborator.request.patch(base, {
                headers: { origin },
                data: {
                  title: task.title,
                  description: "Collaborator text",
                  status: "todo",
                  revision: task.revision,
                  tagIds: tags.map((t) => t.id),
                },
              })
            ).status(),
          ).toBe(200);
          await route.continue();
        } else {
          expect((await route.fetch()).status()).toBe(200);
          await route.abort();
        }
      });
      const card = page
        .getByRole("article", { name: task.title, exact: true })
        .getByRole("button");
      const column = page
        .getByRole("region", {
          name: "Workspace workflow: Tag recovery shared",
          exact: true,
        })
        .getByRole("region", { name: "In progress column", exact: true });
      await expect(card).toBeVisible();
      await column.scrollIntoViewIfNeeded();
      const source = (await card.boundingBox())!,
        destination = (await column.boundingBox())!;
      await drag(
        page,
        { x: source.x + 30, y: source.y + 20 },
        { x: destination.x + destination.width / 2, y: destination.y + 100 },
      );
      await expect.poll(() => attempts).toBe(1);
      await expect(card).toContainText("Retained unsaved draft");
      await expect(card).toBeEnabled();
      await card.focus();
      await page.keyboard.press("Enter", { delay: 75 });
      const form = page.getByRole("form", { name: "Edit task", exact: true });
      await expect(form).toBeVisible();
      await selected(
        page,
        tags.slice(0, 2).map((t) => t.name),
      );
      await expect(form.getByLabel("Status", { exact: true })).toHaveValue(
        "in_progress",
      );
      await expect(form).toContainText("Revision 1.");
      const read = async () => (await page.request.get(base)).json();
      const beforeReview = await read();
      expect(beforeReview.status).toBe(
        failure === "lost response" ? "in_progress" : "todo",
      );
      expect(beforeReview.revision).toBe(failure === "503" ? 1 : 2);
      await page.unroute(`**${base}/status`);
      const save = form.getByRole("button", {
        name: "Save changes",
        exact: true,
      });
      if (failure !== "503") {
        if (failure === "lost response") {
          const conflict = page.waitForResponse(
            (r) => r.url().endsWith(base) && r.request().method() === "PATCH",
          );
          await save.click();
          expect((await conflict).status()).toBe(409);
        }
        await expect(
          form.getByRole("region", { name: "Saved version", exact: true }),
        ).toBeVisible();
        await expect(save).toBeDisabled();
        await selected(
          page,
          tags.slice(0, 2).map((t) => t.name),
        );
        expect(await read()).toEqual(beforeReview);
        if (failure === "conflict") {
          await expect(
            form.getByRole("region", { name: "Saved version", exact: true }),
          ).toContainText("Collaborator tag");
          // Explicitly keep the proposal, then deliberately preserve the collaborator's added tag/text.
          await form
            .getByRole("button", {
              name: "Review complete: keep my draft",
              exact: true,
            })
            .focus();
          await page.keyboard.press("Space", { delay: 75 });
          await selected(
            page,
            tags.slice(0, 2).map((t) => t.name),
          );
          await expect(form).toContainText("Revision 2.");
          await form
            .getByRole("textbox", { name: "Description", exact: true })
            .fill("Collaborator text");
          await form
            .getByRole("combobox", { name: "Find existing tag", exact: true })
            .fill("Collaborator");
          await form
            .getByRole("option")
            .filter({ hasText: "Collaborator tag" })
            .getByRole("button")
            .click();
        } else {
          // Acknowledging the already committed current record must not write a second status event.
          await form
            .getByRole("button", { name: "Load saved version", exact: true })
            .click();
          await selected(
            page,
            tags.slice(0, 2).map((t) => t.name),
          );
          await expect(form).toContainText("Revision 2.");
        }
      }
      if (failure !== "lost response") {
        const response = page.waitForResponse(
          (r) => r.url().endsWith(base) && r.request().method() === "PATCH",
        );
        await save.click();
        expect((await response).status()).toBe(200);
        await closedEditor(page);
      } else {
        await page
          .getByRole("button", { name: "Close editor", exact: true })
          .click();
        await closedEditor(page);
      }
      const current = await read();
      expect(current.status).toBe("in_progress");
      expect(current.revision).toBe(failure === "conflict" ? 3 : 2);
      expect(current.tags.map((t: { id: string }) => t.id).sort()).toEqual(
        tags
          .slice(0, failure === "conflict" ? 3 : 2)
          .map((t) => t.id)
          .sort(),
      );
      expect(current.description).toBe(
        failure === "conflict" ? "Collaborator text" : "Original work",
      );
      const events = await testDB.workActivity.findMany({
        where: { taskId: task.id },
      });
      expect(
        events.filter((e) =>
          JSON.parse(JSON.stringify(e.changes)).some(
            (c: { field: string; before: string | null }) =>
              c.field === "status" && c.before !== null,
          ),
        ),
      ).toHaveLength(1);
      await page
        .getByRole("article", { name: other.title, exact: true })
        .getByRole("button")
        .click();
      await expect(
        page.getByRole("textbox", { name: "Description", exact: true }),
      ).toHaveValue("Retained work input");
      await expect(
        page.getByLabel("New comment text", { exact: true }),
      ).toHaveValue("Retained comment input");
      await expect(
        page.getByLabel("Section name", { exact: true }),
      ).toHaveValue("Retained list input");
    } finally {
      await collaborator.close();
    }
  });
}

test("migration-shaped Important and Urgent identities support rename and recolor without revising tagged work", async ({
  page,
}) => {
  const ws = await personal(page);
  const tags = await Promise.all(
    ["Important", "Urgent"].map((name) =>
      testDB.workspaceTag.create({
        data: {
          id: `legacy-${name.toLowerCase()}/${ws.id}`,
          workspaceId: ws.id,
          name,
          normalizedName: name.toLowerCase(),
          color: name === "Important" ? "amber" : "pink",
        },
      }),
    ),
  );
  const task = await post(page, `/api/workspaces/${ws.id}/tasks`, {
    title: "Migrated tag holder",
    tagIds: tags.map((t) => t.id),
  });
  const original = await testDB.task.findUniqueOrThrow({
    where: { id: task.id },
  });
  const history = await testDB.workActivity.findMany({
    where: { taskId: task.id },
  });
  await page.reload();
  await openTask(page, task.title);
  await page
    .getByRole("link", { name: "Create/manage tags", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  const panel = page.getByRole("region", {
    name: "Workspace tags",
    exact: true,
  });
  for (const tag of tags) {
    const name = tag.name;
    await panel
      .getByRole("button", { name: `Edit tag ${name}`, exact: true })
      .click();
    const definition = panel.getByRole("region", {
      name: "Tag definition",
      exact: true,
    });
    await definition
      .getByLabel("Tag name", { exact: true })
      .fill(`Imported ${tag.name}`);
    await definition.getByRole("radio", { name: /^Sky/ }).check();
    const response = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().includes("/tags/"),
    );
    await definition
      .getByRole("button", { name: "Save tag definition", exact: true })
      .click();
    const result = await response;
    expect(result.url()).toContain(`/tags/${encodeURIComponent(tag.id)}`);
    expect(result.status()).toBe(200);
    expect((await result.json()).tag).toMatchObject({
      id: tag.id,
      name: `Imported ${tag.name}`,
      color: "sky",
    });
    await expect(definition).toHaveCount(0);
    await expect(
      panel.getByRole("button", {
        name: `Edit tag Imported ${tag.name}`,
        exact: true,
      }),
    ).toBeEnabled();
    const saved = await testDB.workspaceTag.findUniqueOrThrow({
      where: { id: tag.id },
    });
    expect(saved.archivedAt).toBeNull();
    const row = panel
      .getByRole("list", { name: "Tag definitions", exact: true })
      .getByRole("listitem")
      .filter({ hasText: `Imported ${tag.name}` });
    await expect(row).toContainText("Active");
    await closedEditor(page);
    expect(
      await testDB.task.findUniqueOrThrow({ where: { id: task.id } }),
    ).toEqual(original);
    expect(
      await testDB.workActivity.findMany({ where: { taskId: task.id } }),
    ).toEqual(history);
  }
  expect(
    (await testDB.taskTag.findMany({ where: { taskId: task.id } }))
      .map((t) => t.tagId)
      .sort(),
  ).toEqual(tags.map((t) => t.id).sort());
  await page.goto("/projects");
  await openTask(page, task.title);
  await selected(
    page,
    tags.map((t) => `Imported ${t.name}`),
  );
});
