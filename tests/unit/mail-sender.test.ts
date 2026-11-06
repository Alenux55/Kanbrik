import { expect, it } from "vitest";
import { mailSenderSchema } from "../../src/server/mail-sender";

it.each([
  ["notify@example.com", "", "notify@example.com"],
  ["Kanbrik Notifications <notify@example.com>", "Kanbrik Notifications", "notify@example.com"],
  ['"Kanbrik, Notifications" <notify@example.com>', "Kanbrik, Notifications", "notify@example.com"],
  [" Équipe Kanbrik <notify@example.com> ", "Équipe Kanbrik", "notify@example.com"],
])("accepts a single sender mailbox: %s", (value, name, address) => {
  expect(mailSenderSchema.parse(value)).toEqual({ name, address });
});

it.each(["", "Kanbrik", "Kanbrik <invalid>", " <notify@example.com>", "one@example.com, two@example.com", "One <one@example.com>, Two <two@example.com>", "Kanbrik\r\nBcc: other@example.com <notify@example.com>"])("rejects invalid/multiple/injected sender: %s", value => {
  expect(mailSenderSchema.safeParse(value).success).toBe(false);
});
