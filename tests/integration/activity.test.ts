import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { testDB as db } from "../database";
const origin = "http://127.0.0.1:3116";
let server: ChildProcess;
const users: string[] = [],
  workspaces: string[] = [];
type Actor = { id: string; email: string; cookie: string };
let owner: Actor, editor: Actor, outsider: Actor, ws: string, personal: string;
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
  const response = await request(path, "POST", body, actor);
  expect(response.status).toBe(201);
  return response.json();
}
async function account(): Promise<Actor> {
  const email = randomUUID() + "@example.invalid";
  const response = await request(
    "/api/auth/sign-up/email",
    "POST",
    { name: "Activity fixture", email, password: randomUUID() + randomUUID() },
    { id: "", email: "", cookie: "" },
  );
  expect(response.status).toBe(200);
  const user = (await response.json()).user;
  users.push(user.id);
  return {
    id: user.id,
    email,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  };
}
async function fixture() {
  const project = await create(`/api/workspaces/${ws}/projects`, {
    title: randomUUID(),
    description: "Project text",
  });
  const parent = await create(`/api/workspaces/${ws}/tasks`, {
    title: "Parent",
    projectId: project.id,
    status: "blocked",
    description: "Parent text",
  });
  const child = await create(`/api/workspaces/${ws}/tasks`, {
    title: "Child",
    parentId: parent.id,
    status: "done",
    description: "Child text",
  });
  return { project, parent, child };
}
async function preview(kind: "project" | "task", id: string, actor = owner) {
  const response = await request(
    `/api/workspaces/${ws}/trash/preview`,
    "POST",
    { kind, id },
    actor,
  );
  expect(response.status).toBe(200);
  return response.json();
}
async function move(kind: "project" | "task", id: string, actor = owner) {
  const impact = await preview(kind, id, actor);
  const payload = {
    kind,
    id,
    impactDigest: impact.impactDigest,
    requestKey: randomUUID(),
  };
  const response = await request(
    `/api/workspaces/${ws}/trash`,
    "POST",
    payload,
    actor,
  );
  expect(response.status).toBe(200);
  return { ...(await response.json()), payload, impact };
}
const restore = (id: string, revision = 1, actor = owner) =>
  request(
    `/api/workspaces/${ws}/trash/${id}/restore`,
    "POST",
    { revision },
    actor,
  );
