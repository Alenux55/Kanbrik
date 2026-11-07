import { test as base } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertTestDatabase } from "../../scripts/test-target.mjs";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL) }), log: [] });
export const test = base.extend<{ testAccounts: string[]; testWorkspaces: string[]; authThrottle: void }>({
  // Browser contexts share one loopback IP. Respect Better Auth's 3/10s auth limit.
  authThrottle: [async ({}, use) => { await new Promise(resolve => setTimeout(resolve, 10500)); await use(); }, { auto: true }],
  testWorkspaces: [async ({}, runFixture) => {
    const ids: string[] = [];
    try { await runFixture(ids); }
    finally { await db.timeBlock.deleteMany({ where: { workspaceId: { in: ids } } }); await db.workspace.deleteMany({ where: { id: { in: ids } } }); }
  }, { auto: true }],
  testAccounts: [async ({ testWorkspaces }, runFixture) => {
    const emails: string[] = [];
    try { await runFixture(emails); }
    finally {
      // Delete shared fixtures before users, whose membership cascades do not
      // delete a shared workspace. Every ID/email belongs to this test only.
      await db.timeBlock.deleteMany({ where: { workspace: { OR: [{ id: { in: testWorkspaces } }, { personalOwner: { email: { in: emails } } }] } } });
      await db.workspace.deleteMany({ where: { id: { in: testWorkspaces } } });
      await db.user.deleteMany({ where: { email: { in: emails } } });
    }
  }, { auto: true }],
});
export { expect } from "@playwright/test";
