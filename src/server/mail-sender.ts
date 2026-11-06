import { z } from "zod";

// Accept one mailbox, then let Nodemailer escape its display name safely.
export const mailSenderSchema = z.string().trim().max(512).transform((value, context) => {
  const formatted = value.match(/^([^<>]+)<([^<>]+)>$/u);
  let name = formatted?.[1].trim() ?? "";
  if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).trim();
  const address = formatted?.[2].trim() ?? value;
  if (/[\u0000-\u001f\u007f]/u.test(value) || !z.email().safeParse(address).success || (formatted && !name)) {
    context.addIssue({ code: "custom", message: "Use one email address or Name <email>, without control characters." });
    return z.NEVER;
  }
  return { name, address };
});
