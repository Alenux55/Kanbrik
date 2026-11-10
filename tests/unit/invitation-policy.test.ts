import { expect, it } from "vitest";
import { invitationAdmins, invitationOriginAllowed } from "../../src/server/invitation-policy";
import { smtpSettings, passwordEmailSettings } from "../../src/server/password-email-config.mjs";
it("invitation administration is an explicit normalized allowlist that fails closed", () => {
  expect(invitationAdmins("")).toEqual([]);
  expect(invitationAdmins(" Owner@Example.com, other@example.com,owner@example.com ")).toEqual(["owner@example.com", "other@example.com"]);
  expect(invitationAdmins("owner@example.com,not-an-email")).toEqual([]);
});
it("invitation links require HTTPS except explicit loopback local/test", () => {
  expect(invitationOriginAllowed(new URL("https://kanbrik.example.com"), "production")).toBe(true);
  expect(invitationOriginAllowed(new URL("http://10.0.0.95:3005"), "preview")).toBe(false);
  expect(invitationOriginAllowed(new URL("http://localhost:3005"), "production")).toBe(false);
  expect(invitationOriginAllowed(new URL("http://127.0.0.1:3108"), "test")).toBe(true);
});
it("invitation SMTP configuration is independent of password recovery enablement", () => {
  const env = { SMTP_HOST: "mail.example.com", SMTP_USER: "sender@example.com", SMTP_PASSWORD: "test-only", SMTP_FROM: "Kanbrik <sender@example.com>", PASSWORD_RESET_ENABLED: "false" };
  expect(smtpSettings(env).config).not.toBeNull();
  expect(passwordEmailSettings(env).config).toBeNull();
});
