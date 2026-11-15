import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { testDB as db } from "../database";
const origin = "http://127.0.0.1:3117";
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
    { name: "List fixture", email, password: randomUUID() + randomUUID() },
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
      "3117",
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
    name: "List HTTP fixture",
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

describe("independent checklists and shopping lists", () => {
  it("persists separate typed sections/items on every target without changing work, comments or blocks", async () => {
    const { project, parent, child } = await fixture();
    for (const [kind, row] of [
      ["projects", project],
      ["tasks", parent],
      ["tasks", child],
    ] as const) {
      const base = pathFor(kind, row.id),
        workBefore = await (await request(base)).json();
      await comment(base, "Independent comment");
      const list = await create(base + "/lists", {
          name: "Steps",
          kind: "checklist",
          requestKey: randomUUID(),
        }),
        shop = await create(base + "/lists", {
          name: "Purchases",
          kind: "shopping",
          requestKey: randomUUID(),
        });
      const item = await create(base + "/lists/" + list.list.id + "/items", {
        text: "Install",
        requestKey: randomUUID(),
      });
      const vendor = await create(`/api/workspaces/${ws}/vendors`, {
        name: "Vendor " + randomUUID(),
        requestKey: randomUUID(),
      });
      const purchase = await create(
        base + "/lists/" + shop.list.id + "/items",
        {
          text: "Cable",
          quantity: 2.5,
          vendorId: vendor.vendor.id,
          purchased: false,
          requestKey: randomUUID(),
        },
      );
      expect(item.item).toMatchObject({
        text: "Install",
        checked: false,
        quantity: null,
        vendorId: null,
        purchased: false,
      });
      expect(purchase.item).toMatchObject({
        quantity: 2.5,
        vendorId: vendor.vendor.id,
      });
      expect(
        (
          await request(
            base + "/lists/" + list.list.id + "/items/" + item.item.id,
            "PATCH",
            { text: "Install", checked: true, archived: false, revision: 1 },
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            base + "/lists/" + shop.list.id + "/items/" + purchase.item.id,
            "PATCH",
            {
              text: "Cable",
              quantity: 2.5,
              vendorId: vendor.vendor.id,
              purchased: true,
              archived: false,
              revision: 1,
            },
          )
        ).status,
      ).toBe(200);
      expect(await (await request(base)).json()).toEqual(workBefore);
      const data = await (
        await request(base + "/lists", "GET", undefined, editor)
      ).json();
      expect(data.lists).toHaveLength(2);
      expect(data.lists[0].items[0].checked).toBe(true);
      expect(data.lists[1].items[0].purchased).toBe(true);
      const history = await listHistory(base);
      expect(
        history.items.filter(
          (e: { action: string }) => e.action === "item_updated",
        ),
      ).toHaveLength(2);
    }
  });
  it("authorizes nested IDs and typed values and protects current-account/Origin boundaries", async () => {
    const { project, parent } = await fixture(),
      base = pathFor("projects", project.id),
      other = pathFor("tasks", parent.id);
    const l = (
      await create(base + "/lists", {
        name: "Scope",
        kind: "checklist",
        requestKey: randomUUID(),
      })
    ).list;
    const i = (
      await create(base + "/lists/" + l.id + "/items", {
        text: "Own",
        requestKey: randomUUID(),
      })
    ).item;
    for (const endpoint of [
      base + "/lists",
      `/api/workspaces/${ws}/vendors`,
      `/api/workspaces/${ws}/configuration-history`,
    ])
      expect((await request(endpoint, "GET", undefined, outsider)).status).toBe(
        404,
      );
    expect(
      (
        await request(other + "/lists/" + l.id, "PATCH", {
          name: "Steal",
          archived: false,
          revision: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(other + "/lists/" + l.id + "/items/" + i.id, "PATCH", {
          text: "Steal",
          checked: true,
          archived: false,
          revision: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(base + "/lists/" + l.id + "/items", "POST", {
          text: "Wrong fields",
          quantity: 1,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(base + "/lists", "POST", {
          name: "Unsupported",
          kind: "custom",
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(base + "/lists", "POST", {
          name: "Forge",
          kind: "checklist",
          workspaceId: personal,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          base + "/lists",
          "POST",
          { name: "Origin", kind: "checklist", requestKey: randomUUID() },
          owner,
          { origin: "https://foreign.invalid" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(base + "/lists", "GET", undefined, owner, {
          "x-kanbrik-account": editor.id,
        })
      ).status,
    ).toBe(412);
    await expect(
      db.workList.create({
        data: {
          workspaceId: personal,
          projectId: project.id,
          kind: "checklist",
          name: "Foreign",
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.workListItem.create({
        data: {
          workspaceId: ws,
          listId: l.id,
          kind: "shopping",
          text: "Wrong kind",
          quantity: 1,
        },
      }),
    ).rejects.toThrow();
  });
  it("reconciles creates after changes, rejects stale edits, and preserves separate archive states through Trash", async () => {
    const { project } = await fixture(),
      base = pathFor("projects", project.id),
      payload = {
        name: "Retained",
        kind: "checklist",
        requestKey: randomUUID(),
      };
    const [a, b] = await Promise.all([
      create(base + "/lists", payload),
      create(base + "/lists", payload),
    ]);
    expect(a.list.id).toBe(b.list.id);
    const itemPayload = { text: "Retained item", requestKey: randomUUID() },
      item = (
        await create(base + "/lists/" + a.list.id + "/items", itemPayload)
      ).item;
    const path = base + "/lists/" + a.list.id + "/items/" + item.id;
    const edit = {
      text: "Retained item",
      checked: true,
      archived: true,
      revision: 1,
    };
    expect((await request(path, "PATCH", edit)).status).toBe(200);
    expect((await request(path, "PATCH", edit)).status).toBe(409);
    const before = await db.workActivity.count({
      where: { workspaceId: ws, projectId: project.id },
    });
    expect(
      (await request(path, "PATCH", { ...edit, revision: 2 })).status,
    ).toBe(200);
    expect(
      await db.workActivity.count({
        where: { workspaceId: ws, projectId: project.id },
      }),
    ).toBe(before);
    expect(
      (
        await request(base + "/lists/" + a.list.id, "PATCH", {
          name: "Renamed",
          archived: true,
          revision: 1,
        })
      ).status,
    ).toBe(200);
    expect((await create(base + "/lists", payload)).list.name).toBe("Renamed");
    const moved = await move("project", project.id);
    expect(
      (await create(base + "/lists/" + a.list.id + "/items", itemPayload))
        .replayed,
    ).toBe(true);
    expect(
      (
        await request(base + "/lists", "POST", {
          name: "Fresh",
          kind: "shopping",
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(
      (await request(path, "PATCH", { ...edit, revision: 2 })).status,
    ).toBe(409);
    expect((await (await request(base + "/lists")).json()).readOnly).toBe(true);
    expect((await restore(moved.batch.id)).status).toBe(200);
    const restored = await (await request(base + "/lists")).json();
    expect(restored.lists[0].archivedAt).toBeTruthy();
    expect(restored.lists[0].items[0]).toMatchObject({
      id: item.id,
      checked: true,
      revision: 2,
    });
    expect(restored.lists[0].items[0].archivedAt).toBeTruthy();
    expect(
      (
        await request(base + "/lists/" + a.list.id, "PATCH", {
          name: "Renamed",
          archived: false,
          revision: 2,
        })
      ).status,
    ).toBe(200);
    expect(
      (await (await request(base + "/lists")).json()).lists[0].items[0]
        .archivedAt,
    ).toBeTruthy();
  });
  it("keeps archived vendors readable/retainable and rejects new archived or foreign assignments", async () => {
    const { project } = await fixture(),
      base = pathFor("projects", project.id),
      shop = (
        await create(base + "/lists", {
          name: "Buy",
          kind: "shopping",
          requestKey: randomUUID(),
        })
      ).list;
    const vendor = (
      await create(`/api/workspaces/${ws}/vendors`, {
        name: "Before rename",
        requestKey: randomUUID(),
      })
    ).vendor;
    const own = (
      await create(base + "/lists/" + shop.id + "/items", {
        text: "Retained vendor",
        vendorId: vendor.id,
        requestKey: randomUUID(),
      })
    ).item;
    expect(
      (
        await request(`/api/workspaces/${ws}/vendors/${vendor.id}`, "PATCH", {
          name: "After rename",
          archived: true,
          revision: 1,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          base + "/lists/" + shop.id + "/items/" + own.id,
          "PATCH",
          {
            text: "Edited",
            quantity: 1,
            vendorId: vendor.id,
            purchased: true,
            archived: false,
            revision: 1,
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(base + "/lists/" + shop.id + "/items", "POST", {
          text: "New selection",
          vendorId: vendor.id,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(400);
    const foreign = (
      await create(`/api/workspaces/${personal}/vendors`, {
        name: "Private",
        requestKey: randomUUID(),
      })
    ).vendor;
    expect(
      (
        await request(base + "/lists/" + shop.id + "/items", "POST", {
          text: "Foreign",
          vendorId: foreign.id,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(404);
    const config = await (
      await request(`/api/workspaces/${ws}/configuration-history`)
    ).json();
    expect(
      config.some((e: { action: string }) => e.action === "vendor_updated"),
    ).toBe(true);
    expect(
      (await listHistory(base)).items.filter((e: { action: string }) =>
        e.action.startsWith("vendor_"),
      ),
    ).toHaveLength(0);
  });
  it("rolls back rows and intent receipts when activity insertion fails", async () => {
    const { project } = await fixture(),
      base = pathFor("projects", project.id),
      key = randomUUID(),
      name = "list_fail_" + randomUUID().replaceAll("-", "");
    await db.$executeRawUnsafe(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."workspaceId"='${ws}' THEN RAISE EXCEPTION 'fixture'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER ${name} BEFORE INSERT ON "WorkActivity" FOR EACH ROW EXECUTE FUNCTION ${name}()`,
    );
    try {
      expect(
        (
          await request(base + "/lists", "POST", {
            name: "Rollback",
            kind: "checklist",
            requestKey: key,
          })
        ).status,
      ).toBe(503);
      expect(
        await db.workList.count({ where: { projectId: project.id } }),
      ).toBe(0);
      expect(
        await db.workspaceIntent.findUnique({
          where: { workspaceId_id: { workspaceId: ws, id: key } },
        }),
      ).toBeNull();
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER ${name} ON "WorkActivity"`);
      await db.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
    }
  });
});
async function listHistory(base: string) {
  const r = await request(base + "/history");
  expect(r.status).toBe(200);
  return r.json();
}
