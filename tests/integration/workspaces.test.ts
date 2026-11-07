import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertTestDatabase } from "../../scripts/test-target.mjs";
import { failFixtureMembership } from "../database";
import { startMailCapture } from "../mail-capture.mjs";
import { taskStatusIds, taskCompleted } from "../../src/lib/task-statuses";
import { expectedAccountHeader } from "../../src/lib/session-contract";

const url = assertTestDatabase(process.env.TEST_DATABASE_URL);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [] });
const origin = "http://127.0.0.1:3110";
const run = randomUUID();
const userIds: string[] = [];
const sharedIds: string[] = [];
let server: ChildProcess;
let mail: Awaited<ReturnType<typeof startMailCapture>>;

async function post(path: string, body: object, cookie = "") {
  return fetch(`${origin}${path}`, { method: "POST", headers: { "Content-Type": "application/json", origin, cookie }, body: JSON.stringify(body) });
}
async function account() {
  const email = `${run}-${randomUUID()}@example.invalid`;
  const password = randomUUID() + randomUUID();
  const response = await post("/api/auth/sign-up/email", { name: "Integration user", email, password });
  expect(response.status).toBe(200);
  const data = await response.json();
  userIds.push(data.user.id);
  const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  return { id: data.user.id as string, cookie, email, password };
}
async function bootstrap(cookie: string) {
  const response = await post("/api/workspaces/personal", {}, cookie);
  expect(response.status).toBe(200);
  return response.json() as Promise<{ id: string; personalOwnerId: string }>;
}

beforeAll(async () => {
  mail = await startMailCapture();
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3110"], {
    env: { ...process.env, DATABASE_URL: url, BETTER_AUTH_URL: origin, KANBRIK_ENV: "test", ENABLE_LOCAL_REGISTRATION: "true", SMTP_PORT: String(mail.port), SMTP_FROM: "Kanbrik Notifications <no-reply@example.invalid>" }, stdio: "ignore", windowsHide: true,
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { ready = (await fetch(`${origin}/sign-in`)).ok; } catch { /* not ready */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  expect(ready).toBe(true);
});
afterAll(async () => {
  await db.verification.deleteMany({ where: { value: { in: userIds } } });
  await db.timeBlock.deleteMany({ where: { workspace: { OR: [{ id: { in: sharedIds } }, { personalOwnerId: { in: userIds } }] } } });
  await db.workspace.deleteMany({ where: { id: { in: sharedIds } } });
  // Delete only this run's users; cascades remove their own workspaces/sessions.
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
  server?.kill();
  await mail?.close();
});

describe("read-only planner identity probe", () => {
  it("never forwards cookie headers or renews a due session, and exposes only minimal identity", async () => {
    const user = await account();
    const expiry = new Date(Date.now() + 3600000);
    await db.session.updateMany({ where: { userId: user.id }, data: { expiresAt: expiry } });
    const probe = (cookie = user.cookie, expected?: string) => fetch(`${origin}/api/planner-session`, { headers: { cookie, ...(expected ? { [expectedAccountHeader]: expected } : {}) } });
    const response = await probe();
    expect(response.status).toBe(200); expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ userId: user.id });
    expect((await db.session.findFirstOrThrow({ where: { userId: user.id } })).expiresAt.getTime()).toBe(expiry.getTime());
    const failure = await probe(user.cookie, "obsolete-account");
    expect(failure.status).toBe(503); expect(failure.headers.getSetCookie()).toEqual([]);
    for (const cookie of ["", "better-auth.session_token=invalid"]) {
      const missing = await probe(cookie);
      expect(missing.status).toBe(200); expect(missing.headers.getSetCookie()).toEqual([]);
      expect(await missing.json()).toEqual({ userId: null });
    }
    await db.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
    const expired = await probe();
    expect(expired.status).toBe(200); expect(expired.headers.getSetCookie()).toEqual([]);
    expect(await expired.json()).toEqual({ userId: null });
  });
});

