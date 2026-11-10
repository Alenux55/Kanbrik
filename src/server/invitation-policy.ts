import { z } from "zod";

export function invitationAdmins(value = process.env.INVITATION_ADMIN_EMAILS) {
  const emails = (value ?? "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
  // An invalid allowlist fails closed rather than partially enabling access.
  return emails.every(email => z.email().safeParse(email).success) ? [...new Set(emails)] : [];
}

export function invitationOriginAllowed(url: URL, mode = process.env.KANBRIK_ENV) {
  return url.protocol === "https:" || (["local", "test"].includes(mode ?? "") &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.protocol === "http:");
}
