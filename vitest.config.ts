import { defineConfig } from "vitest/config";

// Domain/database tests belong in tests/unit and tests/integration as features land.
export default defineConfig({ test: { environment: "node", include: ["tests/{unit,integration}/**/*.test.ts"] } });
