import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { testDB as db } from "../database";
import { startMailCapture } from "../mail-capture.mjs";

const origin = "http://127.0.0.1:3112";
const adminEmail = `${randomUUID()}@example.invalid`;
const password = randomUUID() + randomUUID();
const users: string[] = [];
const email = () => { const value = `${randomUUID()}@example.invalid`; users.push(value); return value; };
let server: ChildProcess;
let mail: Awaited<ReturnType<typeof startMailCapture>>;
let cookie = "";
let adminId = "";
async function request(path: string, body?: object, options: { cookie?: string; origin?: string; method?: string; expected?: string } = {}) {
  return fetch(origin + path, { method: options.method ?? (body ? "POST" : "GET"), headers: { "content-type": "application/json", origin: options.origin ?? origin, cookie: options.cookie ?? "", ...(options.expected ? { "X-Kanbrik-Account": options.expected } : {}) }, body: body ? JSON.stringify(body) : undefined });
}
function tokenFor(to: string) {
  const message = mail.messages.filter(message => message.to.includes(to)).at(-1)!;
  return new URLSearchParams(new URL(message.text.match(/http[^\s]+/)![0]).hash.slice(1)).get("token")!;
}
async function invite(to = email()) {
  const response = await request("/api/invitations", { email: to }, { cookie });
  expect(response.status).toBe(200);
  return { row: await response.json(), token: tokenFor(to), email: to };
}
beforeAll(async () => {
  mail = await startMailCapture();
  users.push(adminEmail);
  adminId = randomUUID();
  await db.user.create({ data: { id: adminId, email: adminEmail, name: "Invitation admin", accounts: { create: { id: randomUUID(), accountId: adminId, providerId: "credential", password: await hashPassword(password) } } } });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3112"], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, BETTER_AUTH_URL: origin, KANBRIK_ENV: "test", ENABLE_LOCAL_REGISTRATION: "true", ENABLE_PREVIEW_REGISTRATION: "true", INVITATION_ADMIN_EMAILS: adminEmail,
      PASSWORD_RESET_ENABLED: "false", SMTP_PORT: String(mail.port) }, stdio: "ignore", windowsHide: true,
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { ready = (await fetch(origin + "/sign-in")).ok; } catch { /* startup */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  expect(ready).toBe(true);
  const login = await request("/api/auth/sign-in/email", { email: adminEmail, password });
  expect(login.status).toBe(200);
  cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
});
afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: users } } });
  server?.kill();
  await mail?.close();
  await db.$disconnect();
});
describe("account-only invitations with public signup disabled", () => {
  it("keeps public signup closed and requires authenticated allowlisted administrators, trusted Origin and current account", async () => {
    expect((await request("/api/auth/sign-up/email", { email: email(), name: "Public", password })).status).toBe(400);
    expect((await request("/api/invitations")).status).toBe(401);
    expect((await request("/api/invitations", { email: email() })).status).toBe(401);
    expect((await request("/api/invitations", { email: email() }, { cookie, origin: "https://foreign.invalid" })).status).toBe(403);
    expect((await request("/api/invitations", { email: email() }, { cookie, expected: "different-account" })).status).toBe(412);
    expect((await request("/api/invitations", { email: email(), role: "owner" }, { cookie })).status).toBe(400);
  });
  it("delivers a recipient-bound fragment link, stores only its hash, and atomically creates credentials without any shared membership or response cookie", async () => {
    const item = await invite();
    expect(item.row).not.toHaveProperty("tokenHash");
    const stored = await db.accountInvitation.findUniqueOrThrow({ where: { id: item.row.id } });
    expect(stored.tokenHash).toBe(createHash("sha256").update(item.token).digest("hex"));
    expect(stored.tokenHash).not.toBe(item.token);
    const preview = await request("/api/invitations/preview", { token: item.token });
    expect(preview.headers.get("cache-control")).toBe("no-store");
    expect((await preview.json()).email).toBe(item.email);
    expect((await request("/api/invitations/accept", { token: item.token, name: "New", password, email: email() })).status).toBe(400);
    const accepted = await request("/api/invitations/accept", { token: item.token, name: "Invited user", password });
    expect(accepted.status).toBe(200); expect(accepted.headers.getSetCookie()).toEqual([]);
    const user = await db.user.findUniqueOrThrow({ where: { email: item.email } });
    expect(user.emailVerified).toBe(true);
    expect(await db.membership.count({ where: { userId: user.id } })).toBe(0);
    const login = await request("/api/auth/sign-in/email", { email: item.email, password });
    expect(login.status).toBe(200);
    const userCookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    expect((await request("/api/invitations", undefined, { cookie: userCookie })).status).toBe(403);
    expect((await request(`/api/invitations/${item.row.id}`, {}, { method: "DELETE", cookie: userCookie })).status).toBe(403);
    const spaces = await request("/api/workspaces", undefined, { cookie: userCookie });
    const list = await spaces.json();
    expect(list).toHaveLength(1); expect(list[0].kind).toBe("personal");
    expect((await request("/api/invitations/accept", { token: item.token, name: "Replay", password })).status).toBe(410);
  });
  it("rejects expired/revoked/malformed tokens, foreign acceptance Origin and signed-in acceptance", async () => {
    const expired = await invite();
    await db.accountInvitation.update({ where: { id: expired.row.id }, data: { expiresAt: new Date(0) } });
    expect((await request("/api/invitations/accept", { token: expired.token, name: "Expired", password })).status).toBe(410);
    const revoked = await invite();
    expect((await request(`/api/invitations/${revoked.row.id}`, {}, { method: "DELETE", cookie })).status).toBe(200);
    expect((await request("/api/invitations/preview", { token: revoked.token })).status).toBe(410);
    expect((await request("/api/invitations/preview", { token: "invalid" })).status).toBe(400);
    expect((await request("/api/invitations/preview", { token: randomBytes(32).toString("hex") })).status).toBe(410);
    const item = await invite();
    expect((await request("/api/invitations/accept", { token: item.token, name: "Foreign", password }, { origin: "https://foreign.invalid" })).status).toBe(403);
    expect((await request("/api/invitations/accept", { token: item.token, name: "Signed in", password }, { cookie })).status).toBe(409);
    expect(await db.user.findUnique({ where: { email: item.email } })).toBeNull();
  });
  it("resend invalidates the old link and concurrent acceptance has a single winner", async () => {
    const first = await invite();
    expect((await request("/api/invitations", { email: first.email }, { cookie })).status).toBe(429);
    await db.accountInvitation.update({ where: { id: first.row.id }, data: { createdAt: new Date(Date.now() - 61000) } });
    const second = await invite(first.email);
    expect(second.row.id).toBe(first.row.id);
    expect((await request("/api/invitations/preview", { token: first.token })).status).toBe(410);
    const results = await Promise.all([1, 2].map(() => request("/api/invitations/accept", { token: second.token, name: "Concurrent", password })));
    expect(results.map(response => response.status).sort()).toEqual([200, 410]);
    expect(await db.user.count({ where: { email: first.email } })).toBe(1);
  });
  it("invalidates outstanding links when their issuer is no longer an allowlisted account", async () => {
    const item = await invite();
    const changedEmail = email();
    try {
      await db.user.update({ where: { id: adminId }, data: { email: changedEmail } });
      expect((await request("/api/invitations/preview", { token: item.token })).status).toBe(410);
      expect((await request("/api/invitations", undefined, { cookie })).status).toBe(403);
    } finally {
      await db.user.update({ where: { id: adminId }, data: { email: adminEmail } });
    }
  });
  it("cannot overwrite an existing account, and failed SMTP delivery leaves no usable invitation", async () => {
    expect((await request("/api/invitations", { email: adminEmail }, { cookie })).status).toBe(409);
    const item = await invite();
    const id = randomUUID();
    await db.user.create({ data: { id, email: item.email, name: "Existing account" } });
    expect((await request("/api/invitations/accept", { token: item.token, name: "Overwrite", password })).status).toBe(409);
    expect((await db.user.findUniqueOrThrow({ where: { id } })).name).toBe("Existing account");
    await mail.close();
    const to = email();
    expect((await request("/api/invitations", { email: to }, { cookie })).status).toBe(503);
    expect(await db.accountInvitation.findUnique({ where: { email: to } })).toBeNull();
    // Avoid a second close of the already stopped capture.
    mail.close = async () => {};
  });
});
