import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForDB = globalThis as unknown as { kanbrikDB?: PrismaClient };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return globalForDB.kanbrikDB ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }), log: [] });
}
