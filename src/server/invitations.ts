import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { verifiedSession } from "./auth";
import { serverConfig } from "./config";
import { database } from "./db";
import { invitationAdmins, invitationOriginAllowed } from "./invitation-policy";
import { sendEmail } from "./password-email";
import { smtpSettings } from "./password-email-config.mjs";
import { Unauthenticated } from "./workspaces";
import { SessionChanged } from "./session-precondition";

const emailInput = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const invitationInput = z.object({ email: emailInput }).strict();
export const invitationTokenInput = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const invitationAcceptInput = invitationTokenInput.extend({
  name: z.string().trim().min(1).max(100), password: z.string().min(12).max(128),
}).strict();
export class InvitationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const summary = { id: true, email: true, createdAt: true, expiresAt: true, consumedAt: true } as const;

export async function isInvitationAdmin(headers: Headers) {
  const session = await verifiedSession(headers);
  return !!session && invitationOriginAllowed(new URL(serverConfig().baseURL)) &&
    invitationAdmins().includes(session.user.email.toLowerCase());
}
async function admin(headers: Headers) {
  const session = await verifiedSession(headers);
  if (!session) throw new Unauthenticated();
  if (!invitationOriginAllowed(new URL(serverConfig().baseURL)) || !invitationAdmins().includes(session.user.email.toLowerCase()))
    throw new InvitationError(403, "Invitation administrator access required.");
  return session.user.id;
}
export function invitationOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(serverConfig().baseURL).origin)
    throw new InvitationError(403, "Invalid origin.");
}
export async function listInvitations(headers: Headers) {
  await admin(headers);
  return { emailConfigured: !!smtpSettings().config, invitations: await database().accountInvitation.findMany({ select: summary, orderBy: { createdAt: "desc" }, take: 100 }) };
}
export async function createInvitation(headers: Headers, email: string) {
  const inviterId = await admin(headers);
  if (!smtpSettings().config) throw new InvitationError(503, "Configure SMTP before sending invitations.");
  const token = randomBytes(32).toString("hex");
  const tokenHash = digest(token);
  const now = new Date();
  const row = await database().$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"invitation:" + inviterId}, 0))::text`;
    if (await tx.user.findUnique({ where: { email }, select: { id: true } }))
      throw new InvitationError(409, "That account already exists. Grant shared-workspace access separately.");
    const previous = await tx.accountInvitation.findUnique({ where: { email } });
    if (previous && previous.createdAt.getTime() > now.getTime() - 60000)
      throw new InvitationError(429, "Wait one minute before sending another invitation to this address.");
    if (await tx.accountInvitation.count({ where: { inviterId, createdAt: { gt: new Date(now.getTime() - 3600000) } } }) >= 20)
      throw new InvitationError(429, "Invitation limit reached. Try again later.");
    return tx.accountInvitation.upsert({ where: { email }, update: { tokenHash, inviterId, createdAt: now, expiresAt: new Date(now.getTime() + 7 * 86400000), consumedAt: null },
      create: { email, tokenHash, inviterId, expiresAt: new Date(now.getTime() + 7 * 86400000) }, select: summary });
  });
  const url = new URL("/accept-invitation", serverConfig().baseURL);
  url.hash = new URLSearchParams({ token }).toString();
  try {
    await sendEmail(email, "Your Kanbrik account invitation", `You have been invited to create a Kanbrik account.\n\n${url.href}\n\nThis link expires in seven days and can be used once. It creates your account and personal workspace only. Shared-workspace access is granted separately. If you were not expecting this invitation, ignore it.`);
  } catch {
    // An uncertain delivery must not leave a usable link that the UI calls failed.
    await database().accountInvitation.deleteMany({ where: { id: row.id, tokenHash, consumedAt: null } });
    throw new InvitationError(503, "Invitation delivery was not confirmed. Refresh the list before retrying.");
  }
  return row;
}
export async function revokeInvitation(headers: Headers, id: string) {
  await admin(headers);
  await database().accountInvitation.deleteMany({ where: { id } });
  return { saved: true };
}
async function validInvitation(token: string) {
  if (!invitationOriginAllowed(new URL(serverConfig().baseURL)) || !invitationAdmins().length)
    throw new InvitationError(410, "This invitation is invalid, expired or revoked.");
  const row = await database().accountInvitation.findUnique({ where: { tokenHash: digest(token) }, include: { inviter: { select: { email: true } } } });
  if (!row || row.consumedAt || row.expiresAt <= new Date() || !invitationAdmins().includes(row.inviter.email.toLowerCase()))
    throw new InvitationError(410, "This invitation is invalid, expired or revoked.");
  return row;
}
export async function previewInvitation(token: string) {
  const row = await validInvitation(token);
  return { email: row.email, expiresAt: row.expiresAt };
}
export async function acceptInvitation(headers: Headers, input: z.infer<typeof invitationAcceptInput>) {
  if (await verifiedSession(headers)) throw new InvitationError(409, "Sign out first, or open this invitation in a private window.");
  const invitation = await validInvitation(input.token);
  const password = await hashPassword(input.password);
  try {
    await database().$transaction(async tx => {
      const claimed = await tx.accountInvitation.updateMany({ where: { id: invitation.id, tokenHash: digest(input.token), consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (!claimed.count) throw new InvitationError(410, "This invitation is invalid, expired or revoked.");
      if (await tx.user.findUnique({ where: { email: invitation.email } }))
        throw new InvitationError(409, "This account already exists. Sign in or use password recovery.");
      const id = randomUUID();
      // Match the pinned Better Auth credential model/hash. Never overwrite an
      // existing account or issue a cookie from an invitation response.
      await tx.user.create({ data: { id, name: input.name, email: invitation.email, emailVerified: true,
        accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password } } } });
    });
  } catch (error) {
    if (error instanceof InvitationError) throw error;
    if (typeof error === "object" && error && "code" in error && error.code === "P2002")
      throw new InvitationError(409, "This account already exists. Sign in or use password recovery.");
    throw error;
  }
  return { created: true };
}
export function invitationResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
export async function invitationRequest(operation: () => Promise<unknown>) {
  try { return invitationResponse(await operation()); }
  catch (error) {
    if (error instanceof SessionChanged) return invitationResponse({ error: "Account changed. Verify your session.", code: "SESSION_CHANGED" }, 412);
    if (error instanceof Unauthenticated) return invitationResponse({ error: "Sign in required." }, 401);
    if (error instanceof InvitationError) return invitationResponse({ error: error.message }, error.status);
    if (error instanceof z.ZodError) return invitationResponse({ error: "Check the required fields." }, 400);
    return invitationResponse({ error: "Invitation operation is not confirmed. Please retry." }, 503);
  }
}
