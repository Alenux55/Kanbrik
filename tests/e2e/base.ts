import { test as base } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertTestDatabase } from "../../scripts/test-target.mjs";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL) }), log: [] });
export const test = base.extend<{ testAccounts: string[]; authThrottle: void }>({
  // Browser contexts share one loopback IP. Respect Better Auth's 3/10s auth limit.
  authThrottle: [async ({}, use) => { await new Promise(resolve => setTimeout(resolve, 10500)); await use(); }, { auto: true }],
  testAccounts: [async ({}, runFixture) => {
    const emails: string[] = [];
    try { await runFixture(emails); }
    finally { await db.user.deleteMany({ where: { email: { in: emails } } }); }
  }, { auto: true }],
});
export { expect } from "@playwright/test";
