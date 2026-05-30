import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — single mobile-Chrome project, against the local dev
 * server. CI starts web + gateway via `pnpm dev` in a separate step before
 * invoking `pnpm --filter @smart-dining/web test:e2e`.
 *
 * For local runs: `pnpm dev` in one terminal, `pnpm test:e2e` in another.
 */

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // shared cart state across tests = serial
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['github'], ['html']] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 8_000,
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
