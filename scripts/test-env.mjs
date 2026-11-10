import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import { assertTestDatabase } from './test-target.mjs';

export function testEnvironment() {
  const fromFile = config({ path: '.env.test', quiet: true, processEnv: {} }).parsed ?? {};
  const database = assertTestDatabase(process.env.TEST_DATABASE_URL ?? fromFile.TEST_DATABASE_URL);
  return {
    ...process.env,
    DATABASE_URL: database,
    TEST_DATABASE_URL: database,
    BETTER_AUTH_URL: 'http://127.0.0.1:3100',
    BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
    KANBRIK_ENV: 'test',
    ENABLE_LOCAL_REGISTRATION: 'true',
    INVITATION_ADMIN_EMAILS: '',
    PASSWORD_RESET_ENABLED: 'true',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: '3125', SMTP_USER: 'kanbrik_test',
    SMTP_PASSWORD: randomBytes(32).toString('hex'), SMTP_FROM: 'no-reply@example.invalid',
    SMTP_ALLOW_INSECURE_LOCAL: 'true',
    TEST_MAIL_SECRET: process.env.TEST_MAIL_SECRET ?? randomBytes(32).toString('hex'),
  };
}
