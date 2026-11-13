import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3100";
const access = process.env.LEGACY_E2E_ACCESS === "1";
const local = access
  ? (JSON.parse(
      execFileSync("supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ) as { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string })
  : null;
if (local && local.API_URL !== "http://127.0.0.1:54321") {
  throw new Error("Las pruebas del portal requieren Supabase local");
}

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
  webServer: {
    command:
      "pnpm --filter @legacy-gym/web start --hostname 127.0.0.1 --port 3100",
    url: baseURL,
    reuseExistingServer: false,
    env: local
      ? {
          APP_ORIGIN: baseURL,
          SUPABASE_ANON_KEY: local.ANON_KEY,
          SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
        }
      : {},
  },
});
