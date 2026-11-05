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
  };
}
