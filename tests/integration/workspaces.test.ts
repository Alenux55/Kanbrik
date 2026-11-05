import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertTestDatabase } from "../../scripts/test-target.mjs";
import { failFixtureMembership } from "../database";

const url = assertTestDatabase(process.env.TEST_DATABASE_URL);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), log: [] });
const origin = "http://127.0.0.1:3110";
const run = randomUUID();
const userIds: string[] = [];
const sharedIds: string[] = [];
let server: ChildProcess;

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
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3110"], {
    env: { ...process.env, DATABASE_URL: url, BETTER_AUTH_URL: origin, KANBRIK_ENV: "test", ENABLE_LOCAL_REGISTRATION: "true" }, stdio: "ignore", windowsHide: true,
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
  await db.workspace.deleteMany({ where: { id: { in: sharedIds } } });
  // Delete only this run's users; cascades remove their own workspaces/sessions.
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
  server?.kill();
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
