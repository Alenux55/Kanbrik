import "server-only";
import { z } from "zod";
import { registrationAllowed } from "./registration-policy";

export function serverConfig() {
  const baseURL = z.url().parse(process.env.BETTER_AUTH_URL);
  const secret = z.string().min(32).parse(process.env.BETTER_AUTH_SECRET);
  const databaseURL = z.string().min(1).parse(process.env.DATABASE_URL);
  const mode = process.env.KANBRIK_ENV ?? "production";
  if (!["local", "test", "preview", "production"].includes(mode)) throw new Error("Invalid application environment");
  // Configuring invitation administrators selects invite-only signup, even if
  // an old public-preview flag was left enabled. Invalid allowlists fail closed.
  const registrationEnabled = !process.env.INVITATION_ADMIN_EMAILS?.trim() && registrationAllowed(mode, new URL(baseURL), process.env.ENABLE_LOCAL_REGISTRATION === "true", process.env.ENABLE_PREVIEW_REGISTRATION === "true");
  return { baseURL, secret, databaseURL, registrationEnabled };
}
