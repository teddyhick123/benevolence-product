import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/walkthrough',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/walkthrough-junit.xml' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    navigationTimeout: 90_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run walkthrough:dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
