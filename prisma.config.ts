import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Validation needs no database or credentials; no remote fallback is allowed.
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://kanbrik_dev:local-only@127.0.0.1:5433/kanbrik_dev" },
});
