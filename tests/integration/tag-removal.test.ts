import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { testDB as db } from "../database";
import type {
  TagRemovalPreview,
  TagRemovalReceipt,
} from "../../src/lib/tag-contracts";
const origin = "http://127.0.0.1:3119";
type Actor = { id: string; email: string; cookie: string };
let server: ChildProcess,
  owner: Actor,
  editor: Actor,
  outsider: Actor,
  ws: string;
const users: string[] = [],
  workspaces: string[] = [];
async function request(
  path: string,
  method = "GET",
  body?: object,
  actor = owner,
  extra: Record<string, string> = {},
) {
  return fetch(origin + path, {
    method,
    headers: {
      origin,
      cookie: actor?.cookie ?? "",
      "content-type": "application/json",
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function create(path: string, body: object, actor = owner) {
  const r = await request(path, "POST", body, actor);
  expect(r.status).toBe(201);
  return r.json();
}
async function account(): Promise<Actor> {
  const email = randomUUID() + "@example.invalid",
    r = await request(
      "/api/auth/sign-up/email",
      "POST",
      { name: "Removal fixture", email, password: randomUUID() + randomUUID() },
      { id: "", email: "", cookie: "" },
    );
  expect(r.status).toBe(200);
  const user = (await r.json()).user;
  users.push(user.id);
  return {
    id: user.id,
    email,
    cookie: r.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; "),
  };
}
const tagPath = (id: string, workspace = ws) =>
  `/api/workspaces/${workspace}/tags/${encodeURIComponent(id)}`;
async function tag(name = randomUUID(), workspace = ws) {
  return (
    await create(`/api/workspaces/${workspace}/tags`, {
      name,
      color: "teal",
      requestKey: randomUUID(),
    })
  ).tag;
}
async function task(tagIds: string[], more: object = {}) {
  return create(`/api/workspaces/${ws}/tasks`, {
    title: randomUUID(),
    tagIds,
    ...more,
  });
}
async function preview(
  id: string,
  revision = 1,
  actor = owner,
): Promise<TagRemovalPreview> {
  const r = await request(
    tagPath(id) + "/removal-preview",
    "POST",
    { revision },
    actor,
  );
  expect(r.status).toBe(200);
  return r.json();
}
async function move(kind: "project" | "task", id: string) {
  const r = await request(`/api/workspaces/${ws}/trash/preview`, "POST", {
    kind,
    id,
  });
  expect(r.status).toBe(200);
  const p = await r.json(),
    saved = await request(`/api/workspaces/${ws}/trash`, "POST", {
      kind,
      id,
      impactDigest: p.impactDigest,
      requestKey: randomUUID(),
    });
  expect(saved.status).toBe(200);
  return (await saved.json()).batch;
}
async function remove(
  id: string,
  p: TagRemovalPreview,
  key = randomUUID(),
  actor = owner,
) {
  return request(
    tagPath(id) + "/remove",
    "POST",
    { review: p.review, requestKey: key },
    actor,
  );
}
async function restoreDefinition(id: string) {
  const current = await db.workspaceTag.findUniqueOrThrow({ where: { id } });
  const r = await request(tagPath(id), "PATCH", {
    name: current.name,
    color: current.color,
    revision: current.revision,
    archived: false,
  });
  expect(r.status).toBe(200);
}
async function snapshot() {
  const [
    tasks,
    tags,
    links,
    batches,
    work,
    configuration,
    intents,
    orders,
    blocks,
  ] = await Promise.all([
    db.task.findMany({ where: { workspaceId: ws }, orderBy: { id: "asc" } }),
    db.workspaceTag.findMany({
      where: { workspaceId: ws },
      orderBy: { id: "asc" },
    }),
    db.taskTag.findMany({
      where: { workspaceId: ws },
      orderBy: [{ taskId: "asc" }, { tagId: "asc" }],
    }),
    db.trashBatch.findMany({
      where: { workspaceId: ws },
      orderBy: { id: "asc" },
    }),
    db.workActivity.findMany({
      where: { workspaceId: ws },
      orderBy: { id: "asc" },
    }),
    db.workspaceActivity.findMany({
      where: { workspaceId: ws },
      orderBy: { id: "asc" },
    }),
    db.workspaceIntent.findMany({
      where: { workspaceId: ws },
      orderBy: { id: "asc" },
    }),
    db.taskOrderScope.findMany({
      where: { workspaceId: ws },
      orderBy: { scopeKey: "asc" },
    }),
    db.timeBlock.findMany({
      where: { workspaceId: ws },
      orderBy: { id: "asc" },
    }),
  ]);
  return {
    tasks,
    tags,
    links,
    batches,
    work,
    configuration,
    intents,
    orders,
    blocks,
  };
}
beforeAll(async () => {
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3119",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        BETTER_AUTH_URL: origin,
        KANBRIK_ENV: "test",
        ENABLE_LOCAL_REGISTRATION: "true",
        INVITATION_ADMIN_EMAILS: "",
        PASSWORD_RESET_ENABLED: "false",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch(origin + "/sign-in")).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  expect(ready).toBe(true);
  owner = await account();
  editor = await account();
  outsider = await account();
  ws = (await create("/api/workspaces", { name: "Removal shared" })).id;
  workspaces.push(ws);
  expect(
    (
      await request(`/api/workspaces/${ws}/members`, "POST", {
        email: editor.email,
      })
    ).status,
  ).toBe(200);
});
afterAll(async () => {
  await db.timeBlock.deleteMany({ where: { workspaceId: { in: workspaces } } });
  await db.workspace.deleteMany({ where: { id: { in: workspaces } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
  server?.kill();
});

describe("reviewed workspace tag removal", () => {
  it("previews/exports every usage without writes and escapes complete spreadsheet data", async () => {
    const selected = await tag(),
      other = await tag(),
      project = await create(`/api/workspaces/${ws}/projects`, {
        title: 'Project "quoted", 雪\ncontext',
      });
    const parent = await task([selected.id, other.id], {
      projectId: project.id,
      title: "Parent",
    });
    const child = await task([selected.id], {
      parentId: parent.id,
      title: 'Unicode 雪, "quoted"\nsecond line',
    });
    const standalone = await task([selected.id], {
      title: '=HYPERLINK("bad")',
    });
    const trashed = await task([selected.id], {
      status: "done",
      title: "Trash record",
    });
    await move("task", trashed.id);
    const foreign = await create("/api/workspaces", {
      name: "Same name foreign",
    });
    workspaces.push(foreign.id);
    const duplicate = await tag(selected.name, foreign.id);
    await create(`/api/workspaces/${foreign.id}/tasks`, {
      title: "Foreign secret",
      tagIds: [duplicate.id],
    });
    const before = await snapshot(),
      p = await preview(selected.id),
      r = await request(
        tagPath(selected.id) + "/removal-preview/export",
        "POST",
        { review: p.review },
      );
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("content-disposition")).toBe(
      'attachment; filename="kanbrik-tag-usage.csv"',
    );
    const csv = await r.text();
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"Unicode 雪, ""quoted""\nsecond line"');
    expect(csv).not.toContain("Foreign secret");
    expect(csv).toContain(p.capturedAt);
    expect(csv).toContain(p.impactDigest);
    expect(p.activeCount).toBe(3);
    expect(p.trashCount).toBe(1);
    expect(p.rows.map((row) => row.taskId).sort()).toEqual(
      [parent.id, child.id, standalone.id, trashed.id].sort(),
    );
    expect(p.rows.find((row) => row.taskId === child.id)).toMatchObject({
      type: "Subtask",
      parent: "Parent",
      project: project.title,
    });
    expect(await snapshot()).toEqual(before);
  });
  it("removes an unused definition explicitly, preserving its identity and recording a recoverable report", async () => {
    const t = await tag(),
      p = await preview(t.id);
    expect(p.rows).toHaveLength(0);
    const r = await remove(t.id, p);
    expect(r.status).toBe(200);
    const receipt: TagRemovalReceipt = (await r.json()).receipt;
    const after = await db.workspaceTag.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(after).toMatchObject({
      id: t.id,
      name: t.name,
      color: t.color,
      revision: 2,
    });
    expect(after.archivedAt).toBeTruthy();
    expect(
      (await request(tagPath(t.id) + `/removals/${receipt.id}`)).status,
    ).toBe(200);
    await restoreDefinition(t.id);
    expect(
      (await db.workspaceTag.findUniqueOrThrow({ where: { id: t.id } }))
        .archivedAt,
    ).toBeNull();
  });
  it("atomically detaches active and overlapping Trash batches while preserving all other work, orders and reservations", async () => {
    const selected = await tag(),
      keep = await tag(),
      project = await create(`/api/workspaces/${ws}/projects`, {
        title: "Mixed batch project",
      });
    const parent = await task([selected.id, keep.id], {
        projectId: project.id,
        title: "Parent",
      }),
      child = await task([selected.id, keep.id], {
        parentId: parent.id,
        title: "Child",
        status: "done",
      }),
      untouched = await task([keep.id], {
        projectId: project.id,
        title: "Unchanged sibling",
      }),
      active = await task([selected.id, keep.id]);
    const oldBatch = await move("task", child.id),
      projectBatch = await move("project", project.id);
    const block = await create(`/api/workspaces/${ws}/time-blocks`, {
      label: "Unchanged reservation",
      requestKey: randomUUID(),
      assignment: { projectId: null, taskId: active.id },
      schedule: {
        startAt: "2030-06-03T14:00:23.123Z",
        endAt: "2030-06-03T15:00:23.456Z",
        timeZone: "UTC",
      },
    });
    const before = await snapshot(),
      p = await preview(selected.id),
      editorReview = await preview(selected.id, 1, editor);
    expect(p.activeCount).toBe(1);
    expect(p.trashCount).toBe(2);
    const r = await remove(selected.id, editorReview, randomUUID(), editor);
    expect(r.status).toBe(200);
    const after = await snapshot();
    expect(after.orders).toEqual(before.orders);
    expect(after.blocks).toEqual(before.blocks);
    expect(after.tasks.find((t) => t.id === untouched.id)).toEqual(
      before.tasks.find((t) => t.id === untouched.id),
    );
    for (const id of [parent.id, child.id, active.id]) {
      const a = after.tasks.find((t) => t.id === id)!,
        b = before.tasks.find((t) => t.id === id)!;
      expect({ ...a, revision: b.revision, updatedAt: b.updatedAt }).toEqual(b);
      expect(a.revision).toBe(b.revision + 1);
      expect(
        after.links.filter((t) => t.taskId === id).map((t) => t.tagId),
      ).toEqual([keep.id]);
      const events = after.work.filter(
        (e) => e.taskId === id && e.action === "tag_removed",
      );
      expect(events).toHaveLength(1);
      expect(events[0].actorId).toBe(editor.id);
      expect(events[0].changes).toEqual([
        {
          field: "tags",
          before: JSON.stringify([selected.id, keep.id].sort()),
          after: JSON.stringify([keep.id]),
          beforeLabel: expect.any(String),
          afterLabel: keep.name,
        },
      ]);
    }
    const fresh = (await (
      await request(`/api/workspaces/${ws}/trash`)
    ).json()) as { id: string; revision: number }[];
    for (const batch of [oldBatch, projectBatch]) {
      expect(fresh.find((b) => b.id === batch.id)?.revision).toBe(2);
      expect(
        (
          await request(
            `/api/workspaces/${ws}/trash/${batch.id}/restore`,
            "POST",
            { revision: 1 },
          )
        ).status,
      ).toBe(409);
    }
    // Parent project must be restored before the independently trashed child.
    expect(
      (
        await request(
          `/api/workspaces/${ws}/trash/${oldBatch.id}/restore`,
          "POST",
          { revision: 2 },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/api/workspaces/${ws}/trash/${projectBatch.id}/restore`,
          "POST",
          { revision: 2 },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/workspaces/${ws}/trash/${oldBatch.id}/restore`,
          "POST",
          { revision: 2 },
        )
      ).status,
    ).toBe(200);
    const report = (
      await (await request(tagPath(selected.id) + "/removals")).json()
    ).rows[0];
    expect(report).toMatchObject({ activeCount: 1, trashCount: 2 });
    expect(
      (await request(tagPath(selected.id) + `/removals/${report.id}/export`))
        .status,
    ).toBe(200);
    expect(
      (
        await db.timeBlock.findUniqueOrThrow({ where: { id: block.id } })
      ).startAt.toISOString(),
    ).toBe("2030-06-03T14:00:23.123Z");
  });
  for (const change of [
    "assignment",
    "task text",
    "tag set",
    "tag rename",
    "Trash",
    "Restore",
    "batch version",
  ] as const)
    it(`rejects stale confirmation and download after ${change}`, async () => {
      const t = await tag(),
        a = await task([t.id]);
      let batch: { id: string } | undefined;
      if (change === "Restore" || change === "batch version")
        batch = await move("task", a.id);
      const p = await preview(t.id);
      if (change === "assignment") await task([t.id]);
      if (change === "task text")
        expect(
          (
            await request(`/api/workspaces/${ws}/tasks/${a.id}`, "PATCH", {
              title: "Changed",
              description: "Retained",
              status: a.status,
              revision: 1,
              tagIds: [t.id],
            })
          ).status,
        ).toBe(200);
      if (change === "tag set")
        expect(
          (
            await request(`/api/workspaces/${ws}/tasks/${a.id}`, "PATCH", {
              title: a.title,
              description: "",
              status: a.status,
              revision: 1,
              tagIds: [],
            })
          ).status,
        ).toBe(200);
      if (change === "tag rename")
        expect(
          (
            await request(tagPath(t.id), "PATCH", {
              name: t.name + " changed",
              color: "blue",
              archived: false,
              revision: 1,
            })
          ).status,
        ).toBe(200);
      if (change === "Trash") await move("task", a.id);
      if (change === "Restore")
        expect(
          (
            await request(
              `/api/workspaces/${ws}/trash/${batch!.id}/restore`,
              "POST",
              { revision: 1 },
            )
          ).status,
        ).toBe(200);
      if (change === "batch version")
        await db.trashBatch.update({
          where: { workspaceId_id: { workspaceId: ws, id: batch!.id } },
          data: { revision: { increment: 1 } },
        });
      const before = await snapshot();
      expect((await remove(t.id, p)).status).toBe(409);
      expect(
        (
          await request(tagPath(t.id) + "/removal-preview/export", "POST", {
            review: p.review,
          })
        ).status,
      ).toBe(409);
      expect(await snapshot()).toEqual(before);
    });
  it("rejects in-use legacy archives without reinterpreting rename/recolor; unused archives and legacy retained links remain compatible", async () => {
    const t = await tag(),
      a = await task([t.id]),
      before = await snapshot();
    expect(
      (
        await request(tagPath(t.id), "PATCH", {
          name: t.name + " rename",
          color: "blue",
          archived: true,
          revision: 1,
        })
      ).status,
    ).toBe(400);
    expect(await snapshot()).toEqual(before);
    expect(
      (
        await request(tagPath(t.id), "PATCH", {
          name: t.name + " rename",
          color: "blue",
          archived: false,
          revision: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: a.id } })).revision,
    ).toBe(1);
    // Pre-021 archive fixture, not a new application archive bypass.
    await db.workspaceTag.update({
      where: { id: t.id },
      data: { archivedAt: new Date(), revision: { increment: 1 } },
    });
    const p = await preview(t.id, 3);
    expect((await remove(t.id, p)).status).toBe(200);
    expect(
      await db.taskTag.count({ where: { taskId: a.id, tagId: t.id } }),
    ).toBe(0);
    const unused = await tag();
    expect(
      (
        await request(tagPath(unused.id), "PATCH", {
          name: unused.name,
          color: unused.color,
          archived: true,
          revision: 1,
        })
      ).status,
    ).toBe(200);
  });
  it("reconciles lost responses exactly once after restoration, later reattachment and edits", async () => {
    const t = await tag(),
      a = await task([t.id]),
      p = await preview(t.id),
      key = randomUUID(),
      first = await remove(t.id, p, key);
    expect(first.status).toBe(200);
    const original = (await first.json()).receipt;
    await restoreDefinition(t.id);
    expect(
      (
        await request(`/api/workspaces/${ws}/tasks/${a.id}`, "PATCH", {
          title: "Later edit",
          description: "Later data",
          status: a.status,
          revision: 2,
          tagIds: [t.id],
        })
      ).status,
    ).toBe(200);
    const before = await snapshot(),
      replay = await remove(t.id, p, key);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ receipt: original, replayed: true });
    expect(await snapshot()).toEqual(before);
    expect(
      (
        await request(tagPath(t.id) + "/remove", "POST", {
          review: p.review + "x",
          requestKey: key,
        })
      ).status,
    ).toBe(400);
    expect((await remove(t.id, p, key, editor)).status).toBe(400);
    const report = await request(tagPath(t.id) + `/removals/${key}/export`);
    expect(report.status).toBe(200);
    expect(await report.text()).toContain(a.title);
  });
  it("rolls back tasks, associations, batches, tag, events and receipt after a late fixture-scoped failure", async () => {
    const t = await tag(),
      a = await task([t.id]);
    await move("task", a.id);
    const p = await preview(t.id),
      before = await snapshot(),
      trigger = "remove_fail_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId"='${ws}' AND NEW.kind='tag_remove' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON "WorkspaceIntent" FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    );
    try {
      expect((await remove(t.id, p)).status).toBe(503);
      expect(await snapshot()).toEqual(before);
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER ${trigger} ON "WorkspaceIntent"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);
    }
  });
  it("refuses an irreconcilable Trash batch instead of bypassing exact member checks", async () => {
    const t = await tag(),
      a = await task([t.id]),
      b = await move("task", a.id),
      p = await preview(t.id);
    const original = await db.trashBatch.findUniqueOrThrow({
      where: { workspaceId_id: { workspaceId: ws, id: b.id } },
    });
    await db.trashBatch.update({
      where: { workspaceId_id: { workspaceId: ws, id: b.id } },
      data: { members: [{ kind: "task", id: a.id, revision: 999 }] },
    });
    try {
      const before = await snapshot();
      expect((await remove(t.id, p)).status).toBe(400);
      expect(await snapshot()).toEqual(before);
    } finally {
      await db.trashBatch.update({
        where: { workspaceId_id: { workspaceId: ws, id: b.id } },
        data: { members: original.members! },
      });
    }
  });
  it("keeps archived workflow resolution and deleted Calendar blocks intact after tag detachment", async () => {
    const t = await tag(),
      a = await task([t.id], { status: "blocked" });
    const block = await create(`/api/workspaces/${ws}/time-blocks`, {
      label: "Removed with work",
      requestKey: randomUUID(),
      assignment: { projectId: null, taskId: a.id },
      schedule: {
        startAt: "2030-07-01T12:00:00Z",
        endAt: "2030-07-01T13:00:00Z",
        timeZone: "UTC",
      },
    });
    expect(
      (
        await request(
          `/api/workspaces/${ws}/time-blocks/${block.id}`,
          "DELETE",
          { revision: 1 },
        )
      ).status,
    ).toBe(200);
    const batch = await move("task", a.id);
    expect(await db.timeBlock.count({ where: { id: block.id } })).toBe(0);
    // Scoped workflow fixture retires the original status; Restore still requires resolution.
    await db.workspaceStatus.update({
      where: { workspaceId_id: { workspaceId: ws, id: "blocked" } },
      data: { archivedAt: new Date(), revision: { increment: 1 } },
    });
    try {
      expect((await remove(t.id, await preview(t.id))).status).toBe(200);
      const r = await request(
        `/api/workspaces/${ws}/trash/${batch.id}/restore`,
        "POST",
        { revision: 2 },
      );
      expect(r.status).toBe(409);
      const resolution = (await r.json()).current.statusResolution;
      expect(resolution.requirements).toEqual([
        { statusId: "blocked", name: "Blocked", count: 1 },
      ]);
      expect(
        (
          await request(
            `/api/workspaces/${ws}/trash/${batch.id}/restore`,
            "POST",
            {
              revision: 2,
              statusImpactDigest: resolution.impactDigest,
              statusReplacements: { blocked: "todo" },
            },
          )
        ).status,
      ).toBe(200);
      expect(await db.taskTag.count({ where: { taskId: a.id } })).toBe(0);
      expect(await db.timeBlock.count({ where: { id: block.id } })).toBe(0);
    } finally {
      await db.workspaceStatus.update({
        where: { workspaceId_id: { workspaceId: ws, id: "blocked" } },
        data: { archivedAt: null, revision: { increment: 1 } },
      });
    }
  });
  it("authorizes preview/export/confirm/history with strict Origin, account and workspace identities", async () => {
    const t = await tag(),
      p = await preview(t.id),
      key = randomUUID(),
      foreign = await create("/api/workspaces", { name: "Foreign" });
    workspaces.push(foreign.id);
    for (const [suffix, method, body] of [
      ["/removal-preview", "POST", { revision: 1 }],
      ["/removal-preview/export", "POST", { review: p.review }],
      ["/remove", "POST", { review: p.review, requestKey: key }],
      ["/removals", "GET", undefined],
    ] as const) {
      expect(
        (await request(tagPath(t.id) + suffix, method, body, outsider)).status,
      ).toBe(404);
      expect([400, 404]).toContain(
        (await request(tagPath(t.id, foreign.id) + suffix, method, body))
          .status,
      );
      expect(
        (
          await request(tagPath(t.id) + suffix, method, body, owner, {
            "X-Kanbrik-Account": outsider.id,
          })
        ).status,
      ).toBe(412);
      if (method === "POST")
        expect(
          (
            await request(tagPath(t.id) + suffix, method, body, owner, {
              origin: "https://foreign.invalid",
            })
          ).status,
        ).toBe(403);
    }
    expect((await remove(t.id, p, randomUUID(), editor)).status).toBe(400);
    expect(
      (
        await request(tagPath(t.id) + "/remove", "POST", {
          review: p.review,
          requestKey: key,
          tagIds: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(tagPath(t.id) + "/remove", "POST", {
          review: p.review.slice(0, -2) + "xx",
          requestKey: key,
        })
      ).status,
    ).toBe(400);
    expect((await remove(t.id, p, key)).status).toBe(200);
    for (const suffix of [`/removals/${key}`, `/removals/${key}/export`]) {
      expect(
        (await request(tagPath(t.id) + suffix, "GET", undefined, outsider))
          .status,
      ).toBe(404);
      expect((await request(tagPath(t.id, foreign.id) + suffix)).status).toBe(
        404,
      );
    }
  });
  it("rechecks membership after waiting for the shared workspace lock", async () => {
    const t = await tag(),
      p = await preview(t.id, 1, editor),
      member = await db.membership.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId: ws, userId: editor.id } },
      });
    let locked!: () => void, release!: () => void;
    const hasLock = new Promise<void>((r) => (locked = r)),
      gate = new Promise<void>((r) => (release = r));
    const revoke = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${ws} FOR UPDATE`;
      locked();
      await gate;
      await tx.membership.delete({ where: { id: member.id } });
    });
    await hasLock;
    const pending = remove(t.id, p, randomUUID(), editor);
    await new Promise((r) => setTimeout(r, 150));
    release();
    await revoke;
    try {
      expect((await pending).status).toBe(404);
      expect(
        (await db.workspaceTag.findUniqueOrThrow({ where: { id: t.id } }))
          .archivedAt,
      ).toBeNull();
    } finally {
      await db.membership.create({
        data: { workspaceId: ws, userId: editor.id, role: "editor" },
      });
    }
  });
  it("refuses more than 500 affected tasks without partial preview/removal or hidden continuation", async () => {
    const t = await tag(),
      ids = Array.from({ length: 501 }, () => randomUUID());
    await db.task.createMany({
      data: ids.map((id) => ({
        id,
        workspaceId: ws,
        title: "Bounded usage",
        status: "todo",
      })),
    });
    await db.taskTag.createMany({
      data: ids.map((taskId) => ({ workspaceId: ws, taskId, tagId: t.id })),
    });
    const before = await snapshot(),
      r = await request(tagPath(t.id) + "/removal-preview", "POST", {
        revision: 1,
      });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("more than 500");
    expect(await snapshot()).toEqual(before);
    await db.taskTag.delete({
      where: {
        workspaceId_taskId_tagId: {
          workspaceId: ws,
          taskId: ids[0],
          tagId: t.id,
        },
      },
    });
    const p = await preview(t.id);
    expect(p.rows).toHaveLength(500);
    const removed = await remove(t.id, p);
    expect(removed.status).toBe(200);
    expect(await db.taskTag.count({ where: { tagId: t.id } })).toBe(0);
    expect(
      await db.workActivity.count({
        where: { taskId: { in: ids }, action: "tag_removed" },
      }),
    ).toBe(500);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: ids[0] } })).revision,
    ).toBe(1);
  });
  it("returns a newer saved task before validating stale retired tag selections, keeping revision review explicit", async () => {
    const t = await tag(),
      a = await task([t.id]);
    expect((await remove(t.id, await preview(t.id))).status).toBe(200);
    const body = {
        title: a.title,
        description: "Retained stale input",
        status: a.status,
        revision: 1,
        tagIds: [t.id],
      },
      r = await request(`/api/workspaces/${ws}/tasks/${a.id}`, "PATCH", body);
    expect(r.status).toBe(409);
    expect((await r.json()).current).toMatchObject({
      revision: 2,
      tags: [],
      description: "",
    });
    expect(
      (
        await request(`/api/workspaces/${ws}/tasks/${a.id}`, "PATCH", {
          ...body,
          revision: 2,
        })
      ).status,
    ).toBe(400);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: a.id } })).revision,
    ).toBe(2);
  });
  it("paginates retained removal reports without hiding earlier operations or mixing tag identities", async () => {
    const t = await tag(),
      keys: string[] = [];
    for (let i = 0; i < 21; i++) {
      const current = await db.workspaceTag.findUniqueOrThrow({
          where: { id: t.id },
        }),
        key = randomUUID();
      expect(
        (await remove(t.id, await preview(t.id, current.revision), key)).status,
      ).toBe(200);
      keys.push(key);
      if (i < 20) await restoreDefinition(t.id);
    }
    const first = await (await request(tagPath(t.id) + "/removals")).json();
    expect(first.rows).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    const second = await (
      await request(tagPath(t.id) + "/removals?cursor=" + first.nextCursor)
    ).json();
    expect(second.rows).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(
      [...first.rows, ...second.rows].map((r: { id: string }) => r.id).sort(),
    ).toEqual(keys.sort());
  });
});
