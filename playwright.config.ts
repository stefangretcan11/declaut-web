import { defineConfig } from "@playwright/test";

process.loadEnvFile(".env.local");

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    channel: "chrome",
    trace: "off",
    screenshot: "off",
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    env: { SITE_URL: "http://127.0.0.1:3100" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
