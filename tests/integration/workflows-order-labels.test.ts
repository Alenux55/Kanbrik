import type { TaskRecord } from "../../src/lib/planning-contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { testDB as db } from "../database";
const origin = "http://127.0.0.1:3118";
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
    { name: "Workflow fixture", email, password: randomUUID() + randomUUID() },
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
      "3118",
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
    name: "Workflow HTTP fixture",
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
async function workflow(workspace = ws, actor = owner) {
  const r = await request(
    `/api/workspaces/${workspace}/workflow`,
    "GET",
    undefined,
    actor,
  );
  expect(r.status).toBe(200);
  return r.json();
}
function proposal(value: {
  revision: number;
  defaultStatusId: string;
  definitions: {
    id: string;
    name: string;
    completed: boolean;
    archivedAt: string | null;
  }[];
}) {
  return {
    revision: value.revision,
    defaultStatusId: value.defaultStatusId,
    definitions: value.definitions.map((d) => ({
      id: d.id,
      name: d.name,
      completed: d.completed,
      archived: !!d.archivedAt,
    })),
    replacements: {} as Record<string, string>,
  };
}
async function workflowPreview(input: object, workspace = ws) {
  const r = await request(
    `/api/workspaces/${workspace}/workflow/preview`,
    "POST",
    input,
  );
  expect(r.status).toBe(200);
  return r.json();
}
async function configure(input: object, workspace = ws) {
  const impact = await workflowPreview(input, workspace),
    body = {
      ...input,
      impactDigest: impact.impactDigest,
      requestKey: randomUUID(),
    },
    r = await request(`/api/workspaces/${workspace}/workflow`, "POST", body);
  expect(r.status).toBe(200);
  return { ...(await r.json()), body, impact };
}
async function orders(workspace = ws) {
  const r = await request(`/api/workspaces/${workspace}/task-order`);
  expect(r.status).toBe(200);
  return r.json() as Promise<
    { scopeKey: string; revision: number; ids: string[] }[]
  >;
}
async function taskGroup(projectId: string) {
  return (await orders()).find((s) => s.scopeKey === "project/" + projectId)!;
}
describe("workspace workflows, labels and sibling ordering", () => {
  it("bootstraps workspace defaults, enforces owner-only configuration and derives completion/defaults from metadata", async () => {
    const initial = await workflow();
    expect(initial.defaultStatusId).toBe("todo");
    expect(initial.definitions.map((d: { id: string }) => d.id)).toEqual([
      "backlog",
      "todo",
      "in_progress",
      "blocked",
      "done",
    ]);
    expect((await workflow(ws, editor)).owner).toBe(false);
    expect(
      (
        await request(
          `/api/workspaces/${ws}/workflow/preview`,
          "POST",
          proposal(initial),
          editor,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/api/workspaces/${ws}/workflow`,
          "GET",
          undefined,
          outsider,
        )
      ).status,
    ).toBe(404);
    const input = proposal(initial),
      open = randomUUID(),
      complete = randomUUID();
    input.definitions.push(
      {
        id: open,
        name: "Ready for this workspace",
        completed: false,
        archived: false,
      },
      { id: complete, name: "Delivered", completed: true, archived: false },
    );
    input.defaultStatusId = open;
    input.definitions.find((d) => d.id === "done")!.name = "Finished";
    const saved = await configure(input);
    expect(saved.workflow.revision).toBe(initial.revision + 1);
    const task = await create(`/api/workspaces/${ws}/tasks`, {
      title: "Custom default",
    });
    expect(task).toMatchObject({
      status: open,
      statusName: "Ready for this workspace",
      completed: false,
      tags: [],
    });
    const moved = await request(
      pathFor("tasks", task.id) + "/status",
      "PATCH",
      { status: complete, statusWorkspaceId: ws, revision: 1 },
    );
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({
      status: complete,
      statusName: "Delivered",
      completed: true,
    });
    expect(
      (
        await request(pathFor("tasks", task.id) + "/status", "PATCH", {
          status: complete,
          statusWorkspaceId: personal,
          revision: 2,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`/api/workspaces/${personal}/tasks`, "POST", {
          title: "Foreign custom status",
          status: complete,
        })
      ).status,
    ).toBe(400);
    await expect(
      db.task.create({
        data: {
          workspaceId: personal,
          title: "Foreign reference",
          status: complete,
        },
      }),
    ).rejects.toThrow();
    const other = await create(`/api/workspaces/${personal}/tasks`, {
      title: "Independent default",
    });
    expect(other.status).toBe("todo");
    const history = (
      await (await request(pathFor("tasks", task.id) + "/history")).json()
    ).items;
    const change = history.find(
      (e: { action: string }) => e.action === "status_changed",
    );
    expect(change.changes[0]).toMatchObject({
      before: open,
      after: complete,
      beforeLabel: "Ready for this workspace",
      afterLabel: "Delivered",
    });
    const next = proposal(await workflow());
    next.definitions.find((d) => d.id === complete)!.name = "Renamed delivery";
    await configure(next);
    const old = (
      await (await request(pathFor("tasks", task.id) + "/history")).json()
    ).items.find((e: { action: string }) => e.action === "status_changed");
    expect(old.changes[0].afterLabel).toBe("Delivered");
    expect(
      (await (await request(pathFor("tasks", task.id))).json()).completed,
    ).toBe(true);
  });
  it("confirms exact retirement impact, preserves Trash revisions and restores with explicit status resolution", async () => {
    const active = await create(`/api/workspaces/${ws}/tasks`, {
        title: "Active retirement",
        status: "backlog",
      }),
      trashed = await create(`/api/workspaces/${ws}/tasks`, {
        title: "Trashed retirement",
        status: "backlog",
      });
    const moved = await move("task", trashed.id),
      beforeTrash = await db.task.findUniqueOrThrow({
        where: { id: trashed.id },
      }),
      input = proposal(await workflow());
    input.definitions.find((d) => d.id === "backlog")!.archived = true;
    input.replacements.backlog = "todo";
    const impact = await workflowPreview(input);
    expect(impact.activeTaskCount).toBe(1);
    expect(impact.trashedTaskCount).toBe(1);
    const newTask = await create(`/api/workspaces/${ws}/tasks`, {
      title: "Joined after preview",
      status: "backlog",
    });
    expect(
      (
        await request(`/api/workspaces/${ws}/workflow`, "POST", {
          ...input,
          impactDigest: impact.impactDigest,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(409);
    const cfg = await configure(input);
    expect(cfg.impact.activeTaskCount).toBe(2);
    expect(
      await db.task.findUniqueOrThrow({ where: { id: trashed.id } }),
    ).toEqual(beforeTrash);
    for (const row of [active, newTask])
      expect(
        await (await request(pathFor("tasks", row.id))).json(),
      ).toMatchObject({ status: "todo", revision: 2 });
    const denied = await restore(moved.batch.id);
    expect(denied.status).toBe(409);
    const resolution = (await denied.json()).current.statusResolution;
    expect(resolution.requirements).toEqual([
      { statusId: "backlog", name: "Backlog", count: 1 },
    ]);
    const restored = await request(
      `/api/workspaces/${ws}/trash/${moved.batch.id}/restore`,
      "POST",
      {
        revision: 1,
        statusImpactDigest: resolution.impactDigest,
        statusReplacements: { backlog: "todo" },
      },
    );
    expect(restored.status).toBe(200);
    const current = await (await request(pathFor("tasks", trashed.id))).json();
    expect(current).toMatchObject({
      id: trashed.id,
      status: "todo",
      revision: 3,
    });
    const events = (
        await (await request(pathFor("tasks", trashed.id) + "/history")).json()
      ).items,
      restoredEvent = events.find(
        (e: { action: string }) => e.action === "work_restored",
      );
    expect(restoredEvent.changes).toHaveLength(2);
    expect(restoredEvent.changes[1]).toMatchObject({
      field: "status",
      before: "backlog",
      after: "todo",
      beforeLabel: "Backlog",
      afterLabel: "To do",
    });
    expect((await restore(moved.batch.id)).status).toBe(200);
    expect(
      await db.workActivity.count({
        where: { workspaceId: ws, taskId: trashed.id, action: "work_restored" },
      }),
    ).toBe(1);
  });
  it("reconciles workflow retries and no-ops and rolls back reassignment/configuration/event together", async () => {
    const input = proposal(await workflow());
    input.definitions.find((d) => d.id === "blocked")!.name = "Awaiting input";
    const first = await configure(input),
      later = proposal(first.workflow);
    later.definitions.find((d) => d.id === "blocked")!.name =
      "Awaiting decision";
    const second = await configure(later);
    const replay = await request(
      `/api/workspaces/${ws}/workflow`,
      "POST",
      first.body,
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      replayed: true,
      workflow: { revision: second.workflow.revision },
    });
    const count = await db.workspaceActivity.count({
        where: { workspaceId: ws },
      }),
      noOp = await configure(proposal(await workflow()));
    expect(noOp.changed).toBe(false);
    expect(
      await db.workspaceActivity.count({ where: { workspaceId: ws } }),
    ).toBe(count);
    const task = await create(`/api/workspaces/${ws}/tasks`, {
        title: "Rollback status",
        status: "blocked",
      }),
      before = await db.task.findUniqueOrThrow({ where: { id: task.id } }),
      change = proposal(await workflow());
    change.definitions.find((d) => d.id === "blocked")!.archived = true;
    change.replacements.blocked = "todo";
    const impact = await workflowPreview(change),
      key = randomUUID(),
      trigger = "workflow_fail_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId"='${ws}' THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON "WorkspaceActivity" FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    );
    try {
      expect(
        (
          await request(`/api/workspaces/${ws}/workflow`, "POST", {
            ...change,
            impactDigest: impact.impactDigest,
            requestKey: key,
          })
        ).status,
      ).toBe(503);
      expect(
        await db.task.findUniqueOrThrow({ where: { id: task.id } }),
      ).toEqual(before);
      expect((await workflow()).revision).toBe(change.revision);
      expect(
        await db.workspaceIntent.findUnique({
          where: { workspaceId_id: { workspaceId: ws, id: key } },
        }),
      ).toBeNull();
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER ${trigger} ON "WorkspaceActivity"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);
    }
  });
  it("persists scoped tags with revision/no-op/activity/Trash guarantees and canonical block projections", async () => {
    const { project, parent, child } = await fixture(),
      base = pathFor("tasks", child.id);
    const one = (
      await create(`/api/workspaces/${ws}/tags`, {
        name: "Important",
        color: "amber",
        requestKey: randomUUID(),
      })
    ).tag;
    const two = (
      await create(`/api/workspaces/${ws}/tags`, {
        name: "Field visit",
        color: "sky",
        requestKey: randomUUID(),
      })
    ).tag;
    let current = await (await request(base)).json();
    const payload = {
      title: current.title,
      description: current.description,
      status: current.status,
      revision: current.revision,
      tagIds: [one.id, two.id],
    };
    expect((await request(base, "PATCH", payload)).status).toBe(200);
    current = await (await request(base)).json();
    expect(current.tags.map((t: { id: string }) => t.id).sort()).toEqual(
      [one.id, two.id].sort(),
    );
    expect(current).toMatchObject({
      parentId: parent.id,
      projectId: project.id,
      status: "done",
      completed: true,
    });
    expect(
      (await (await request(pathFor("tasks", parent.id))).json()).tags,
    ).toEqual([]);
    const count = await db.workActivity.count({ where: { taskId: child.id } });
    expect(
      (await request(base, "PATCH", { ...payload, revision: current.revision }))
        .status,
    ).toBe(200);
    expect(await db.workActivity.count({ where: { taskId: child.id } })).toBe(
      count,
    );
    expect((await request(base, "PATCH", payload)).status).toBe(409);
    expect(
      (
        await request(base, "PATCH", {
          ...payload,
          revision: current.revision,
          tagIds: [one.id, one.id],
        })
      ).status,
    ).toBe(400);
    const foreign = (
      await create(`/api/workspaces/${personal}/tags`, {
        name: "Foreign",
        color: "pink",
        requestKey: randomUUID(),
      })
    ).tag;
    expect(
      (
        await request(base, "PATCH", {
          ...payload,
          revision: current.revision,
          tagIds: [foreign.id],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          base,
          "PATCH",
          { ...payload, revision: current.revision },
          outsider,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          base,
          "PATCH",
          { ...payload, revision: current.revision },
          owner,
          { origin: "https://foreign.invalid" },
        )
      ).status,
    ).toBe(403);
    const block = await create(`/api/workspaces/${ws}/time-blocks`, {
      requestKey: randomUUID(),
      label: "Tags reference",
      schedule: {
        startAt: "2030-06-03T12:00Z",
        endAt: "2030-06-03T13:00Z",
        timeZone: "UTC",
      },
      assignment: { taskId: child.id, projectId: null },
    });
    expect(block.task.tags).toEqual(current.tags);
    const storedBlock = await db.timeBlock.findUniqueOrThrow({
      where: { id: block.id },
    });
    expect(
      (
        await request(base, "PATCH", {
          title: current.title,
          description: "Older client preserves tags",
          status: current.status,
          revision: current.revision,
        })
      ).status,
    ).toBe(200);
    expect((await (await request(base)).json()).tags).toEqual(current.tags);
    expect(
      await db.timeBlock.findUniqueOrThrow({ where: { id: block.id } }),
    ).toEqual(storedBlock);
    const moved = await move("project", project.id);
    expect((await restore(moved.batch.id)).status).toBe(200);
    expect((await (await request(base)).json()).tags).toEqual(current.tags);
    const event = await db.workActivity.findFirstOrThrow({
      where: { taskId: child.id, action: "work_updated" },
      orderBy: { occurredAt: "asc" },
    });
    expect(event.changes).toEqual([
      {
        field: "tags",
        before: "[]",
        after: JSON.stringify([one.id, two.id].sort()),
        beforeLabel: "None",
        afterLabel: current.tags
          .map((t: { name: string }) => t.name)
          .join(", "),
      },
    ]);
  });
  it("edits migration-shaped tag IDs as single encoded segments without changing linked work or bypassing scope checks", async () => {
    const definitions = await Promise.all(
      ["important", "urgent"].map((name) =>
        db.workspaceTag.create({
          data: {
            id: `legacy-${name}/${ws}`,
            workspaceId: ws,
            name: `Imported ${name}`,
            normalizedName: `imported ${name}`,
            color: "amber",
          },
        }),
      ),
    );
    const task = await create(`/api/workspaces/${ws}/tasks`, {
      title: "Migrated identity holder",
      tagIds: definitions.map((tag) => tag.id),
    });
    const original = await db.task.findUniqueOrThrow({
      where: { id: task.id },
    });
    const events = await db.workActivity.findMany({
      where: { taskId: task.id },
    });
    for (const definition of definitions) {
      const encodedId = encodeURIComponent(definition.id);
      const path = `/api/workspaces/${ws}/tags/${encodedId}`;
      const payload = {
        name: definition.name + " renamed",
        color: "sky",
        archived: false,
        revision: 1,
      };
      expect((await request(path, "PATCH", payload, outsider)).status).toBe(
        404,
      );
      expect(
        (
          await request(
            `/api/workspaces/${personal}/tags/${encodedId}`,
            "PATCH",
            payload,
          )
        ).status,
      ).toBe(404);
      for (let revision = 1; revision <= 3; revision++) {
        const result = await request(
          path,
          "PATCH",
          { ...payload, revision, archived: revision === 2 },
          editor,
        );
        expect(result.status).toBe(200);
        expect((await result.json()).tag).toMatchObject({
          id: definition.id,
          workspaceId: ws,
          name: payload.name,
          color: "sky",
          revision: revision + 1,
        });
      }
      expect((await request(path, "PATCH", payload)).status).toBe(409);
    }
    expect(await db.task.findUniqueOrThrow({ where: { id: task.id } })).toEqual(
      original,
    );
    expect(
      await db.workActivity.findMany({ where: { taskId: task.id } }),
    ).toEqual(events);
    expect(
      (await db.taskTag.findMany({ where: { taskId: task.id } }))
        .map((tag) => tag.tagId)
        .sort(),
    ).toEqual(definitions.map((tag) => tag.id).sort());
  });
  it("reconciles normalized concurrent definitions, receipts, all palette colors, archives and foreign identity guards", async () => {
    const name = "Arbitrary " + randomUUID(),
      key = randomUUID(),
      payload = { name, color: "teal", requestKey: key };
    const responses = await Promise.all([
      request(`/api/workspaces/${ws}/tags`, "POST", payload),
      request(`/api/workspaces/${ws}/tags`, "POST", {
        ...payload,
        name: "  " + name.toUpperCase() + "  ",
        requestKey: randomUUID(),
      }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const [a, b] = await Promise.all(responses.map((r) => r.json()));
    expect(a.tag.id).toBe(b.tag.id);
    expect(
      (
        await (
          await request(`/api/workspaces/${ws}/tags`, "POST", payload)
        ).json()
      ).replayed,
    ).toBe(true);
    expect(
      (
        await request(`/api/workspaces/${ws}/tags`, "POST", {
          ...payload,
          color: "pink",
        })
      ).status,
    ).toBe(400);
    const base = `/api/workspaces/${ws}/tags/${a.tag.id}`;
    let tag = a.tag;
    for (const color of ["teal", "blue", "violet", "amber", "pink", "sky"]) {
      const r = await request(base, "PATCH", {
        name: tag.name,
        color,
        archived: false,
        revision: tag.revision,
      });
      expect(r.status).toBe(200);
      tag = (await r.json()).tag;
    }
    expect(
      (
        await request(base, "PATCH", {
          name: tag.name,
          color: "red;display:none",
          archived: false,
          revision: tag.revision,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(base, "PATCH", {
          name: "Stale",
          color: "teal",
          archived: false,
          revision: 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          base,
          "PATCH",
          {
            name: tag.name,
            color: tag.color,
            archived: false,
            revision: tag.revision,
          },
          outsider,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/workspaces/${personal}/tags/${tag.id}`, "PATCH", {
          name: tag.name,
          color: tag.color,
          archived: false,
          revision: tag.revision,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/workspaces/${ws}/tags`, "GET", undefined, owner, {
          "X-Kanbrik-Account": outsider.id,
        })
      ).status,
    ).toBe(412);
    const task = await create(`/api/workspaces/${ws}/tasks`, {
      title: "Tag holder",
      tagIds: [tag.id],
    });
    const original = await db.task.findUniqueOrThrow({
      where: { id: task.id },
    });
    const archived = await request(base, "PATCH", {
      name: "Renamed " + name,
      color: "blue",
      archived: true,
      revision: tag.revision,
    });
    expect(archived.status).toBe(200);
    expect(await db.task.findUniqueOrThrow({ where: { id: task.id } })).toEqual(
      original,
    );
    const fresh = await (await request(pathFor("tasks", task.id))).json();
    expect(fresh.tags[0]).toMatchObject({
      id: tag.id,
      name: "Renamed " + name,
    });
    expect(
      (
        await request(pathFor("tasks", task.id), "PATCH", {
          title: task.title,
          description: "Keep archived reference",
          status: task.status,
          revision: task.revision,
          tagIds: [tag.id],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/api/workspaces/${ws}/tasks`, "POST", {
          title: "Cannot newly assign",
          tagIds: [tag.id],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`/api/workspaces/${ws}/tags`, "POST", {
          ...payload,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(201);
    await expect(
      db.taskTag.create({
        data: { workspaceId: personal, taskId: task.id, tagId: tag.id },
      }),
    ).rejects.toThrow();
    const trigger = "tag_rollback_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId"='${ws}' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON "WorkActivity" FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    );
    try {
      const before = await db.task.findUniqueOrThrow({
        where: { id: task.id },
      });
      expect(
        (
          await request(pathFor("tasks", task.id), "PATCH", {
            title: before.title,
            description: before.description,
            status: before.status,
            revision: before.revision,
            tagIds: [],
          })
        ).status,
      ).toBe(503);
      expect(
        await db.task.findUniqueOrThrow({ where: { id: task.id } }),
      ).toEqual(before);
      expect(await db.taskTag.count({ where: { taskId: task.id } })).toBe(1);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON "WorkActivity"`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);
    }
  });
  it("reorders only complete sibling scopes without revising content and safely reconciles older receipts", async () => {
    const project = await create(`/api/workspaces/${ws}/projects`, {
        title: "Ordered project",
      }),
      roots: TaskRecord[] = [];
    for (const title of ["First", "Second", "Third"])
      roots.push(
        await create(`/api/workspaces/${ws}/tasks`, {
          title,
          projectId: project.id,
        }),
      );
    const c1 = await create(`/api/workspaces/${ws}/tasks`, {
        title: "Child one",
        parentId: roots[0].id,
      }),
      c2 = await create(`/api/workspaces/${ws}/tasks`, {
        title: "Child two",
        parentId: roots[0].id,
      });
    const before = await db.task.findMany({
        where: { projectId: project.id },
        orderBy: { id: "asc" },
      }),
      scope = await taskGroup(project.id),
      input = {
        taskId: roots[2].id,
        beforeId: roots[0].id,
        revision: scope.revision,
        requestKey: randomUUID(),
      };
    const r = await request(`/api/workspaces/${ws}/task-order`, "POST", input);
    expect(r.status).toBe(200);
    let order = (await r.json()).scope;
    expect(order.ids).toEqual([roots[2].id, roots[0].id, roots[1].id]);
    const next = {
      taskId: roots[1].id,
      beforeId: roots[2].id,
      revision: order.revision,
      requestKey: randomUUID(),
    };
    expect(
      (await request(`/api/workspaces/${ws}/task-order`, "POST", next)).status,
    ).toBe(200);
    order = await taskGroup(project.id);
    const replay = await request(
      `/api/workspaces/${ws}/task-order`,
      "POST",
      input,
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      replayed: true,
      scope: { ids: order.ids, revision: order.revision },
    });
    const children = (await orders()).find(
      (s) => s.scopeKey === "task/" + roots[0].id,
    )!;
    expect(
      (
        await request(`/api/workspaces/${ws}/task-order`, "POST", {
          taskId: c2.id,
          beforeId: c1.id,
          revision: children.revision,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(200);
    expect((await taskGroup(project.id)).revision).toBe(order.revision);
    expect(
      await db.task.findMany({
        where: { projectId: project.id },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before);
    const other = await create(`/api/workspaces/${ws}/projects`, {
        title: "Other scope",
      }),
      foreign = await create(`/api/workspaces/${ws}/tasks`, {
        title: "Other root",
        projectId: other.id,
      }),
      standalone = await create(`/api/workspaces/${ws}/tasks`, {
        title: "No root order",
      });
    for (const beforeId of [foreign.id, c1.id])
      expect(
        (
          await request(`/api/workspaces/${ws}/task-order`, "POST", {
            ...input,
            beforeId,
            revision: order.revision,
            requestKey: randomUUID(),
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await request(`/api/workspaces/${ws}/task-order`, "POST", {
          ...input,
          taskId: standalone.id,
          beforeId: null,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(400);
    const count = await db.workActivity.count({
        where: { workspaceId: ws, action: "task_reordered" },
      }),
      noop = await request(`/api/workspaces/${ws}/task-order`, "POST", {
        taskId: order.ids[0],
        beforeId: order.ids[0],
        revision: order.revision,
        requestKey: randomUUID(),
      });
    expect(noop.status).toBe(200);
    expect((await noop.json()).changed).toBe(false);
    expect(
      await db.workActivity.count({
        where: { workspaceId: ws, action: "task_reordered" },
      }),
    ).toBe(count);
    const appended = await create(`/api/workspaces/${ws}/tasks`, {
      title: "Appended",
      projectId: project.id,
    });
    expect((await taskGroup(project.id)).ids.at(-1)).toBe(appended.id);
    expect(
      (
        await request(`/api/workspaces/${ws}/task-order`, "POST", {
          ...input,
          revision: order.revision,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(409);
  });
  it("retains Trash slots and exact restore revisions while active siblings move", async () => {
    const project = await create(`/api/workspaces/${ws}/projects`, {
        title: "Restore ordering",
      }),
      rows: TaskRecord[] = [];
    for (const title of ["A", "B", "C"])
      rows.push(
        await create(`/api/workspaces/${ws}/tasks`, {
          title,
          projectId: project.id,
        }),
      );
    const moved = await move("task", rows[1].id),
      trashed = await db.task.findUniqueOrThrow({ where: { id: rows[1].id } }),
      scope = await taskGroup(project.id);
    expect(
      (
        await request(`/api/workspaces/${ws}/task-order`, "POST", {
          taskId: rows[2].id,
          beforeId: rows[0].id,
          revision: scope.revision,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(200);
    expect(
      await db.task.findUniqueOrThrow({ where: { id: rows[1].id } }),
    ).toEqual(trashed);
    expect((await restore(moved.batch.id)).status).toBe(200);
    expect((await taskGroup(project.id)).ids).toEqual([
      rows[2].id,
      rows[1].id,
      rows[0].id,
    ]);
    const now = await taskGroup(project.id);
    await expect(
      db.taskOrderScope.update({
        where: {
          workspaceId_scopeKey: { workspaceId: ws, scopeKey: now.scopeKey },
        },
        data: { ids: [rows[0].id], revision: { increment: 1 } },
      }),
    ).rejects.toThrow();
    const trigger = "order_fail_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId"='${ws}' AND NEW.action='task_reordered' THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON "WorkActivity" FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    );
    const key = randomUUID();
    try {
      expect(
        (
          await request(`/api/workspaces/${ws}/task-order`, "POST", {
            taskId: rows[0].id,
            beforeId: rows[2].id,
            revision: now.revision,
            requestKey: key,
          })
        ).status,
      ).toBe(503);
      expect(await taskGroup(project.id)).toEqual(now);
      expect(
        await db.workspaceIntent.findUnique({
          where: { workspaceId_id: { workspaceId: ws, id: key } },
        }),
      ).toBeNull();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${trigger} ON "WorkActivity"`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${trigger}()`);
    }
  });
  it("rejects a waiting reorder and label edit after membership removal under the shared lock", async () => {
    const project = await create(`/api/workspaces/${ws}/projects`, {
        title: "Lock ordering",
      }),
      a = await create(`/api/workspaces/${ws}/tasks`, {
        title: "Locked A",
        projectId: project.id,
      }),
      b = await create(`/api/workspaces/${ws}/tasks`, {
        title: "Locked B",
        projectId: project.id,
      });
    for (const operation of ["order", "tags", "lists", "tag-definition"]) {
      const membership = await db.membership.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId: ws, userId: editor.id } },
      });
      let release!: () => void, locked!: () => void;
      const gate = new Promise<void>((r) => (release = r)),
        ready = new Promise<void>((r) => (locked = r));
      const blocker = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id=${ws} FOR UPDATE`;
          locked();
          await gate;
          await tx.membership.delete({ where: { id: membership.id } });
        },
        { timeout: 15000 },
      );
      await ready;
      try {
        const promise =
          operation === "tag-definition"
            ? request(
                `/api/workspaces/${ws}/tags`,
                "POST",
                { name: randomUUID(), color: "teal", requestKey: randomUUID() },
                editor,
              )
            : operation === "order"
              ? request(
                  `/api/workspaces/${ws}/task-order`,
                  "POST",
                  {
                    taskId: b.id,
                    beforeId: a.id,
                    revision: (
                      await db.taskOrderScope.findUniqueOrThrow({
                        where: {
                          workspaceId_scopeKey: {
                            workspaceId: ws,
                            scopeKey: "project/" + project.id,
                          },
                        },
                      })
                    ).revision,
                    requestKey: randomUUID(),
                  },
                  editor,
                )
              : operation === "lists"
                ? request(
                    pathFor("tasks", a.id) + "/lists",
                    "POST",
                    {
                      name: "Denied list",
                      kind: "checklist",
                      requestKey: randomUUID(),
                    },
                    editor,
                  )
                : request(
                    pathFor("tasks", a.id),
                    "PATCH",
                    {
                      title: a.title,
                      description: a.description,
                      status: a.status,
                      revision: a.revision,
                      tagIds: [],
                    },
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
        expect((await promise).status).toBe(404);
      } finally {
        release();
        await blocker;
        await db.membership.upsert({
          where: { workspaceId_userId: { workspaceId: ws, userId: editor.id } },
          update: {},
          create: { workspaceId: ws, userId: editor.id, role: "editor" },
        });
      }
    }
    expect(await db.taskTag.count({ where: { taskId: a.id } })).toBe(0);
    expect((await taskGroup(project.id)).ids).toEqual([a.id, b.id]);
  });
});
