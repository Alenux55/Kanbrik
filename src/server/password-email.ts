import "server-only";
import nodemailer from "nodemailer";
import { passwordEmailSettings, smtpSettings } from "./password-email-config.mjs";

export function passwordEmailConfig() {
  return passwordEmailSettings().config;
}

export async function sendPasswordEmail(to: string, token: string, baseURL: string) {
  if (!passwordEmailConfig()) throw new Error("Password recovery email is not configured");
  const url = new URL("/reset-password", baseURL);
  // Fragments stay out of HTTP request URLs, referrers, and server access logs.
  url.hash = new URLSearchParams({ token }).toString();
  await sendEmail(to, "Reset your Kanbrik password", `A password reset was requested for your Kanbrik account.\n\nOpen this link to choose a new password:\n${url.href}\n\nThis link expires in one hour and can be used once. If you did not request it, you can ignore this email.`);
}

export async function sendEmail(to: string, subject: string, text: string) {
  const config = smtpSettings().config;
  if (!config) throw new Error("Email is not configured");
  const localPlaintext = ["local", "test"].includes(process.env.KANBRIK_ENV ?? "") &&
    ["127.0.0.1", "localhost", "::1"].includes(config.host) && process.env.SMTP_ALLOW_INSECURE_LOCAL === "true";
  const transport = nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.port === 465,
    requireTLS: !localPlaintext, ignoreTLS: localPlaintext,
    auth: { user: config.user, pass: config.password },
    logger: false, debug: false, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  try {
    const result = await transport.sendMail({
      from: config.from, to, subject, text,
      textEncoding: "base64",
    });
    if (result.rejected?.length) throw new Error();
  } catch { throw new Error("Email delivery failed"); }
  finally { transport.close(); }
}
