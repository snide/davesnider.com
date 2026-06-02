import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /(.+\.)?(test|spec)\.[jt]s/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['json', { outputFile: 'tests/e2e/test-results.json' }]],
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5177',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 720 }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:5177',
        reuseExistingServer: !process.env.CI,
        timeout: 120000
      }
});
