import { describe, expect, it } from "vitest";
import { assertTestDatabase } from "../../scripts/test-target.mjs";

describe("destructive test target guard", () => {
  it("accepts a dedicated loopback test database", () => {
    expect(assertTestDatabase("postgresql://test@127.0.0.1:55432/kanbrik_test?schema=public")).toBeTruthy();
  });
  it.each([
    undefined, "bad", "postgresql://test@remote.example/kanbrik_test",
    "postgresql://test@127.0.0.1/kanbrik_dev", "postgresql://test@127.0.0.1/production",
    "postgresql://test@127.0.0.1/kanbrik_test?host=remote.example",
    "postgresql://test@127.0.0.1/kanbrik_test?schema=other",
  ])("refuses ambiguous or non-test target %s", url => {
    expect(() => assertTestDatabase(url)).toThrow();
  });
});
