import { expect, it } from "vitest";
import { registrationAllowed } from "../../src/server/registration-policy";

it("requires the preview mode, explicit opt-in and HTTPS together", () => {
  const https = new URL("https://kanbrik.example.invalid");
  expect(registrationAllowed("preview", https, false, true)).toBe(true);
  expect(registrationAllowed("preview", https, true, false)).toBe(false);
  expect(registrationAllowed("preview", new URL("http://10.0.0.95:3005"), true, true)).toBe(false);
  expect(registrationAllowed("preview", new URL("http://kanbrik.example.invalid"), true, true)).toBe(false);
  for (const mode of ["production", "unknown", "local", "test"]) expect(registrationAllowed(mode, https, true, true)).toBe(false);
});

it("preserves the separate explicit loopback-only local/test policy", () => {
  for (const mode of ["local", "test"]) {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(registrationAllowed(mode, new URL(`http://${host}:3000`), true, false)).toBe(true);
      expect(registrationAllowed(mode, new URL(`http://${host}:3000`), false, true)).toBe(false);
    }
    expect(registrationAllowed(mode, new URL("http://10.0.0.95:3005"), true, true)).toBe(false);
  }
  expect(registrationAllowed("production", new URL("http://127.0.0.1:3000"), true, true)).toBe(false);
});
