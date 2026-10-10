import { defineConfig, devices } from '@playwright/test'

// E2E config for the account-management flows.
//
// Requires (see e2e/README.md):
//   - the account-management migration applied to the target database
//   - a running app at E2E_BASE_URL (default http://localhost:3000)
//   - an admin account: E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
//
// Run:  E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... pnpm test:e2e

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  // Optionally let Playwright start the dev server. Disabled by default because
  // a server is usually already running; enable by setting E2E_START_SERVER=1.
  webServer: process.env.E2E_START_SERVER
    ? {
        command: 'pnpm dev',
        url: BASE_URL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
})
