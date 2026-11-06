import { defineConfig, devices } from "@playwright/test";
import { testEnvironment } from "./scripts/test-env.mjs";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  // Never capture password fields or session tokens in traces/videos.
  use: { baseURL: "http://127.0.0.1:3100", trace: "off", video: "off", screenshot: "off" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    { command: "node tests/mail-capture.mjs", url: "http://127.0.0.1:3126/health", reuseExistingServer: false, env: testEnvironment() },
    { command: "npm run start -- --port 3100", url: "http://127.0.0.1:3100/sign-in", reuseExistingServer: false, env: testEnvironment() },
    { command: "npm run start -- --port 3102", url: "http://127.0.0.1:3102/sign-in", reuseExistingServer: false, env: { ...testEnvironment(), KANBRIK_ENV: "production", BETTER_AUTH_URL: "http://127.0.0.1:3102", ENABLE_LOCAL_REGISTRATION: "true", PASSWORD_RESET_ENABLED: "false" } },
  ],
});
