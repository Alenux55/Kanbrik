import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { serverConfig } from "./config";
import { database } from "./db";
import { passwordEmailConfig, sendPasswordEmail } from "./password-email";

function createAuth() {
  const config = serverConfig();
  return betterAuth({
    appName: "Kanbrik",
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [new URL(config.baseURL).origin],
    database: prismaAdapter(database(), { provider: "postgresql", transaction: true }),
    emailAndPassword: {
      enabled: true, disableSignUp: !config.registrationEnabled, minPasswordLength: 12,
      resetPasswordTokenExpiresIn: 3600, revokeSessionsOnPasswordReset: true,
      sendResetPassword: passwordEmailConfig() ? async ({ user, token }) => { await sendPasswordEmail(user.email, token, config.baseURL); } : undefined,
    },
    session: { cookieCache: { enabled: false } },
    logger: { disabled: true },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function authentication() { return instance ??= createAuth(); }

export async function verifiedSession(headers: Headers) {
  return authentication().api.getSession({ headers, query: { disableCookieCache: true } });
}
