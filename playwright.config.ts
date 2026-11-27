import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests (issue #110). `npm run e2e` starts:
 *   1. a fake TMDB (e2e/tmdb-stub.mjs), so no real TMDB key or network is needed;
 *   2. the app itself, with dev login on and TMDB pointed at the fake.
 * Then it drives a real browser through the core flows.
 *
 * The app runs with `next dev`, not `next start`: dev login is deliberately
 * disabled whenever NODE_ENV=production (lib/devLogin.ts), and `next start`
 * always sets that. We don't loosen that gate for tests.
 *
 * Needs DATABASE_URL pointing at a throwaway or dev database (never production):
 * locally the Neon dev branch from .env.local, in CI a Postgres service container.
 */
// Locally the database URL lives in .env.local (Next reads that itself, but the
// production guard and the teardown below run in this process). Real env vars win.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (CI): the environment already has what's needed.
}

const port = Number(process.env.E2E_PORT ?? 3310);
const stubPort = port + 1000;

const databaseUrl = process.env.DATABASE_URL ?? "";
// Playwright runs this file before the tests, so the guard also stops a run
// that would write test users into production.
if (/ep-rough-art/.test(databaseUrl)) {
  throw new Error("Refusing to run e2e tests: DATABASE_URL points at the production database.");
}

export default defineConfig({
  testDir: "./e2e",
  // Not *.spec.ts: Vitest would pick those up.
  testMatch: "**/*.e2e.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // The tests share one database and sign in as distinct users, but a first
  // `next dev` request compiles each route, so run them one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node e2e/tmdb-stub.mjs ${stubPort}`,
      url: `http://127.0.0.1:${stubPort}/3/genre/movie/list`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx next dev -p ${port} -H 127.0.0.1`,
      url: `http://127.0.0.1:${port}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        DEV_LOGIN: "1",
        TMDB_API_KEY: "e2e-stub-key",
        TMDB_API_BASE_URL: `http://127.0.0.1:${stubPort}/3`,
        AUTH_SECRET: process.env.AUTH_SECRET || "e2e-only-secret-not-used-anywhere-else",
        // Nothing in the smoke tests sends email; make sure it can't.
        RESEND_API_KEY: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