describe("board preferences and canonical status-only operations", () => {
  let a: Awaited<ReturnType<typeof account>>, b: Awaited<ReturnType<typeof account>>, outsider: Awaited<ReturnType<typeof account>>;
  let workspaceId: string, personalId: string;
  let task: { id: string; revision: number; title: string; description: string; projectId: string; parentId: null };
  const statusPath = () => `/api/workspaces/${workspaceId}/tasks/${task.id}/status`;
  const request = (path: string, method = "GET", body?: object, cookie = a.cookie, expected?: string) => fetch(origin + path, { method, headers: { cookie, origin, "content-type": "application/json", ...(expected ? { [expectedAccountHeader]: expected } : {}) }, body: body ? JSON.stringify(body) : undefined });
  beforeAll(async () => {
    a = await account(); b = await account(); outsider = await account();
    personalId = (await bootstrap(a.cookie)).id;
    const shared = await (await post("/api/workspaces", { name: "Board fixture" }, a.cookie)).json();
    workspaceId = shared.id; sharedIds.push(workspaceId);
    await post(`/api/workspaces/${workspaceId}/members`, { email: b.email }, a.cookie);
    const project = await (await post(`/api/workspaces/${workspaceId}/projects`, { title: "Board context" }, a.cookie)).json();
    task = await (await post(`/api/workspaces/${workspaceId}/tasks`, { title: "Canonical", description: "Keep this text", projectId: project.id }, a.cookie)).json();
  });
  it("defaults only to personal space, persists clear-all/deduplicated selection and isolates ownership", async () => {
    expect((await (await request("/api/board/preferences")).json()).workspaceIds).toEqual([personalId]);
    expect((await request("/api/board/preferences", "PUT", { workspaceIds: [workspaceId, workspaceId, personalId] })).status).toBe(200);
    expect((await (await request("/api/board/preferences")).json()).workspaceIds).toEqual([workspaceId, personalId]);
    const other = await (await request("/api/board/preferences", "GET", undefined, b.cookie)).json();
    expect(other.workspaceIds).not.toContain(workspaceId);
    expect((await request("/api/board/preferences", "PUT", { workspaceIds: [] })).status).toBe(200);
    expect((await (await request("/api/board/preferences")).json()).workspaceIds).toEqual([]);
    const login = await post("/api/auth/sign-in/email", { email: a.email, password: a.password });
    expect(login.status).toBe(200);
    const nextCookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    expect((await (await request("/api/board/preferences", "GET", undefined, nextCookie)).json()).workspaceIds).toEqual([]);
    expect((await request("/api/board/preferences", "PUT", { workspaceIds: [], userId: b.id })).status).toBe(400);
    expect((await request("/api/board/preferences", "PUT", { workspaceIds: [personalId] }, b.cookie)).status).toBe(404);
    expect((await request("/api/board/preferences", "GET", undefined, "")).status).toBe(401);
    expect((await request("/api/board/preferences", "PUT", { workspaceIds: [] }, b.cookie, a.id)).status).toBe(412);
  });
  it("updates status only, preserving canonical text/context and independent child completion", async () => {
    const child = await (await post(`/api/workspaces/${workspaceId}/tasks`, { title: "Board child", parentId: task.id }, a.cookie)).json();
    const response = await request(statusPath(), "PATCH", { status: "done", revision: 1 }, b.cookie);
    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated).toMatchObject({ id: task.id, title: task.title, description: task.description, workspaceId, projectId: task.projectId, parentId: null, revision: 2, status: "done" });
    expect((await db.task.findUniqueOrThrow({ where: { id: child.id } })).status).toBe("todo");
    for (const body of [{ status: "scheduled", revision: 2 }, { status: "todo", revision: 0 }, { status: "todo", revision: 2, title: "Overwrite" }, { status: "todo", revision: 2, workspaceId: personalId }]) expect((await request(statusPath(), "PATCH", body)).status).toBe(400);
    expect((await request(statusPath(), "PATCH", { status: "todo", revision: 2 }, outsider.cookie, outsider.id)).status).toBe(404);
    expect((await request(statusPath(), "PATCH", { status: "todo", revision: 2 }, "")).status).toBe(401);
    expect((await request(statusPath().replace(workspaceId, personalId), "PATCH", { status: "todo", revision: 2 })).status).toBe(404);
    const hostile = await fetch(origin + statusPath(), { method: "PATCH", headers: { cookie: a.cookie, origin: "https://invalid.example", "content-type": "application/json" }, body: JSON.stringify({ status: "todo", revision: 2 }) });
    expect(hostile.status).toBe(403);
  });
  it("competes with text edits using the same revision and never copies stale text", async () => {
    const responses = await Promise.all([
      request(statusPath(), "PATCH", { status: "blocked", revision: 2 }),
      request(`/api/workspaces/${workspaceId}/tasks/${task.id}`, "PATCH", { title: "New text", description: "New description", status: "done", revision: 2 }, b.cookie),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const current = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(current.revision).toBe(3);
    expect((await request(statusPath(), "PATCH", { status: "todo", revision: 2 })).status).toBe(409);
    expect((await request(statusPath(), "PATCH", { status: "in_progress", revision: 3 })).status).toBe(200);
    const final = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(final.title).toBe(current.title); expect(final.description).toBe(current.description);
  });
  it("blocks a queued move after removal and prunes saved display preferences without granting access", async () => {
    await request("/api/board/preferences", "PUT", { workspaceIds: [workspaceId] }, b.cookie);
    let release!: () => void, ready!: (pid: number) => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const locked = new Promise<number>(resolve => { ready = resolve; });
    const removal = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
      await tx.membership.deleteMany({ where: { workspaceId, userId: b.id } });
      const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      ready(row.pid); await gate;
    }, { timeout: 15000 });
    const pid = await locked;
    const move = request(statusPath(), "PATCH", { status: "todo", revision: 4 }, b.cookie);
    try {
      let blocked = false;
      for (let i = 0; i < 60; i++) {
        const [row] = await db.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS blocked`;
        if (row.blocked) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(blocked).toBe(true);
    } finally { release(); await removal; }
    expect((await move).status).toBe(404);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).revision).toBe(4);
    const preference = await (await request("/api/board/preferences", "GET", undefined, b.cookie)).json();
    expect(preference.workspaceIds).toEqual([]); expect(preference.workspaces.some((item: { id: string }) => item.id === workspaceId)).toBe(false);
  });
});

describe("canonical projects/tasks through real HTTP and PostgreSQL", () => {
  let owner: Awaited<ReturnType<typeof account>>;
  let editor: Awaited<ReturnType<typeof account>>;
  let outsider: Awaited<ReturnType<typeof account>>;
  let workspaceId: string;
  let personalId: string;
  let otherId: string;
  let project: { id: string; revision: number };
  let otherProject: { id: string };
  let parent: { id: string; revision: number };
  let child: { id: string };
  const base = () => `/api/workspaces/${workspaceId}`;
  const get = (path: string, cookie = owner.cookie) => fetch(`${origin}${path}`, { headers: { cookie } });
  const patch = (path: string, body: object, cookie = owner.cookie) => fetch(`${origin}${path}`, { method: "PATCH", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  const edit = (revision = 1) => ({ title: "Edited task", description: "Planning", status: "in_progress", revision });
  async function create(path: string, body: object, cookie = owner.cookie) {
    const response = await post(path, body, cookie);
    expect(response.status).toBe(201);
    return response.json();
  }
  beforeAll(async () => {
    owner = await account(); editor = await account(); outsider = await account();
    personalId = (await bootstrap(owner.cookie)).id;
    otherId = (await bootstrap(outsider.cookie)).id;
    const shared = await post("/api/workspaces", { name: "Content fixture" }, owner.cookie);
    expect(shared.status).toBe(201);
    workspaceId = (await shared.json()).id; sharedIds.push(workspaceId);
    expect((await post(`${base()}/members`, { email: editor.email }, owner.cookie)).status).toBe(200);
    project = await create(`${base()}/projects`, { title: "  Plan  ", description: "<b>Plain text</b>" });
    otherProject = await create(`/api/workspaces/${otherId}/projects`, { title: "Private plan" }, outsider.cookie);
    parent = await create(`${base()}/tasks`, { title: "Parent", projectId: project.id });
    child = await create(`${base()}/tasks`, { title: "Child", parentId: parent.id }, editor.cookie);
  });
  it("persists minimal workspace-scoped records for personal owners and shared editors across sessions", async () => {
    const privateProject = await create(`/api/workspaces/${personalId}/projects`, { title: "My plan" });
    const privateTask = await create(`/api/workspaces/${personalId}/tasks`, { title: "Personal standalone" });
    expect(privateTask.projectId).toBeNull();
    const created = await create(`${base()}/projects`, { title: "Editor's plan" }, editor.cookie);
    expect((await patch(`${base()}/projects/${created.id}`, { title: "Editor update", description: "Shared", revision: 1 }, editor.cookie)).status).toBe(200);
    const login = await post("/api/auth/sign-in/email", { email: owner.email, password: owner.password });
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const detail = await get(`${base()}/projects/${project.id}`, cookie);
    expect(detail.headers.get("cache-control")).toBe("no-store");
    const record = await detail.json();
    expect(record.title).toBe("Plan"); expect(record.description).toBe("<b>Plain text</b>");
    expect(Object.keys(record).sort()).toEqual(["createdAt", "description", "id", "revision", "title", "updatedAt", "workspaceId"]);
    expect((await (await get(`/api/workspaces/${personalId}/projects/${privateProject.id}`, cookie)).json()).id).toBe(privateProject.id);
    expect((await (await get(`${base()}/tasks/${child.id}`, editor.cookie)).json()).projectId).toBe(project.id);
    const rows = await (await get(`${base()}/tasks`)).json();
    expect(rows.map((row: { id: string }) => row.id)).toEqual([parent.id, child.id]);
  });
  it("rejects an obsolete account precondition even when the new account is a shared editor", async () => {
    const task = await create(`${base()}/tasks`, { title: "Account precondition", description: "Saved text" });
    const request = (path: string, method: string, body?: object, expected = owner.id, cookie = editor.cookie) => fetch(`${origin}${path}`, {
      method, headers: { cookie, origin, "content-type": "application/json", [expectedAccountHeader]: expected }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    expect((await request(`${base()}/tasks/${task.id}`, "PATCH", { ...edit(), description: "Old account draft" })).status).toBe(412);
    expect((await request(`${base()}/tasks`, "POST", { title: "Old create draft" })).status).toBe(412);
    expect((await request("/api/workspaces", "POST", { name: "Old workspace draft" })).status).toBe(412);
    expect((await request(`${base()}/tasks`, "GET")).status).toBe(412);
    expect((await request("/api/auth/sign-out", "POST", {})).status).toBe(412);
    expect((await get("/api/workspaces", editor.cookie)).status).toBe(200);
    const unchanged = await db.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(unchanged.description).toBe("Saved text"); expect(unchanged.revision).toBe(1);
    expect((await request(`${base()}/tasks/${task.id}`, "PATCH", edit(), editor.id)).status).toBe(200);
    // Matching/omitted expectations never substitute for actual authorization.
    expect((await request(`${base()}/tasks`, "GET", undefined, outsider.id, outsider.cookie)).status).toBe(404);
    expect((await request(`${base()}/tasks`, "GET", undefined, owner.id, "")).status).toBe(401);
  });
  it("saves every fixed status while parent/child completion stays independent", async () => {
    let revision = 1;
    for (const status of taskStatusIds) {
      const response = await patch(`${base()}/tasks/${child.id}`, { ...edit(revision++), status }, editor.cookie);
      expect(response.status).toBe(200); expect((await response.json()).status).toBe(status);
      expect(taskCompleted(status)).toBe(status === "done");
    }
    expect((await (await get(`${base()}/tasks/${parent.id}`)).json()).status).toBe("todo");
    expect((await patch(`${base()}/tasks/${parent.id}`, { ...edit(), status: "done" })).status).toBe(200);
    expect((await patch(`${base()}/tasks/${child.id}`, { ...edit(revision), status: "blocked" })).status).toBe(200);
    expect((await (await get(`${base()}/tasks/${parent.id}`)).json()).status).toBe("done");
  });
  it("isolates lists/details/creates/updates from anonymous and unrelated accounts", async () => {
    for (const kind of ["projects", "tasks"]) {
      const id = kind === "projects" ? project.id : parent.id;
      for (const [cookie, status] of [["", 401], [outsider.cookie, 404]] as const) {
        expect((await get(`${base()}/${kind}`, cookie)).status).toBe(status);
        expect((await get(`${base()}/${kind}/${id}`, cookie)).status).toBe(status);
        expect((await post(`${base()}/${kind}`, { title: "Intrusion" }, cookie)).status).toBe(status);
        const body = kind === "tasks" ? edit() : { title: "Intrusion", description: "", revision: 1 };
        const response = await patch(`${base()}/${kind}/${id}`, body, cookie);
        expect(response.status).toBe(status); expect(JSON.stringify(await response.json())).not.toContain("Plan");
      }
      expect((await get(`/api/workspaces/${personalId}/${kind}`, editor.cookie)).status).toBe(404);
      expect((await get(`${base()}/${kind}/${randomUUID()}`)).status).toBe(404);
    }
    expect((await get(`${base()}/projects/${otherProject.id}`)).status).toBe(404);
    expect((await post(`${base()}/members`, { email: outsider.email }, editor.cookie)).status).toBe(403);
  });
  it("rejects invalid inputs, unsupported fields/statuses, immutable context changes and hostile origins", async () => {
    const before = await db.task.count({ where: { workspaceId } });
    for (const body of [{ title: " " }, { title: "x".repeat(201) }, { title: "x", description: "x".repeat(20001) }, { title: "x", creatorId: owner.id }, { title: "x", workspaceId: otherId }, { title: "x", status: "scheduled" }]) {
      expect((await post(`${base()}/tasks`, body, owner.cookie)).status).toBe(400);
    }
    for (const values of [{ projectId: project.id }, { workspaceId: otherId }, { parentId: parent.id }, { revision: 0 }, { status: "archived" }, { revision: 1.5 }]) {
      expect((await patch(`${base()}/tasks/${parent.id}`, { ...edit(), ...values })).status).toBe(400);
    }
    for (const body of [{ title: " " }, { title: "x", creatorId: owner.id }, { title: "x", description: "x".repeat(20001) }]) {
      expect((await post(`${base()}/projects`, body, owner.cookie)).status).toBe(400);
    }
    expect((await patch(`${base()}/projects/${project.id}`, { title: "x", description: "", revision: 1, workspaceId: otherId })).status).toBe(400);
    const hostile = await fetch(`${origin}${base()}/tasks`, { method: "POST", headers: { cookie: owner.cookie, origin: "https://hostile.invalid", "content-type": "application/json" }, body: JSON.stringify({ title: "x" }) });
    expect(hostile.status).toBe(403);
    expect(await db.task.count({ where: { workspaceId } })).toBe(before);
  });
  it("rejects deeper, mismatched and foreign parent/project references without partial creates", async () => {
    const before = await db.task.count({ where: { workspaceId } });
    for (const [body, status] of [
      [{ parentId: child.id }, 400], [{ parentId: parent.id, projectId: null }, 400],
      [{ parentId: parent.id, projectId: otherProject.id }, 400], [{ projectId: otherProject.id }, 404], [{ parentId: randomUUID() }, 404],
    ] as const) expect((await post(`${base()}/tasks`, { title: "Invalid child", ...body }, owner.cookie)).status).toBe(status);
    const standalone = await create(`${base()}/tasks`, { title: "Standalone" });
    const subtask = await create(`${base()}/tasks`, { title: "Standalone child", parentId: standalone.id });
    expect(subtask.projectId).toBeNull(); expect(subtask.parentId).toBe(standalone.id);
    expect(await db.task.count({ where: { workspaceId } })).toBe(before + 2);
  });
  it("enforces workspace consistency, NULL-safe parent project equality and hierarchy in the database", async () => {
    const sameWorkspaceProject = await db.project.create({ data: { workspaceId, title: "Other context" } });
    const foreignParent = await db.task.create({ data: { workspaceId: otherId, title: "Foreign parent" } });
    for (const context of [
      { projectId: otherProject.id }, { parentId: foreignParent.id }, { parentId: parent.id },
      { projectId: sameWorkspaceProject.id, parentId: parent.id }, { projectId: project.id, parentId: child.id },
    ]) await expect(db.task.create({ data: { workspaceId, title: "Invalid direct record", ...context } })).rejects.toThrow();
    const id = randomUUID();
    await expect(db.task.create({ data: { id, workspaceId, title: "Self", parentId: id } })).rejects.toThrow();
    await expect(db.task.update({ where: { id: parent.id }, data: { parentId: child.id } })).rejects.toThrow();
    await expect(db.project.update({ where: { id: project.id }, data: { workspaceId: otherId } })).rejects.toThrow();
    await expect(db.task.create({ data: { workspaceId, title: " " } })).rejects.toThrow();
    await expect(db.task.create({ data: { workspaceId, title: "x", revision: 0 } })).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE "Task" SET status = 'scheduled' WHERE id = ${parent.id}`).rejects.toThrow();
  });
  it("commits exactly one same-revision task edit and returns a safe current record to the loser", async () => {
    const task = await create(`${base()}/tasks`, { title: "Race" });
    const responses = await Promise.all([patch(`${base()}/tasks/${task.id}`, { ...edit(), title: "Owner wins?" }), patch(`${base()}/tasks/${task.id}`, { ...edit(), title: "Editor wins?" }, editor.cookie)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const winner = await responses.find(response => response.ok)!.json();
    const loser = await responses.find(response => response.status === 409)!.json();
    expect(loser.current).toEqual(winner); expect(winner.revision).toBe(2);
    expect((await patch(`${base()}/tasks/${task.id}`, edit(), outsider.cookie)).status).toBe(404);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).revision).toBe(2);
  });
  it("compares project revisions atomically and rejects stale retry without overwriting", async () => {
    const input = { title: "New plan", description: "Saved", revision: 1 };
    const responses = await Promise.all([patch(`${base()}/projects/${project.id}`, input), patch(`${base()}/projects/${project.id}`, input, editor.cookie)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await patch(`${base()}/projects/${project.id}`, { ...input, title: "Old retry" })).status).toBe(409);
    expect((await db.project.findUniqueOrThrow({ where: { id: project.id } })).title).toBe("New plan");
  });
  it("rolls back a failed update without changing saved text or revision", async () => {
    const name = `content_fail_${randomUUID().replaceAll("-", "")}`;
    const task = await create(`${base()}/tasks`, { title: "Before failure" });
    await db.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${task.id}' THEN RAISE EXCEPTION 'Fixture update failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE UPDATE ON "Task" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    try {
      expect((await patch(`${base()}/tasks/${task.id}`, edit())).status).toBe(503);
      const unchanged = await db.task.findUniqueOrThrow({ where: { id: task.id } });
      expect(unchanged.title).toBe("Before failure"); expect(unchanged.revision).toBe(1);
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "Task"`);
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`);
    }
    expect((await patch(`${base()}/tasks/${task.id}`, edit())).status).toBe(200);
  });
  it("denies an editor update that waited behind the membership-removal transaction", async () => {
    const task = await create(`${base()}/tasks`, { title: "Revocation race" });
    let release!: () => void; let locked!: (pid: number) => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<number>(resolve => { locked = resolve; });
    const removal = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
      await tx.membership.deleteMany({ where: { workspaceId, userId: editor.id } });
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      locked(pid); await gate;
    }, { timeout: 15000 });
    const pid = await ready;
    const saving = patch(`${base()}/tasks/${task.id}`, edit(), editor.cookie);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        const rows = await db.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS waiting`;
        if (rows[0].waiting) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
    } finally { release(); await removal; }
    expect((await saving).status).toBe(404);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).revision).toBe(1);
    expect((await get(`${base()}/projects`, editor.cookie)).status).toBe(404);
    expect((await get(`${base()}/tasks/${task.id}`, editor.cookie)).status).toBe(404);
    expect((await post(`${base()}/tasks`, { title: "No longer authorized" }, editor.cookie)).status).toBe(404);
    expect((await get("/api/workspaces", editor.cookie)).status).toBe(200);
    // Exercise the public remove operation against content too.
    expect((await post(`${base()}/members`, { email: editor.email }, owner.cookie)).status).toBe(200);
    const membership = await db.membership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId: editor.id } } });
    const removed = await fetch(`${origin}${base()}/members/${membership.id}`, { method: "DELETE", headers: { cookie: owner.cookie, origin, "content-type": "application/json" }, body: "{}" });
    expect(removed.status).toBe(200);
    expect((await patch(`${base()}/tasks/${task.id}`, edit(), editor.cookie)).status).toBe(404);
  });
});

describe("SMTP password recovery with real PostgreSQL sessions", () => {
  async function requestToken(user: Awaited<ReturnType<typeof account>>) {
    const response = await post("/api/auth/request-password-reset", { email: user.email, redirectTo: `${origin}/reset-password` });
    expect(response.status).toBe(200);
    const message = mail.messages.filter(message => message.to.includes(user.email)).at(-1);
    expect(!!message).toBe(true);
    expect(message!.from).toBe("Kanbrik Notifications <no-reply@example.invalid>");
    expect(message!.envelopeFrom).toBe("no-reply@example.invalid");
    const link = new URL(message!.text.match(/http[^\s]+/)![0]);
    expect(link.origin).toBe(origin); expect(link.pathname).toBe("/reset-password");
    expect(link.search.length).toBe(0);
    return new URLSearchParams(link.hash.slice(1)).get("token")!;
  }
  it("sends a real SMTP reset link, changes credentials once, and revokes existing sessions", async () => {
    const user = await account();
    const workspace = await bootstrap(user.cookie);
    const token = await requestToken(user);
    const newPassword = randomUUID() + randomUUID();
    expect((await post("/api/auth/reset-password", { token, newPassword })).status).toBe(200);
    expect((await post("/api/workspaces/personal", {}, user.cookie)).status).toBe(401);
    expect((await post("/api/auth/sign-in/email", { email: user.email, password: user.password })).status).toBe(401);
    const login = await post("/api/auth/sign-in/email", { email: user.email, password: newPassword });
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    expect((await bootstrap(cookie)).id).toBe(workspace.id);
    expect((await post("/api/auth/reset-password", { token, newPassword: randomUUID() + randomUUID() })).status).toBe(400);
  });
  it("rejects expired/invalid tokens and short passwords without changing existing sessions", async () => {
    const user = await account();
    const token = await requestToken(user);
    expect((await post("/api/auth/reset-password", { token, newPassword: "short" })).status).toBe(400);
    await db.verification.updateMany({ where: { identifier: `reset-password:${token}` }, data: { expiresAt: new Date(0) } });
    expect((await post("/api/auth/reset-password", { token, newPassword: randomUUID() + randomUUID() })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { token: randomUUID(), newPassword: randomUUID() + randomUUID() })).status).toBe(400);
    await bootstrap(user.cookie);
  });
  it("returns the same generic request response for unknown emails and rejects hostile redirects/origins", async () => {
    const user = await account();
    const known = await post("/api/auth/request-password-reset", { email: user.email, redirectTo: `${origin}/reset-password` });
    const unknown = await post("/api/auth/request-password-reset", { email: `${randomUUID()}@example.invalid`, redirectTo: `${origin}/reset-password` });
    expect(known.status).toBe(200); expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
    expect((await post("/api/auth/request-password-reset", { email: user.email, redirectTo: "https://hostile.invalid/reset" })).status).toBe(403);
    const hostile = await fetch(`${origin}/api/auth/request-password-reset`, { method: "POST", headers: { origin: "https://hostile.invalid", "content-type": "application/json" }, body: JSON.stringify({ email: user.email }) });
    expect(hostile.status).toBe(403);
  });
  it("consumes one reset token atomically under simultaneous reset requests", async () => {
    const user = await account(); const token = await requestToken(user);
    const newPassword = randomUUID() + randomUUID();
    const responses = await Promise.all([post("/api/auth/reset-password", { token, newPassword }), post("/api/auth/reset-password", { token, newPassword })]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 400]);
    expect((await post("/api/workspaces/personal", {}, user.cookie)).status).toBe(401);
    expect((await post("/api/auth/sign-in/email", { email: user.email, password: newPassword })).status).toBe(200);
  });
});

describe("shared workspace permissions through real HTTP sessions", () => {
  let owner: Awaited<ReturnType<typeof account>>;
  let editor: Awaited<ReturnType<typeof account>>;
  let outsider: Awaited<ReturnType<typeof account>>;
  let workspaceId: string;
  let otherId: string;
  let personalIds: string[];
  const get = (path: string, cookie = "") => fetch(`${origin}${path}`, { headers: { cookie } });
  const remove = (id: string, member: string, cookie: string, body: object = {}) => fetch(`${origin}/api/workspaces/${id}/members/${member}`, { method: "DELETE", headers: { cookie, origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  beforeAll(async () => {
    owner = await account(); editor = await account(); outsider = await account();
    personalIds = await Promise.all([owner, editor, outsider].map(async user => (await bootstrap(user.cookie)).id));
    for (const [user, name] of [[owner, "  Shared A  "], [editor, "Shared B"]] as const) {
      const response = await post("/api/workspaces", { name }, user.cookie);
      expect(response.status).toBe(201);
      const workspace = await response.json();
      sharedIds.push(workspace.id);
      if (user === owner) workspaceId = workspace.id; else otherId = workspace.id;
    }
  });
  it("creates shared ownership atomically and lists only current personal/shared memberships", async () => {
    const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { memberships: true } });
    expect(workspace.name).toBe("Shared A");
    expect(workspace.kind).toBe("shared"); expect(workspace.personalOwnerId).toBeNull();
    expect(workspace.memberships.map(member => [member.userId, member.role])).toEqual([[owner.id, "owner"]]);
    const list = await (await get("/api/workspaces", owner.cookie)).json();
    expect(list.map((item: { id: string }) => item.id).sort()).toEqual([personalIds[0], workspaceId].sort());
    expect((await get("/api/workspaces")).status).toBe(401);
    expect((await post("/api/workspaces", { name: "Anonymous" })).status).toBe(401);
    expect((await get(`/api/workspaces/${workspaceId}`, outsider.cookie)).status).toBe(404);
    expect((await get(`/api/workspaces/${workspaceId}`)).status).toBe(401);
    const thirdList = await (await get("/api/workspaces", outsider.cookie)).json();
    expect(thirdList.map((item: { id: string }) => item.id)).toEqual([personalIds[2]]);
  });
  it("rolls back actual shared creation when its owner membership fails", async () => {
    const release = await failFixtureMembership(owner.id);
    const name = `Rollback ${randomUUID()}`;
    try {
      expect((await post("/api/workspaces", { name }, owner.cookie)).status).toBe(503);
      expect(await db.workspace.count({ where: { name } })).toBe(0);
    } finally { await release(); }
  });
  it("validates names, actor/role fields, exact normalized existing emails, and origins", async () => {
    for (const body of [{ name: "   " }, { name: "x".repeat(101) }, { name: "Forged", ownerId: outsider.id }, { name: "Forged", kind: "personal" }]) {
      expect((await post("/api/workspaces", body, owner.cookie)).status).toBe(400);
    }
    for (const body of [{ email: editor.email, role: "owner" }, { email: editor.email, userId: outsider.id }, { email: "not-email" }]) {
      expect((await post(`/api/workspaces/${workspaceId}/members`, body, owner.cookie)).status).toBe(400);
    }
    expect((await post(`/api/workspaces/${workspaceId}/members`, { email: `${randomUUID()}@example.invalid` }, owner.cookie)).status).toBe(404);
    const hostile = await fetch(`${origin}/api/workspaces`, { method: "POST", headers: { cookie: owner.cookie, origin: "https://hostile.invalid", "content-type": "application/json" }, body: JSON.stringify({ name: "Hostile" }) });
    expect(hostile.status).toBe(403);
  });
  it("serializes duplicate editor grants without demoting the owner or exposing authentication records", async () => {
    const additions = await Promise.all(Array.from({ length: 6 }, () => post(`/api/workspaces/${workspaceId}/members`, { email: ` ${editor.email.toUpperCase()} ` }, owner.cookie)));
    expect(additions.map(response => response.status)).toEqual(Array(6).fill(200));
    expect(await db.membership.count({ where: { workspaceId, userId: editor.id, role: "editor" } })).toBe(1);
    expect((await post(`/api/workspaces/${workspaceId}/members`, { email: owner.email }, owner.cookie)).status).toBe(403);
    const detail = await (await get(`/api/workspaces/${workspaceId}`, editor.cookie)).json();
    expect(detail.role).toBe("editor"); expect(detail.members.length).toBe(2);
    expect(Object.keys(detail.members[0]).sort()).toEqual(["email", "id", "isYou", "name", "role"]);
    expect((await get(`/api/workspaces/${workspaceId}`, editor.cookie)).headers.get("cache-control")).toBe("no-store");
  });
  it("rejects editor/nonmember administration and membership IDs from another workspace", async () => {
    const ownerMembership = await db.membership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId: owner.id } } });
    const otherMembership = await db.membership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: otherId, userId: editor.id } } });
    expect((await post(`/api/workspaces/${workspaceId}/members`, { email: outsider.email }, editor.cookie)).status).toBe(403);
    expect((await post(`/api/workspaces/${workspaceId}/members`, { email: outsider.email }, outsider.cookie)).status).toBe(404);
    expect((await remove(workspaceId, ownerMembership.id, editor.cookie)).status).toBe(403);
    expect((await remove(workspaceId, ownerMembership.id, owner.cookie)).status).toBe(403);
    expect((await remove(workspaceId, otherMembership.id, owner.cookie)).status).toBe(404);
    expect((await post(`/api/workspaces/${workspaceId}/leave`, {}, owner.cookie)).status).toBe(403);
    expect((await post(`/api/workspaces/${workspaceId}/leave`, { userId: owner.id }, editor.cookie)).status).toBe(400);
    expect(await db.membership.count({ where: { workspaceId, role: "owner", userId: owner.id } })).toBe(1);
    const personalMember = await db.membership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: personalIds[0], userId: owner.id } } });
    expect((await post(`/api/workspaces/${personalIds[0]}/members`, { email: editor.email }, owner.cookie)).status).toBe(403);
    expect((await remove(personalIds[0], personalMember.id, owner.cookie)).status).toBe(403);
    expect((await post(`/api/workspaces/${personalIds[0]}/leave`, {}, owner.cookie)).status).toBe(403);
    expect((await remove(workspaceId, ownerMembership.id, owner.cookie, { actorId: outsider.id })).status).toBe(400);
  });
  it("revokes reads and writes after removal/leave while keeping session and personal work intact", async () => {
    const member = await db.membership.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId: editor.id } } });
    expect((await remove(workspaceId, member.id, owner.cookie)).status).toBe(200);
    for (const path of [`/api/workspaces/${workspaceId}`, `/api/workspaces/${workspaceId}/leave`]) {
      const response = path.endsWith("leave") ? await post(path, {}, editor.cookie) : await get(path, editor.cookie);
      expect(response.status).toBe(404);
    }
    expect((await get(`/api/workspaces/${personalIds[1]}`, editor.cookie)).status).toBe(200);
    expect((await get("/api/auth/get-session", editor.cookie)).status).toBe(200);
    expect((await post(`/api/workspaces/${workspaceId}/members`, { email: editor.email }, owner.cookie)).status).toBe(200);
    expect((await post(`/api/workspaces/${workspaceId}/leave`, {}, editor.cookie)).status).toBe(200);
    expect((await get(`/api/workspaces/${workspaceId}`, editor.cookie)).status).toBe(404);
    const list = await (await get("/api/workspaces", editor.cookie)).json();
    expect(list.map((item: { id: string }) => item.id).sort()).toEqual([personalIds[1], otherId].sort());
    expect(await db.workspace.count({ where: { id: { in: [workspaceId, otherId, ...personalIds] } } })).toBe(5);
  });
});

describe("real PostgreSQL and HTTP authentication boundary", () => {
  it("serializes concurrent bootstrap and returns exactly one workspace and owner membership", async () => {
    const user = await account();
    const results = await Promise.all(Array.from({ length: 6 }, () => bootstrap(user.cookie)));
    expect(new Set(results.map(row => row.id)).size).toBe(1);
    expect(results.every(row => row.personalOwnerId === user.id)).toBe(true);
    expect(await db.workspace.count({ where: { personalOwnerId: user.id } })).toBe(1);
    const memberships = await db.membership.findMany({ where: { userId: user.id } });
    expect(memberships.map(row => row.role)).toEqual(["owner"]);
    expect((await bootstrap(user.cookie)).id).toBe(results[0].id);
  });
  it("recovers an interrupted onboarding and missing membership without replacing workspace identity", async () => {
    const user = await account();
    expect(await db.workspace.count({ where: { personalOwnerId: user.id } })).toBe(0);
    const workspace = await bootstrap(user.cookie);
    await db.membership.deleteMany({ where: { workspaceId: workspace.id } });
    expect((await bootstrap(user.cookie)).id).toBe(workspace.id);
    expect(await db.membership.count({ where: { workspaceId: workspace.id, userId: user.id, role: "owner" } })).toBe(1);
  });
  it("enforces uniqueness, owner identity, and private membership in PostgreSQL", async () => {
    const a = await account(); const b = await account();
    const workspace = await bootstrap(a.cookie);
    await expect(db.workspace.create({ data: { name: "Duplicate", kind: "personal", personalOwnerId: a.id } })).rejects.toThrow();
    await expect(db.workspace.create({ data: { name: "No owner", kind: "personal" } })).rejects.toThrow();
    await expect(db.membership.create({ data: { workspaceId: workspace.id, userId: a.id, role: "owner" } })).rejects.toThrow();
    await expect(db.membership.create({ data: { workspaceId: workspace.id, userId: b.id, role: "editor" } })).rejects.toThrow();
    await expect(db.membership.updateMany({ where: { workspaceId: workspace.id }, data: { role: "editor" } })).rejects.toThrow();
  });
  it("rolls back a failed workspace/membership transaction, then allows retry", async () => {
    const user = await account();
    await expect(db.$transaction(async tx => {
      const workspace = await tx.workspace.create({ data: { name: "Interrupted", kind: "personal", personalOwnerId: user.id } });
      await tx.membership.create({ data: { workspaceId: workspace.id, userId: user.id, role: "editor" } });
    })).rejects.toThrow();
    expect(await db.workspace.count({ where: { personalOwnerId: user.id } })).toBe(0);
    await bootstrap(user.cookie);
    expect(await db.workspace.count({ where: { personalOwnerId: user.id } })).toBe(1);
  });
  it("rejects unauthenticated, forged-identity and cross-user requests without cached leakage", async () => {
    const a = await account(); const b = await account();
    const wa = await bootstrap(a.cookie); const wb = await bootstrap(b.cookie);
    expect(wa.id === wb.id).toBe(false);
    expect((await post("/api/workspaces/personal", {})).status).toBe(401);
    expect((await post("/api/workspaces/personal", { userId: a.id }, b.cookie)).status).toBe(400);
    expect((await post("/api/workspaces/personal", { ownerId: a.id }, b.cookie)).status).toBe(400);
    const get = (cookie: string) => fetch(`${origin}/api/workspaces/${wa.id}`, { headers: { cookie } });
    expect((await get(a.cookie)).status).toBe(200);
    expect((await get(b.cookie)).status).toBe(404);
    expect((await get("")).status).toBe(401);
    expect((await get(a.cookie)).headers.get("cache-control")).toBe("no-store");
    const hostile = await fetch(`${origin}/api/workspaces/personal`, { method: "POST", headers: { cookie: a.cookie, origin: "https://untrusted.invalid", "content-type": "application/json" }, body: "{}" });
    expect(hostile.status).toBe(403);
  });
  it("denies expired and invalid sessions at both page and API boundaries", async () => {
    const user = await account(); const workspace = await bootstrap(user.cookie);
    await db.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(0) } });
    const response = await fetch(`${origin}/api/workspaces/${workspace.id}`, { headers: { cookie: user.cookie } });
    expect(response.status).toBe(401);
    const page = await fetch(`${origin}/projects`, { headers: { cookie: user.cookie }, redirect: "manual" });
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("/sign-in");
    const invalid = await post("/api/workspaces/personal", {}, "better-auth.session_token=invalid");
    expect(invalid.status).toBe(401);
  });
  it("revokes signed-out sessions and reuses workspace identity on repeat login", async () => {
    const user = await account(); const workspace = await bootstrap(user.cookie);
    expect((await post("/api/auth/sign-out", {}, user.cookie)).status).toBe(200);
    expect((await post("/api/workspaces/personal", {}, user.cookie)).status).toBe(401);
    const login = await post("/api/auth/sign-in/email", { email: user.email, password: user.password });
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    expect((await bootstrap(cookie)).id).toBe(workspace.id);
    expect(await db.workspace.count({ where: { personalOwnerId: user.id } })).toBe(1);
  });
});

describe("calendar time blocks through authorized HTTP and PostgreSQL", () => {
  let a: Awaited<ReturnType<typeof account>>, b: Awaited<ReturnType<typeof account>>, outsider: Awaited<ReturnType<typeof account>>;
  let workspaceId: string, personalId: string, projectId: string, taskId: string, childId: string, foreignTask: string, foreignProject: string;
  let block: { id: string; revision: number };
  const schedule = { startAt: "2026-06-01T12:00:00-07:00", endAt: "2026-06-01T15:00:00-07:00", timeZone: "America/Los_Angeles" };
  const empty = { projectId: null, taskId: null };
  const body = (assignment: object = empty, times = schedule) => ({ requestKey: randomUUID(), label: "Time block", schedule: times, assignment });
  const path = () => `/api/workspaces/${workspaceId}/time-blocks`;
  const range = "?start=2026-06-01T00%3A00Z&end=2026-06-03T00%3A00Z";
  const request = (path: string, method = "GET", data?: object, cookie = a.cookie, expected?: string) => fetch(origin + path, { method, headers: { cookie, origin, "content-type": "application/json", ...(expected ? { [expectedAccountHeader]: expected } : {}) }, body: data ? JSON.stringify(data) : undefined });
  beforeAll(async () => {
    a = await account(); b = await account(); outsider = await account();
    personalId = (await bootstrap(a.cookie)).id;
    workspaceId = (await (await post("/api/workspaces", { name: "Calendar fixture" }, a.cookie)).json()).id;
    sharedIds.push(workspaceId);
    await post(`/api/workspaces/${workspaceId}/members`, { email: b.email }, a.cookie);
    projectId = (await (await post(`/api/workspaces/${workspaceId}/projects`, { title: "Calendar project" }, a.cookie)).json()).id;
    taskId = (await (await post(`/api/workspaces/${workspaceId}/tasks`, { title: "Calendar parent", projectId, status: "done" }, a.cookie)).json()).id;
    childId = (await (await post(`/api/workspaces/${workspaceId}/tasks`, { title: "Calendar child", parentId: taskId }, a.cookie)).json()).id;
    foreignTask = (await (await post(`/api/workspaces/${personalId}/tasks`, { title: "Foreign task" }, a.cookie)).json()).id;
    foreignProject = (await (await post(`/api/workspaces/${personalId}/projects`, { title: "Foreign project" }, a.cookie)).json()).id;
  });
  it("persists separate account-owned preferences, including explicit empty and new sign-in", async () => {
    const first = await request("/api/calendar/preferences"); expect(first.status).toBe(200); expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.json()).toMatchObject({ workspaceIds: [personalId], timeZone: null });
    await request("/api/board/preferences", "PUT", { workspaceIds: [workspaceId] });
    expect((await request("/api/calendar/preferences", "PUT", { workspaceIds: [workspaceId, workspaceId, personalId], timeZone: "Asia/Tokyo" })).status).toBe(200);
    expect(await (await request("/api/calendar/preferences")).json()).toMatchObject({ workspaceIds: [workspaceId, personalId], timeZone: "Asia/Tokyo" });
    expect((await (await request("/api/board/preferences")).json()).workspaceIds).toEqual([workspaceId]);
    expect((await request("/api/calendar/preferences", "PUT", { workspaceIds: [], timeZone: "UTC" })).status).toBe(200);
    const login = await post("/api/auth/sign-in/email", { email: a.email, password: a.password }); expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    expect(await (await request("/api/calendar/preferences", "GET", undefined, cookie)).json()).toMatchObject({ workspaceIds: [], timeZone: "UTC" });
    expect((await request("/api/calendar/preferences", "PUT", { workspaceIds: [personalId], timeZone: "UTC" }, b.cookie)).status).toBe(404);
    for (const extra of [{ userId: b.id }, { timeZone: "Invalid/zone" }]) expect((await request("/api/calendar/preferences", "PUT", { workspaceIds: [], timeZone: "UTC", ...extra })).status).toBe(400);
    expect((await (await request("/api/calendar/preferences", "GET", undefined, outsider.cookie)).json()).timeZone).toBeNull();
  });
  it("creates once for concurrent retries and never reuses a changed or deleted intent", async () => {
    const intent = body();
    const responses = await Promise.all([request(path(), "POST", intent), request(path(), "POST", intent)]);
    expect(responses.map(r => r.status)).toEqual([201, 201]);
    const [one, two] = await Promise.all(responses.map(r => r.json())); expect(one.id).toBe(two.id); block = one;
    expect(await db.timeBlock.count({ where: { workspaceId } })).toBe(1);
    expect((await request(path(), "POST", { ...intent, label: "Different" })).status).toBe(400);
    const temporaryIntent = body(); const temporary = await (await request(path(), "POST", temporaryIntent)).json();
    expect(await (await request(`${path()}/${temporary.id}`, "DELETE", { revision: 1 })).json()).toEqual({ deleted: true, id: temporary.id });
    expect((await request(path(), "POST", temporaryIntent)).status).toBe(404);
    expect(await db.timeBlock.count({ where: { workspaceId } })).toBe(1);
  });
  it("assigns projects/tasks/subtasks, replaces and clears without changing canonical work", async () => {
    const beforeProjects = await db.project.findMany({ where: { workspaceId } }); const beforeTasks = await db.task.findMany({ where: { workspaceId } });
    for (const assignment of [{ projectId, taskId: null }, { projectId: null, taskId }, { projectId: null, taskId: childId }, empty]) {
      const response = await request(`${path()}/${block.id}`, "PATCH", { revision: block.revision, changes: { assignment } }, b.cookie);
      expect(response.status).toBe(200); block = await response.json(); expect(block).toMatchObject({ ...assignment, startAt: "2026-06-01T19:00:00.000Z", endAt: "2026-06-01T22:00:00.000Z" });
    }
    expect(await db.project.findMany({ where: { workspaceId } })).toEqual(beforeProjects); expect(await db.task.findMany({ where: { workspaceId } })).toEqual(beforeTasks);
    const assigned = await (await request(path(), "POST", body({ projectId: null, taskId: childId }))).json();
    const repeated = await request(path(), "POST", body({ projectId: null, taskId: childId })); expect(repeated.status).toBe(201);
    expect(await db.timeBlock.count({ where: { workspaceId, taskId: childId } })).toBe(2);
    await db.task.update({ where: { id: childId }, data: { title: "Current canonical child" } });
    const events = await (await request(path() + range)).json(); expect(events.find((e: { id: string }) => e.id === assigned.id).task.title).toBe("Current canonical child");
  });
  it("rejects strict input, forged ownership, invalid zone/offsets and foreign references", async () => {
    for (const invalid of [
      { ...body(), workspaceId: personalId }, { ...body(), userId: b.id }, { ...body(), label: " " },
      { ...body(), assignment: { projectId, taskId } }, { ...body(), schedule: { ...schedule, startAt: "2026-06-01T12:00Z" } },
      { ...body(), schedule: { ...schedule, startAt: schedule.endAt } }, { ...body(), schedule: { ...schedule, timeZone: "wrong/zone" } },
      { ...body(), schedule: { startAt: "2026-03-08T02:30-08:00", endAt: "2026-03-08T04:00-07:00", timeZone: "America/Los_Angeles" } },
    ]) expect((await request(path(), "POST", invalid)).status).toBe(400);
    for (const changes of [{}, { workspaceId: personalId }, { assignment: { taskId: childId } }, { schedule: { startAt: schedule.startAt } }]) expect((await request(`${path()}/${block.id}`, "PATCH", { revision: block.revision, changes })).status).toBe(400);
    expect((await request(path(), "POST", body({ projectId: null, taskId: foreignTask }))).status).toBe(404);
    expect((await request(path(), "POST", body({ projectId: foreignProject, taskId: null }))).status).toBe(404);
    expect((await request(`${path()}/${block.id}`, "PATCH", { revision: block.revision, changes: { assignment: { projectId: null, taskId: foreignTask } } })).status).toBe(404);
    for (const suffix of ["", "?start=2026-01-01T00:00Z&end=2026-05-01T00:00Z", "?start=2026-01-01T00:00&end=2026-01-02T00:00Z"]) expect((await request(path() + suffix)).status).toBe(400);
  });
  it("denies anonymous, outsider, foreign-route and mismatched accounts on every operation", async () => {
    for (const [cookie, expected] of [["", 401], [outsider.cookie, 404]] as const) {
      expect((await request(path() + range, "GET", undefined, cookie)).status).toBe(expected);
      expect((await request(path(), "POST", body(), cookie)).status).toBe(expected);
      expect((await request(`${path()}/${block.id}`, "PATCH", { revision: block.revision, changes: { label: "No" } }, cookie)).status).toBe(expected);
      expect((await request(`${path()}/${block.id}`, "DELETE", { revision: block.revision }, cookie)).status).toBe(expected);
    }
    expect((await request(path() + range, "GET", undefined, b.cookie, a.id)).status).toBe(412);
    expect((await request(path(), "POST", body(), b.cookie, a.id)).status).toBe(412);
    expect((await request(`${path()}/${block.id}`, "PATCH", { revision: block.revision, changes: { label: "No" } }, b.cookie, a.id)).status).toBe(412);
    expect((await request(`${path()}/${block.id}`, "DELETE", { revision: block.revision }, b.cookie, a.id)).status).toBe(412);
    expect((await request(`/api/workspaces/${personalId}/time-blocks${range}`, "GET", undefined, b.cookie)).status).toBe(404);
    expect((await request(`/api/workspaces/${personalId}/time-blocks`, "POST", body(), b.cookie)).status).toBe(404);
    for (const invalid of [{ revision: 0 }, { revision: block.revision, workspaceId: personalId }]) expect((await request(`${path()}/${block.id}`, "DELETE", invalid)).status).toBe(400);
    expect((await request(`/api/workspaces/${personalId}/time-blocks/${block.id}`, "PATCH", { revision: block.revision, changes: { label: "No" } })).status).toBe(404);
    expect((await fetch(origin + `${path()}/${block.id}`, { method: "DELETE", headers: { cookie: a.cookie, origin: "https://hostile.invalid", "content-type": "application/json" }, body: JSON.stringify({ revision: block.revision }) })).status).toBe(403);
  });
  it("serializes competing label/schedule/assignment edits and rejects stale deletion", async () => {
    const changes = [{ label: "Concurrent label" }, { assignment: { projectId, taskId: null } }, { schedule: { ...schedule, endAt: "2026-06-02T15:00:00-07:00" } }];
    const responses = await Promise.all(changes.map(change => request(`${path()}/${block.id}`, "PATCH", { revision: block.revision, changes: change })));
    expect(responses.map(r => r.status).sort()).toEqual([200, 409, 409]);
    const current = await db.timeBlock.findUniqueOrThrow({ where: { id: block.id } }); expect(current.revision).toBe(block.revision + 1);
    const stale = await request(`${path()}/${block.id}`, "DELETE", { revision: block.revision }); expect(stale.status).toBe(409); expect((await stale.json()).current.id).toBe(block.id);
    block = current;
    const race = await Promise.all([request(`${path()}/${block.id}`, "DELETE", { revision: block.revision }), request(`${path()}/${block.id}`, "PATCH", { revision: block.revision, changes: { label: "Race" } })]);
    expect(race.filter(r => r.status === 200)).toHaveLength(1); expect([404, 409]).toContain(race.find(r => r.status !== 200)!.status);
    const still = await db.timeBlock.findUnique({ where: { id: block.id } });
    if (still) { expect((await request(`${path()}/${block.id}`, "DELETE", { revision: still.revision })).status).toBe(200); }
    expect(await db.task.count({ where: { workspaceId } })).toBe(2); expect(await db.project.count({ where: { workspaceId } })).toBe(1);
  });
  it("queries half-open overlaps including spanning blocks and DST crossings", async () => {
    const make = async (startAt: string, endAt: string, timeZone = "UTC") => (await (await request(path(), "POST", body(empty, { startAt, endAt, timeZone }))).json()).id;
    const endsAtStart = await make("2026-03-07T00:00Z", "2026-03-08T08:00Z");
    const startsAtEnd = await make("2026-03-09T07:00Z", "2026-03-10T08:00Z");
    const spanning = await make("2026-03-07T12:00-08:00", "2026-03-10T15:00-07:00", "America/Los_Angeles");
    const crossing = await make("2026-03-08T01:30-08:00", "2026-03-08T03:30-07:00", "America/Los_Angeles");
    for (const startAt of ["2026-11-01T01:30-07:00", "2026-11-01T01:30-08:00"]) expect((await request(path(), "POST", body(empty, { startAt, endAt: "2026-11-01T03:00-08:00", timeZone: "America/Los_Angeles" }))).status).toBe(201);
    const events = await (await request(path() + "?" + new URLSearchParams({ start: "2026-03-08T00:00-08:00", end: "2026-03-09T00:00-07:00" }))).json();
    expect(events.map((e: { id: string }) => e.id).sort()).toEqual([spanning, crossing].sort());
    expect(events.map((e: { id: string }) => e.id)).not.toContain(endsAtStart); expect(events.map((e: { id: string }) => e.id)).not.toContain(startsAtEnd);
    const cross = events.find((e: { id: string }) => e.id === crossing); expect(Date.parse(cross.endAt) - Date.parse(cross.startAt)).toBe(3600000);
  });
  it("enforces database relationships, interval, revision, zone and immutable ownership", async () => {
    const data = { workspaceId, label: "SQL fixture", startAt: new Date(schedule.startAt), endAt: new Date(schedule.endAt), timeZone: schedule.timeZone };
    for (const bad of [{ taskId: foreignTask }, { projectId: foreignProject }, { projectId, taskId }, { endAt: data.startAt }, { revision: 0 }, { label: " " }, { timeZone: "No/Zone" }]) await expect(db.timeBlock.create({ data: { ...data, ...bad } })).rejects.toThrow();
    const owned = await db.timeBlock.create({ data: { ...data, projectId } });
    await expect(db.timeBlock.update({ where: { id: owned.id }, data: { workspaceId: personalId, projectId: null } })).rejects.toThrow();
    await expect(db.project.delete({ where: { id: projectId } })).rejects.toThrow();
    await expect(db.task.delete({ where: { id: childId } })).rejects.toThrow();
    const [types] = await db.$queryRaw<{ valid: boolean }[]>`SELECT COUNT(*) = 2 AS valid FROM information_schema.columns WHERE table_name = 'TimeBlock' AND column_name IN ('startAt','endAt') AND data_type = 'timestamp with time zone' AND datetime_precision = 3`;
    expect(types.valid).toBe(true);
  });
  it("denies a mutation confirmed queued behind membership removal and prunes preferences", async () => {
    await request("/api/calendar/preferences", "PUT", { workspaceIds: [workspaceId], timeZone: "UTC" }, b.cookie);
    const target = await (await request(path(), "POST", body())).json();
    let release!: () => void, ready!: (pid: number) => void;
    const gate = new Promise<void>(resolve => { release = resolve; }); const locked = new Promise<number>(resolve => { ready = resolve; });
    const removal = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR UPDATE`;
      await tx.membership.deleteMany({ where: { workspaceId, userId: b.id } });
      const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`; ready(row.pid); await gate;
    }, { timeout: 15000 });
    const pid = await locked;
    const queued = request(`${path()}/${target.id}`, "PATCH", { revision: 1, changes: { label: "Denied" } }, b.cookie);
    try {
      let blocked = false;
      for (let i = 0; i < 80; i++) {
        const [row] = await db.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS blocked`;
        if (row.blocked) { blocked = true; break; } await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(blocked).toBe(true);
    } finally { release(); await removal; }
    expect((await queued).status).toBe(404); expect((await db.timeBlock.findUniqueOrThrow({ where: { id: target.id } })).revision).toBe(1);
    const prefs = await (await request("/api/calendar/preferences", "GET", undefined, b.cookie)).json(); expect(prefs.workspaceIds).toEqual([]); expect(prefs.workspaces.some((w: { id: string }) => w.id === workspaceId)).toBe(false);
  });
});
