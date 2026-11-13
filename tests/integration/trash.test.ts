import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { testDB as db } from "../database";
const origin = "http://127.0.0.1:3113";
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
    { name: "Trash fixture", email, password: randomUUID() + randomUUID() },
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
async function block(assignment: { projectId?: string; taskId?: string }) {
  const key = randomUUID();
  const payload = {
    requestKey: key,
    label: "Keep reservation",
    assignment: {
      projectId: assignment.projectId ?? null,
      taskId: assignment.taskId ?? null,
    },
    schedule: {
      startAt: "2030-06-03T14:00:23.123Z",
      endAt: "2030-06-03T15:00:23.456Z",
      timeZone: "UTC",
    },
  };
  return {
    record: await create(`/api/workspaces/${ws}/time-blocks`, payload),
    payload,
  };
}
const events = () =>
  request(
    `/api/workspaces/${ws}/time-blocks?start=2030-06-01T00%3A00Z&end=2030-06-10T00%3A00Z`,
  ).then((response) => response.json());
beforeAll(async () => {
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3113",
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
    name: "Trash HTTP fixture",
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
describe("canonical workspace Trash", () => {
  it("enforces membership, account and Origin boundaries for reads, previews, moves and restores", async () => {
    const { project } = await fixture();
    const impact = await preview("project", project.id);
    const payload = {
      kind: "project",
      id: project.id,
      impactDigest: impact.impactDigest,
      requestKey: randomUUID(),
    };
    const root = `/api/workspaces/${ws}/trash`;
    expect((await request(root, "GET", undefined, outsider)).status).toBe(404);
    expect(
      (
        await request(
          root + "/preview",
          "POST",
          { kind: "project", id: project.id },
          outsider,
        )
      ).status,
    ).toBe(404);
    expect((await request(root, "POST", payload, outsider)).status).toBe(404);
    expect(
      (await request(root, "POST", payload, { id: "", email: "", cookie: "" }))
        .status,
    ).toBe(401);
    expect(
      (
        await request(root, "POST", payload, owner, {
          origin: "https://foreign.invalid",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(root, "POST", payload, editor, {
          "X-Kanbrik-Account": owner.id,
        })
      ).status,
    ).toBe(412);
    expect(
      (await request(root, "POST", { ...payload, actorId: owner.id })).status,
    ).toBe(400);
    expect(
      (
        await request(`/api/workspaces/${personal}/trash/preview`, "POST", {
          kind: "project",
          id: project.id,
        })
      ).status,
    ).toBe(404);
    const moved = await move("project", project.id, editor);
    expect(
      (await request(`${root}/${moved.batch.id}`, "GET", undefined, outsider))
        .status,
    ).toBe(404);
    expect((await restore(moved.batch.id, 1, outsider)).status).toBe(404);
    expect(
      (await request(`/api/workspaces/${personal}/trash/${moved.batch.id}`))
        .status,
    ).toBe(404);
    const detail = await request(
      `${root}/${moved.batch.id}`,
      "GET",
      undefined,
      editor,
    );
    expect(detail.headers.get("cache-control")).toBe("no-store");
    expect((await detail.json()).tasks).toHaveLength(2);
    expect((await restore(moved.batch.id, 1, editor)).status).toBe(200);
  });
  it("keeps prior child batches separate, rejects missing prerequisites and restores original IDs/statuses", async () => {
    const { project, parent, child } = await fixture();
    const childBatch = await move("task", child.id);
    const projectBatch = await move("project", project.id);
    expect(projectBatch.impact).toMatchObject({
      projectCount: 1,
      taskCount: 1,
      subtaskCount: 0,
    });
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: child.id } }))
        .trashBatchId,
    ).toBe(childBatch.batch.id);
    const denied = await restore(childBatch.batch.id);
    expect(denied.status).toBe(409);
    expect((await denied.json()).current.requires).toBe(projectBatch.batch.id);
    expect((await restore(projectBatch.batch.id)).status).toBe(200);
    expect(
      (await request(`/api/workspaces/${ws}/tasks/${child.id}`)).status,
    ).toBe(404);
    expect((await restore(childBatch.batch.id)).status).toBe(200);
    expect(
      await (await request(`/api/workspaces/${ws}/tasks/${parent.id}`)).json(),
    ).toMatchObject({
      id: parent.id,
      projectId: project.id,
      parentId: null,
      status: "blocked",
      description: "Parent text",
      revision: 3,
    });
    expect(
      await (await request(`/api/workspaces/${ws}/tasks/${child.id}`)).json(),
    ).toMatchObject({
      id: child.id,
      projectId: project.id,
      parentId: parent.id,
      status: "done",
      revision: 3,
    });
  });
  it("hides active subtree reads/selectors and rejects stale writes and new scheduling to trashed work", async () => {
    const { project, parent, child } = await fixture();
    const moved = await move("project", project.id);
    expect(
      (await request(`/api/workspaces/${ws}/projects/${project.id}`)).status,
    ).toBe(404);
    for (const id of [parent.id, child.id]) {
      expect((await request(`/api/workspaces/${ws}/tasks/${id}`)).status).toBe(
        404,
      );
      expect(
        (
          await request(`/api/workspaces/${ws}/tasks/${id}`, "PATCH", {
            title: "Stale",
            description: "Stale",
            status: "todo",
            revision: 1,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await request(`/api/workspaces/${ws}/tasks/${id}/status`, "PATCH", {
            status: "done",
            revision: 1,
          })
        ).status,
      ).toBe(404);
    }
    expect(
      (await (await request(`/api/workspaces/${ws}/projects`)).json()).some(
        (row: { id: string }) => row.id === project.id,
      ),
    ).toBe(false);
    expect(
      (await (await request(`/api/workspaces/${ws}/tasks`)).json()).some(
        (row: { id: string }) => [parent.id, child.id].includes(row.id),
      ),
    ).toBe(false);
    expect(
      (
        await request(`/api/workspaces/${ws}/tasks`, "POST", {
          title: "New",
          projectId: project.id,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/workspaces/${ws}/tasks`, "POST", {
          title: "New",
          parentId: parent.id,
        })
      ).status,
    ).toBe(404);
    const payload = {
      requestKey: randomUUID(),
      label: "Rejected",
      assignment: { projectId: null, taskId: child.id },
      schedule: {
        startAt: "2030-06-03T14:00Z",
        endAt: "2030-06-03T15:00Z",
        timeZone: "UTC",
      },
    };
    expect(
      (await request(`/api/workspaces/${ws}/time-blocks`, "POST", payload))
        .status,
    ).toBe(404);
    expect((await restore(moved.batch.id)).status).toBe(200);
    expect(
      (
        await request(`/api/workspaces/${ws}/tasks/${parent.id}`, "PATCH", {
          title: "Old edit",
          description: "Old",
          status: "done",
          revision: 1,
        })
      ).status,
    ).toBe(409);
  });
  it("preserves scheduled intervals and intent payloads, permits retention/clearing, and never recreates removed/reassigned blocks", async () => {
    const { project, parent, child } = await fixture();
    const kept = await block({ taskId: child.id }),
      removed = await block({ projectId: project.id }),
      reassigned = await block({ taskId: parent.id });
    const ledger = await db.calendarCreateIntent.findUniqueOrThrow({
      where: {
        workspaceId_requestKey: {
          workspaceId: ws,
          requestKey: kept.payload.requestKey,
        },
      },
    });
    const original = await db.timeBlock.findUniqueOrThrow({
      where: { id: kept.record.id },
    });
    const moved = await move("project", project.id);
    const current = (await events()).find(
      (row: { id: string }) => row.id === kept.record.id,
    );
    expect(current).toMatchObject({
      workInTrash: true,
      taskId: child.id,
      revision: 1,
      startAt: kept.record.startAt,
      endAt: kept.record.endAt,
    });
    expect(
      await db.timeBlock.findUniqueOrThrow({ where: { id: kept.record.id } }),
    ).toEqual(original);
    expect(
      await db.calendarCreateIntent.findUniqueOrThrow({
        where: {
          workspaceId_requestKey: {
            workspaceId: ws,
            requestKey: kept.payload.requestKey,
          },
        },
      }),
    ).toEqual(ledger);
    const replay = await request(
      `/api/workspaces/${ws}/time-blocks`,
      "POST",
      kept.payload,
    );
    expect(replay.status).toBe(201);
    expect((await replay.json()).id).toBe(kept.record.id);
    expect(
      (
        await request(
          `/api/workspaces/${ws}/time-blocks/${kept.record.id}`,
          "PATCH",
          {
            revision: 1,
            changes: {
              label: "Retained reservation",
              assignment: { taskId: child.id, projectId: null },
            },
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/workspaces/${ws}/time-blocks/${removed.record.id}`,
          "DELETE",
          { revision: 1 },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/workspaces/${ws}/time-blocks/${reassigned.record.id}`,
          "PATCH",
          {
            revision: 1,
            changes: { assignment: { projectId: null, taskId: null } },
          },
        )
      ).status,
    ).toBe(200);
    expect((await restore(moved.batch.id)).status).toBe(200);
    expect(
      (await events()).find((row: { id: string }) => row.id === kept.record.id),
    ).toMatchObject({
      workInTrash: false,
      taskId: child.id,
      label: "Retained reservation",
      revision: 2,
    });
    expect(
      await db.timeBlock.findUnique({ where: { id: removed.record.id } }),
    ).toBeNull();
    expect(
      (
        await db.timeBlock.findUniqueOrThrow({
          where: { id: reassigned.record.id },
        })
      ).taskId,
    ).toBeNull();
    expect(
      (
        await request(
          `/api/workspaces/${ws}/time-blocks`,
          "POST",
          removed.payload,
        )
      ).status,
    ).toBe(404);
  });
  it("rejects scope changes after preview rather than including newly created or edited descendants", async () => {
    const { project, parent, child } = await fixture();
    const impact = await preview("project", project.id),
      key = randomUUID();
    await create(`/api/workspaces/${ws}/tasks`, {
      title: "Late child",
      parentId: parent.id,
    });
    const conflict = await request(`/api/workspaces/${ws}/trash`, "POST", {
      kind: "project",
      id: project.id,
      impactDigest: impact.impactDigest,
      requestKey: key,
    });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).current.subtaskCount).toBe(2);
    expect(
      await db.trashBatch.findUnique({
        where: { workspaceId_id: { workspaceId: ws, id: key } },
      }),
    ).toBeNull();
    const newer = await preview("task", parent.id);
    expect(
      (
        await request(
          `/api/workspaces/${ws}/tasks/${child.id}/status`,
          "PATCH",
          { status: "todo", revision: 1 },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/api/workspaces/${ws}/trash`, "POST", {
          kind: "task",
          id: parent.id,
          impactDigest: newer.impactDigest,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
        .deletedAt,
    ).toBeNull();
  });
  it("includes linked-block revisions in confirmation and rejects changing one after preview", async () => {
    const { project } = await fixture();
    const impact = await preview("project", project.id);
    const linked = await block({ projectId: project.id });
    const payload = {
      kind: "project",
      id: project.id,
      requestKey: randomUUID(),
      impactDigest: impact.impactDigest,
    };
    expect(
      (await request(`/api/workspaces/${ws}/trash`, "POST", payload)).status,
    ).toBe(409);
    const next = await preview("project", project.id);
    expect(
      (
        await request(
          `/api/workspaces/${ws}/time-blocks/${linked.record.id}`,
          "PATCH",
          { revision: 1, changes: { label: "Edited reservation" } },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/api/workspaces/${ws}/trash`, "POST", {
          ...payload,
          impactDigest: next.impactDigest,
        })
      ).status,
    ).toBe(409);
  });
  it("reconciles concurrent move/restore retries exactly once and old restore replays do not undo later Trash", async () => {
    const { parent, child } = await fixture();
    const impact = await preview("task", parent.id),
      payload = {
        kind: "task",
        id: parent.id,
        requestKey: randomUUID(),
        impactDigest: impact.impactDigest,
      };
    const results = await Promise.all(
      [1, 2].map(() => request(`/api/workspaces/${ws}/trash`, "POST", payload)),
    );
    expect(results.map((row) => row.status)).toEqual([200, 200]);
    const bodies = await Promise.all(results.map((row) => row.json()));
    expect(bodies.filter((row) => row.replayed)).toHaveLength(1);
    expect(
      await db.trashBatch.count({
        where: { workspaceId: ws, id: payload.requestKey },
      }),
    ).toBe(1);
    const restores = await Promise.all([
      restore(payload.requestKey),
      restore(payload.requestKey),
    ]);
    expect(restores.map((row) => row.status)).toEqual([200, 200]);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: child.id } })).revision,
    ).toBe(3);
    const again = await move("task", parent.id);
    expect((await restore(payload.requestKey)).status).toBe(200);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: parent.id } }))
        .trashBatchId,
    ).toBe(again.batch.id);
    expect(
      (
        await request(`/api/workspaces/${ws}/trash`, "POST", {
          ...payload,
          id: child.id,
        })
      ).status,
    ).toBe(409);
  });
  it("rejects stale batch/member revisions without partially restoring a group", async () => {
    const { project, parent } = await fixture();
    const moved = await move("project", project.id);
    expect((await restore(moved.batch.id, 9)).status).toBe(409);
    await db.task.update({
      where: { id: parent.id },
      data: { revision: { increment: 1 } },
    });
    expect((await restore(moved.batch.id)).status).toBe(409);
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
        .trashBatchId,
    ).toBe(moved.batch.id);
    expect(
      (
        await db.trashBatch.findUniqueOrThrow({
          where: { workspaceId_id: { workspaceId: ws, id: moved.batch.id } },
        })
      ).restoredAt,
    ).toBeNull();
  });
  it("enforces lifecycle ownership and active-ancestor/new-assignment invariants in PostgreSQL", async () => {
    const { project, parent, child } = await fixture();
    const moved = await move("project", project.id);
    await expect(
      db.task.create({
        data: {
          workspaceId: ws,
          projectId: project.id,
          title: "Cannot create under Trash",
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.task.update({
        where: { id: child.id },
        data: { deletedAt: null, trashBatchId: null },
      }),
    ).rejects.toThrow();
    await expect(
      db.timeBlock.create({
        data: {
          workspaceId: ws,
          projectId: project.id,
          label: "Cannot assign Trash",
          startAt: new Date("2030-01-01T10:00Z"),
          endAt: new Date("2030-01-01T11:00Z"),
          timeZone: "UTC",
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.task.update({
        where: { id: parent.id },
        data: { trashBatchId: "foreign-batch" },
      }),
    ).rejects.toThrow();
    expect((await restore(moved.batch.id)).status).toBe(200);
  });
  it("rolls back batch creation and all subtree rows on a fixture-scoped Trash failure", async () => {
    const { project, parent } = await fixture();
    const impact = await preview("project", project.id),
      key = randomUUID();
    const name = "trash_fail_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."id" = '${parent.id}' AND NEW."deletedAt" IS NOT NULL THEN RAISE EXCEPTION 'Owned fixture failure'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER ${name} BEFORE UPDATE ON "Task" FOR EACH ROW EXECUTE FUNCTION ${name}()`,
    );
    try {
      expect(
        (
          await request(`/api/workspaces/${ws}/trash`, "POST", {
            kind: "project",
            id: project.id,
            impactDigest: impact.impactDigest,
            requestKey: key,
          })
        ).status,
      ).toBe(503);
      expect(
        (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
          .revision,
      ).toBe(1);
      expect(
        (await db.task.findUniqueOrThrow({ where: { id: parent.id } }))
          .deletedAt,
      ).toBeNull();
      expect(
        await db.trashBatch.findUnique({
          where: { workspaceId_id: { workspaceId: ws, id: key } },
        }),
      ).toBeNull();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${name} ON "Task"`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
    }
  });
  it("rolls back every row and batch revision on a fixture-scoped Restore failure", async () => {
    const { project, parent } = await fixture();
    const moved = await move("project", project.id);
    const name = "restore_fail_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."id" = '${parent.id}' AND NEW."deletedAt" IS NULL THEN RAISE EXCEPTION 'Owned fixture failure'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER ${name} BEFORE UPDATE ON "Task" FOR EACH ROW EXECUTE FUNCTION ${name}()`,
    );
    try {
      expect((await restore(moved.batch.id)).status).toBe(503);
      expect(
        (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
          .trashBatchId,
      ).toBe(moved.batch.id);
      expect(
        (await db.task.findUniqueOrThrow({ where: { id: parent.id } }))
          .revision,
      ).toBe(2);
      expect(
        (
          await db.trashBatch.findUniqueOrThrow({
            where: { workspaceId_id: { workspaceId: ws, id: moved.batch.id } },
          })
        ).revision,
      ).toBe(1);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${name} ON "Task"`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
    }
  });
  it("rechecks an editor's membership after waiting behind removal for a Trash mutation", async () => {
    const { project } = await fixture();
    const impact = await preview("project", project.id),
      key = randomUUID();
    let release!: () => void, locked!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      lockReady = new Promise<void>((resolve) => {
        locked = resolve;
      });
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${ws} FOR UPDATE`;
        locked();
        await gate;
        await tx.membership.delete({
          where: { workspaceId_userId: { workspaceId: ws, userId: editor.id } },
        });
      },
      { timeout: 15000 },
    );
    await lockReady;
    const pending = request(
      `/api/workspaces/${ws}/trash`,
      "POST",
      {
        kind: "project",
        id: project.id,
        requestKey: key,
        impactDigest: impact.impactDigest,
      },
      editor,
    );
    try {
      let waiting = false;
      for (let i = 0; i < 60; i++) {
        const rows = await db.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%Workspace%FOR UPDATE%'`;
        if (rows[0].count > 0) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
    } finally {
      release();
    }
    await blocker;
    expect((await pending).status).toBe(404);
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: project.id } }))
        .deletedAt,
    ).toBeNull();
    expect(
      await db.trashBatch.findUnique({
        where: { workspaceId_id: { workspaceId: ws, id: key } },
      }),
    ).toBeNull();
  });
});
