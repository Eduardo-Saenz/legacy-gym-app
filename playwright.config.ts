import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: {
    command:
      "pnpm --filter @legacy-gym/web start --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    reuseExistingServer: false,
  },
});
