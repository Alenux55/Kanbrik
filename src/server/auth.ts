import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { serverConfig } from "./config";
import { database } from "./db";

function createAuth() {
  const config = serverConfig();
  return betterAuth({
    appName: "Kanbrik",
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [new URL(config.baseURL).origin],
    database: prismaAdapter(database(), { provider: "postgresql" }),
    emailAndPassword: { enabled: true, disableSignUp: !config.registrationEnabled, minPasswordLength: 12 },
    session: { cookieCache: { enabled: false } },
    logger: { disabled: true },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function authentication() { return instance ??= createAuth(); }

export async function verifiedSession(headers: Headers) {
  return authentication().api.getSession({ headers, query: { disableCookieCache: true } });
}
