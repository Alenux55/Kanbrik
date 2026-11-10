import { z } from 'zod';
import { mailSenderSchema } from './mail-sender.ts';

const fields = { host: 'SMTP_HOST', port: 'SMTP_PORT', user: 'SMTP_USER', password: 'SMTP_PASSWORD', from: 'SMTP_FROM' };
const smtpSchema = z.object({
  host: z.string().min(1), port: z.coerce.number().int().min(1).max(65535),
  user: z.string().min(1), password: z.string().min(1), from: mailSenderSchema,
});

// Shared by the server and local diagnostic; never return raw validation errors.
/** @param {Record<string, string | undefined>} [env] */
export function smtpSettings(env = process.env) {
  const parsed = smtpSchema.safeParse({ host: env.SMTP_HOST, port: env.SMTP_PORT ?? '587', user: env.SMTP_USER, password: env.SMTP_PASSWORD, from: env.SMTP_FROM });
  const invalid = [];
  if (!parsed.success) for (const issue of parsed.error.issues) invalid.push(fields[issue.path[0]]);
  return { config: parsed.success && invalid.length === 0 ? parsed.data : null, invalid: [...new Set(invalid)] };
}

/** @param {Record<string, string | undefined>} [env] */
export function passwordEmailSettings(env = process.env) {
  const result = smtpSettings(env);
  if (env.PASSWORD_RESET_ENABLED !== 'true') return { config: null, invalid: ['PASSWORD_RESET_ENABLED', ...result.invalid] };
  return result;
}
