import "server-only";
import { z } from "zod";

export function serverConfig() {
  const baseURL = z.url().parse(process.env.BETTER_AUTH_URL);
  const secret = z.string().min(32).parse(process.env.BETTER_AUTH_SECRET);
  const databaseURL = z.string().min(1).parse(process.env.DATABASE_URL);
  const mode = process.env.KANBRIK_ENV ?? "production";
  if (!["local", "test", "production"].includes(mode)) throw new Error("Invalid application environment");
  const localURL = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname);
  const registrationEnabled = (mode === "local" || mode === "test") && localURL && process.env.ENABLE_LOCAL_REGISTRATION === "true";
  return { baseURL, secret, databaseURL, registrationEnabled };
}
