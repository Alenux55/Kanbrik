import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertTestDatabase } from "../scripts/test-target.mjs";

export const testDB = new PrismaClient({ adapter: new PrismaPg({ connectionString: assertTestDatabase(process.env.TEST_DATABASE_URL) }), log: [] });

// Test-database-only trigger. Failure applies exclusively to one owned fixture.
// There is no application flag, route, or production failure-injection facility.
export async function failFixtureMembership(userId: string) {
  const name = `fixture_fail_${randomUUID().replaceAll("-", "")}`;
  const literal = userId.replaceAll("'", "''");
  await testDB.$executeRawUnsafe(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${literal}' THEN RAISE EXCEPTION 'Fixture membership unavailable'; END IF; RETURN NEW; END $$`);
  try {
    await testDB.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE INSERT OR UPDATE ON "Membership" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
  } catch (error) {
    await testDB.$executeRawUnsafe(`DROP FUNCTION ${name}()`);
    throw error;
  }
  return async () => {
    await testDB.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "Membership"`);
    await testDB.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`);
  };
}
