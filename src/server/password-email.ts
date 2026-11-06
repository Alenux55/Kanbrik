import "server-only";
import nodemailer from "nodemailer";
import { passwordEmailSettings } from "./password-email-config.mjs";

export function passwordEmailConfig() {
  return passwordEmailSettings().config;
}

export async function sendPasswordEmail(to: string, token: string, baseURL: string) {
  const config = passwordEmailConfig();
  if (!config) throw new Error("Password recovery email is not configured");
  const localPlaintext = ["local", "test"].includes(process.env.KANBRIK_ENV ?? "") &&
    ["127.0.0.1", "localhost", "::1"].includes(config.host) && process.env.SMTP_ALLOW_INSECURE_LOCAL === "true";
  const transport = nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.port === 465,
    requireTLS: !localPlaintext, ignoreTLS: localPlaintext,
    auth: { user: config.user, pass: config.password },
    logger: false, debug: false, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  const url = new URL("/reset-password", baseURL);
  // Fragments stay out of HTTP request URLs, referrers, and server access logs.
  url.hash = new URLSearchParams({ token }).toString();
  try {
    const result = await transport.sendMail({
      from: config.from, to, subject: "Reset your Kanbrik password",
      text: `A password reset was requested for your Kanbrik account.\n\nOpen this link to choose a new password:\n${url.href}\n\nThis link expires in one hour and can be used once. If you did not request it, you can ignore this email.`,
      textEncoding: "base64",
    });
    if (result.rejected?.length) throw new Error();
  } catch { throw new Error("Password recovery email delivery failed"); }
  finally { transport.close(); }
}
