import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { passwordEmailSettings } from "../../src/server/password-email-config.mjs";

const settings = {
  PASSWORD_RESET_ENABLED: "true", SMTP_HOST: "mail.example-domain.com", SMTP_PORT: "587",
  SMTP_USER: "kanbrik@example-domain.com", SMTP_PASSWORD: "generated-test-placeholder",
  SMTP_FROM: "Kanbrik Notifications <kanbrik@example-domain.com>",
};
it("accepts Mailcow-style settings with a nonempty password", () => {
  expect(passwordEmailSettings(settings).invalid).toEqual([]);
  expect(passwordEmailSettings(settings).config?.from.name).toBe("Kanbrik Notifications");
});
it.each(["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"])("identifies an empty %s without exposing values", field => {
  const result = passwordEmailSettings({ ...settings, [field]: "" });
  expect(result.config).toBeNull(); expect(result.invalid).toEqual([field]);
});
it("identifies disabled flags, invalid ports and malformed names", () => {
  expect(passwordEmailSettings({ ...settings, PASSWORD_RESET_ENABLED: "false" }).invalid).toEqual(["PASSWORD_RESET_ENABLED"]);
  expect(passwordEmailSettings({ ...settings, SMTP_PORT: "wrong" }).invalid).toEqual(["SMTP_PORT"]);
  expect(passwordEmailSettings({ ...settings, SMTP_FROM: '“Kanbrik <mail@example.com>”' }).invalid).toEqual(["SMTP_FROM"]);
});
it("the CLI reports overridden setting names without printing credentials", () => {
  const result = spawnSync(process.execPath, ["scripts/check-email-config.mjs"], {
    env: { ...process.env, ...settings, PASSWORD_RESET_ENABLED: "false", SMTP_PASSWORD: "secret-sentinel-never-print" }, encoding: "utf8", windowsHide: true,
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toContain("PASSWORD_RESET_ENABLED (inherited from the shell; overrides .env)");
  expect(result.stdout + result.stderr).not.toContain("secret-sentinel-never-print");
  expect(result.stdout + result.stderr).not.toContain(settings.SMTP_USER);
});