beforeAll(async () => {
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3116",
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
    } catch {
      /* starting */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  expect(ready).toBe(true);
  owner = await account();
  editor = await account();
  outsider = await account();
  const bootstrap = await request("/api/workspaces/personal", "POST", {});
  expect(bootstrap.status).toBe(200);
  personal = (await bootstrap.json()).id;
  const workspace = await create("/api/workspaces", {
    name: "Activity HTTP fixture",
  });
  ws = workspace.id;
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

const pathFor = (kind: "projects" | "tasks", id: string, workspace = ws) =>
  `/api/workspaces/${workspace}/${kind}/${id}`;
async function comment(base: string, text = "Original comment", actor = owner) {
  const payload = { text, requestKey: randomUUID() };
  const saved = await create(base + "/comments", payload, actor);
  return { ...saved.comment, payload };
}
async function list(base: string, kind = "history", query = "") {
  const response = await request(base + "/" + kind + query);
  expect(response.status).toBe(200);
  return response.json();
}
describe("work comments and transactional activity", () => {
  it("records actual project/task/subtask changes, Board status, and no-op boundaries without bumping work for comments", async () => {
    const { project, parent, child } = await fixture();
    for (const [kind, row] of [
      ["projects", project],
      ["tasks", parent],
      ["tasks", child],
    ] as const) {
      const base = pathFor(kind, row.id);
      const created = await list(base);
      expect(created.hasCreationEvent).toBe(true);
      expect(created.items).toHaveLength(1);
      expect(created.items[0]).toMatchObject({
        action: "work_created",
        actor: { name: "Activity fixture", available: true },
        workRevision: 1,
      });
      const c = await comment(base);
      const noOp = await request(base + "/comments/" + c.id, "PATCH", {
        text: c.text,
        revision: 1,
      });
      expect(noOp.status).toBe(200);
      expect((await noOp.json()).changed).toBe(false);
      const work =
        kind === "projects"
          ? await db.project.findFirst({ where: { id: row.id } })
          : await db.task.findFirst({ where: { id: row.id } });
      expect(work?.revision).toBe(1);
      expect(work?.updatedAt.toISOString()).toBe(row.updatedAt);
      const edit = await request(base + "/comments/" + c.id, "PATCH", {
        text: "Edited comment",
        revision: 1,
      });
      expect(edit.status).toBe(200);
      const edited = (await edit.json()).comment;
      expect(edited.createdAt).toBe(c.createdAt);
      expect(edited.revision).toBe(2);
      expect(edited.editedAt).toBeTruthy();
      const retry = await create(base + "/comments", c.payload);
      expect(retry.replayed).toBe(true);
      expect(retry.comment).toEqual(edited);
      const unchanged = await request(base + "/comments/" + c.id, "PATCH", {
        text: edited.text,
        revision: 2,
      });
      expect(unchanged.status).toBe(200);
      expect(await unchanged.json()).toEqual({
        comment: edited,
        changed: false,
      });
      const stale = await request(base + "/comments/" + c.id, "PATCH", {
        text: "Other edit",
        revision: 1,
      });
      expect(stale.status).toBe(409);
      expect((await stale.json()).current).toEqual(edited);
      expect(
        (
          await request(base, "PATCH", {
            title: row.title,
            description: row.description,
            ...(kind === "tasks" ? { status: row.status } : {}),
            revision: 1,
          })
        ).status,
      ).toBe(200);
      expect((await list(base)).items).toHaveLength(3);
      expect(
        (
          await request(base, "PATCH", {
            title: "Changed title",
            description: "Changed description",
            ...(kind === "tasks" ? { status: row.status } : {}),
            revision: 1,
          })
        ).status,
      ).toBe(200);
      const changed = (await list(base)).items;
      expect(changed).toHaveLength(4);
      expect(
        changed.find((r: { action: string }) => r.action === "comment_edited")
          .changes,
      ).toEqual([{ field: "text", before: c.text, after: "Edited comment" }]);
      expect(changed[0].changes).toEqual([
        { field: "title", before: row.title, after: "Changed title" },
        {
          field: "description",
          before: row.description,
          after: "Changed description",
        },
      ]);
      expect(JSON.stringify(changed)).not.toMatch(
        /password|cookie|token|authorId|actorId|eventKey|requestKey/,
      );
    }
    const base = pathFor("tasks", parent.id);
    expect(
      (
        await request(base + "/status", "PATCH", {
          status: "done",
          revision: 2,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(base + "/status", "PATCH", {
          status: "done",
          revision: 3,
        })
      ).status,
    ).toBe(200);
    const history = await list(base);
    expect(
      history.items.filter(
        (r: { action: string }) => r.action === "status_changed",
      ),
    ).toHaveLength(1);
    expect(history.items[0].changes).toEqual([
      { field: "status", before: "blocked", after: "done",beforeLabel:"Blocked",afterLabel:"Done" },
    ]);
  });
  it("authorizes every read/write/cursor, rejects forged fields, obsolete accounts and foreign Origins", async () => {
    const { project, parent } = await fixture(),
      base = pathFor("projects", project.id);
    const c = await comment(base),
      other = await comment(pathFor("tasks", parent.id));
    for (const suffix of [
      "/comments",
      "/history",
      "/comments?cursor=" + other.id,
    ])
      expect(
        (await request(base + suffix, "GET", undefined, outsider)).status,
      ).toBe(404);
    expect(
      (await request(base + "/comments", "POST", c.payload, outsider)).status,
    ).toBe(404);
    expect(
      (
        await request(
          base + "/comments/" + c.id,
          "PATCH",
          { text: "Steal", revision: 1 },
          editor,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(base + "/comments", "POST", {
          text: "x",
          requestKey: randomUUID(),
          authorId: editor.id,
        })
      ).status,
    ).toBe(400);
    for (const field of [
      "workspaceId",
      "createdAt",
      "editedAt",
      "revision",
      "actorId",
    ])
      expect(
        (
          await request(base + "/comments", "POST", {
            text: "x",
            requestKey: randomUUID(),
            [field]: "forged",
          })
        ).status,
      ).toBe(400);
    for (const text of [" ", "x".repeat(10001)])
      expect(
        (
          await request(base + "/comments", "POST", {
            text,
            requestKey: randomUUID(),
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await request(base + "/comments", "POST", c.payload, owner, {
          origin: "https://foreign.invalid",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(base + "/comments", "GET", undefined, owner, {
          "x-kanbrik-account": editor.id,
        })
      ).status,
    ).toBe(412);
    expect(
      (await request(pathFor("projects", project.id, personal) + "/history"))
        .status,
    ).toBe(404);
    expect((await request(base + "/comments?cursor=" + other.id)).status).toBe(
      404,
    );
    const otherHistory = await list(pathFor("tasks", parent.id));
    expect(
      (await request(base + "/history?cursor=" + otherHistory.items[0].id))
        .status,
    ).toBe(404);
    expect((await request(base + "/history?limit=51")).status).toBe(400);
    expect(
      (
        await request(base + "/comments", "POST", {
          ...c.payload,
          text: "different original",
        })
      ).status,
    ).toBe(400);
    expect(
      (await request(base + "/comments", "POST", c.payload, editor)).status,
    ).toBe(400);
    const read = await request(base + "/comments", "GET", undefined, editor);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect((await read.json()).items[0].author.isYou).toBe(false);
  });
  it("retains comments/history through subtree Trash/Restore and reconciles create replays without duplicate activity", async () => {
    const { project, parent, child } = await fixture();
    const bases = [
      pathFor("projects", project.id),
      pathFor("tasks", parent.id),
      pathFor("tasks", child.id),
    ];
    const comments = await Promise.all(bases.map((base) => comment(base)));
    const result = await move("project", project.id);
    for (let i = 0; i < bases.length; i++) {
      const base = bases[i],
        c = comments[i];
      expect((await list(base, "comments")).readOnly).toBe(true);
      expect(
        (
          await request(base + "/comments", "POST", {
            text: "New",
            requestKey: randomUUID(),
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await request(base + "/comments/" + c.id, "PATCH", {
            text: "New",
            revision: 1,
          })
        ).status,
      ).toBe(409);
      expect((await create(base + "/comments", c.payload)).replayed).toBe(true);
      const event = (await list(base)).items[0];
      expect(event).toMatchObject({
        action: "work_trashed",
        operationId: result.batch.id,
        operationTitle: project.title,
        cascade: i > 0,
      });
    }
    expect((await restore(result.batch.id)).status).toBe(200);
    expect((await restore(result.batch.id)).status).toBe(200);
    for (let i = 0; i < bases.length; i++) {
      const data = await list(bases[i], "comments");
      expect(data.readOnly).toBe(false);
      expect(data.items).toHaveLength(1);
      expect(data.items[0]).toMatchObject({
        id: comments[i].id,
        createdAt: comments[i].createdAt,
        editedAt: null,
      });
      const events = (await list(bases[i])).items;
      expect(
        events.filter((r: { action: string }) => r.action === "work_restored"),
      ).toHaveLength(1);
      expect(events).toHaveLength(4);
    }
  });
  it("pages equal-timestamp records stably and labels genuinely pre-feature work", async () => {
    const old = await db.project.create({
      data: { workspaceId: ws, title: "Legacy", revision: 7 },
    });
    const base = pathFor("projects", old.id),
      now = new Date("2030-11-03T09:30:00Z");
    for (let i = 0; i < 6; i++) {
      const id = randomUUID();
      await db.workComment.create({
        data: {
          id,
          workspaceId: ws,
          projectId: old.id,
          authorId: owner.id,
          authorName: "Older member",
          requestKey: randomUUID(),
          text: "Page " + i,
          createText: "Page " + i,
          createdAt: now,
        },
      });
      await db.workActivity.create({
        data: {
          workspaceId: ws,
          projectId: old.id,
          actorId: owner.id,
          actorName: "Older member",
          occurredAt: now,
          action: "comment_created",
          eventKey: id,
          commentId: id,
          commentRevision: 1,
          changes: [{ field: "text", before: null, after: "Page " + i }],
        },
      });
    }
    for (const kind of ["comments", "history"]) {
      const ids: string[] = [];
      let cursor = "";
      do {
        const page = await list(
          base,
          kind,
          "?limit=2" + (cursor ? "&cursor=" + cursor : ""),
        );
        expect(page.hasCreationEvent).toBe(false);
        expect(page.availableSince).toBeTruthy();
        ids.push(...page.items.map((r: { id: string }) => r.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(ids).toHaveLength(6);
      expect(new Set(ids).size).toBe(6);
      expect(ids).toEqual(
        [...ids].sort((a, b) =>
          kind === "comments" ? a.localeCompare(b) : b.localeCompare(a),
        ),
      );
    }
  });
  it("rolls back work, comments and lifecycle rows when inserting their event fails", async () => {
    const { project } = await fixture(),
      base = pathFor("projects", project.id),
      c = await comment(base);
    const name = "activity_fail_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId" = '${ws}' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER ${name} BEFORE INSERT ON "WorkActivity" FOR EACH ROW EXECUTE FUNCTION ${name}()`,
    );
    const before = await db.project.findUniqueOrThrow({
        where: { id: project.id },
      }),
      count = await db.workActivity.count({ where: { workspaceId: ws } });
    try {
      expect(
        (
          await request(base, "PATCH", {
            title: "Must roll back",
            description: project.description,
            revision: 1,
          })
        ).status,
      ).toBe(503);
      expect(
        (
          await request(base + "/comments", "POST", {
            text: "Rollback new",
            requestKey: randomUUID(),
          })
        ).status,
      ).toBe(503);
      expect(
        (
          await request(base + "/comments/" + c.id, "PATCH", {
            text: "Rollback edit",
            revision: 1,
          })
        ).status,
      ).toBe(503);
      const impact = await preview("project", project.id);
      expect(
        (
          await request(`/api/workspaces/${ws}/trash`, "POST", {
            kind: "project",
            id: project.id,
            impactDigest: impact.impactDigest,
            requestKey: randomUUID(),
          })
        ).status,
      ).toBe(503);
      expect(
        await db.project.findUniqueOrThrow({ where: { id: project.id } }),
      ).toEqual(before);
      expect(
        (await db.workComment.findUniqueOrThrow({ where: { id: c.id } })).text,
      ).toBe(c.text);
      expect(
        await db.workComment.count({
          where: { workspaceId: ws, projectId: project.id },
        }),
      ).toBe(1);
      expect(await db.workActivity.count({ where: { workspaceId: ws } })).toBe(
        count,
      );
      expect(
        await db.trashBatch.count({
          where: { workspaceId: ws, rootId: project.id },
        }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${name} ON "WorkActivity"`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
    }
  });
  it("enforces immutable scope/attribution and append-only history while retaining safe former-account display", async () => {
    const { project, parent } = await fixture(),
      base = pathFor("projects", project.id),
      c = await comment(base);
    const event = await db.workActivity.findFirstOrThrow({
      where: { commentId: c.id },
    });
    for (const data of [
      { authorName: "Forged" },
      { createdAt: new Date(0) },
      { taskId: parent.id },
      { requestKey: randomUUID() },
      { authorId: editor.id },
    ])
      await expect(
        db.workComment.update({ where: { id: c.id }, data }),
      ).rejects.toThrow();
    await expect(
      db.workComment.delete({ where: { id: c.id } }),
    ).rejects.toThrow();
    await expect(
      db.workActivity.update({
        where: { id: event.id },
        data: { actorName: "Forged" },
      }),
    ).rejects.toThrow();
    await expect(
      db.workActivity.delete({ where: { id: event.id } }),
    ).rejects.toThrow();
    await expect(
      db.workActivity.create({
        data: {
          workspaceId: ws,
          taskId: parent.id,
          actorName: "Forged",
          eventKey: randomUUID(),
          action: "comment_created",
          commentId: c.id,
          commentRevision: 1,
          changes: [{ field: "text", before: null, after: "x" }],
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.workComment.create({
        data: {
          workspaceId: ws,
          projectId: project.id,
          taskId: parent.id,
          authorName: "Invalid",
          requestKey: randomUUID(),
          createText: "x",
          text: "x",
        },
      }),
    ).rejects.toThrow();
    const foreign = await db.project.create({
      data: { workspaceId: personal, title: "Personal scope" },
    });
    await expect(
      db.workComment.create({
        data: {
          workspaceId: ws,
          projectId: foreign.id,
          authorName: "Invalid",
          requestKey: randomUUID(),
          createText: "x",
          text: "x",
        },
      }),
    ).rejects.toThrow();
    const former = await account();
    expect(
      (
        await request(`/api/workspaces/${ws}/members`, "POST", {
          email: former.email,
        })
      ).status,
    ).toBe(200);
    const old = await comment(base, "Survives account removal", former);
    await db.user.delete({ where: { id: former.id } });
    const after = (await list(base, "comments")).items.find(
      (r: { id: string }) => r.id === old.id,
    );
    expect(after.author).toEqual({
      name: "Activity fixture",
      available: false,
      isYou: false,
    });
    expect(
      (await list(base)).items.find(
        (r: { commentId: string }) => r.commentId === old.id,
      ).actor,
    ).toEqual({ name: "Activity fixture", available: false });
  });
  it("serializes simultaneous create retries and excludes scheduling from work history", async () => {
    const { project, parent } = await fixture(),
      base = pathFor("tasks", parent.id),
      payload = { text: "One logical post", requestKey: randomUUID() };
    const responses = await Promise.all([
      request(base + "/comments", "POST", payload),
      request(base + "/comments", "POST", payload),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const values = await Promise.all(responses.map((r) => r.json()));
    expect(values[0].comment.id).toBe(values[1].comment.id);
    expect((await list(base)).items).toHaveLength(2);
    const block = await create(`/api/workspaces/${ws}/time-blocks`, {
      requestKey: randomUUID(),
      label: "Schedule only",
      schedule: {
        startAt: "2030-06-03T12:00Z",
        endAt: "2030-06-03T13:00Z",
        timeZone: "UTC",
      },
      assignment: { taskId: parent.id, projectId: null },
    });
    expect(
      (
        await request(
          `/api/workspaces/${ws}/time-blocks/${block.id}`,
          "PATCH",
          { revision: 1, changes: { label: "Schedule renamed" } },
        )
      ).status,
    ).toBe(200);
    expect((await list(base)).items).toHaveLength(2);
    expect((await list(pathFor("projects", project.id))).items).toHaveLength(1);
    await expect(
      db.membership.create({
        data: { workspaceId: personal, userId: outsider.id, role: "editor" },
      }),
    ).rejects.toThrow();
    const own = await create(`/api/workspaces/${personal}/tasks`, {
      title: "Private",
    });
    expect(
      (
        await request(
          pathFor("tasks", own.id, personal) + "/comments",
          "GET",
          undefined,
          outsider,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          pathFor("tasks", own.id, personal) + "/history",
          "GET",
          undefined,
          outsider,
        )
      ).status,
    ).toBe(404);
  });
  it("rolls back Restore and its events and leaves older descendant operations separate", async () => {
    const { project, parent, child } = await fixture();
    const old = await move("task", child.id);
    const root = await move("project", project.id);
    const name = "restore_event_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId" = '${ws}' AND NEW.action='work_restored' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER ${name} BEFORE INSERT ON "WorkActivity" FOR EACH ROW EXECUTE FUNCTION ${name}()`,
    );
    const count = await db.workActivity.count({ where: { workspaceId: ws } });
    try {
      expect((await restore(root.batch.id)).status).toBe(503);
      expect(
        (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
          .deletedAt,
      ).not.toBeNull();
      expect(
        (
          await db.trashBatch.findUniqueOrThrow({
            where: { workspaceId_id: { workspaceId: ws, id: root.batch.id } },
          })
        ).restoredAt,
      ).toBeNull();
      expect(await db.workActivity.count({ where: { workspaceId: ws } })).toBe(
        count,
      );
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${name} ON "WorkActivity"`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
    }
    expect((await restore(root.batch.id)).status).toBe(200);
    expect((await list(pathFor("tasks", parent.id))).items[0].operationId).toBe(
      root.batch.id,
    );
    expect((await list(pathFor("tasks", child.id))).items[0]).toMatchObject({
      action: "work_trashed",
      operationId: old.batch.id,
    });
    expect((await restore(old.batch.id)).status).toBe(200);
    expect((await list(pathFor("tasks", child.id))).items[0]).toMatchObject({
      action: "work_restored",
      operationId: old.batch.id,
    });
  });
  it("rechecks membership after a waiting comment acquires the workspace lock", async () => {
    const { project } = await fixture(),
      base = pathFor("projects", project.id);
    const member = await db.membership.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: ws, userId: editor.id } },
    });
    let release!: () => void, locked!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      ready = new Promise<void>((r) => (locked = r));
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${ws} FOR UPDATE`;
        locked();
        await gate;
        await tx.membership.delete({ where: { id: member.id } });
      },
      { timeout: 15000 },
    );
    await ready;
    try {
      const response = request(
        base + "/comments",
        "POST",
        { text: "Should not commit", requestKey: randomUUID() },
        editor,
      );
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        const rows = await db.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Workspace%FOR UPDATE%'`;
        if (rows[0].count) {
          waiting = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 30));
      }
      expect(waiting).toBe(true);
      release();
      await blocker;
      expect((await response).status).toBe(404);
      expect(
        await db.workComment.count({ where: { projectId: project.id } }),
      ).toBe(0);
    } finally {
      release();
      await blocker;
      await db.membership.upsert({
        where: { workspaceId_userId: { workspaceId: ws, userId: editor.id } },
        update: {},
        create: { workspaceId: ws, userId: editor.id, role: "editor" },
      });
    }
  });
});
