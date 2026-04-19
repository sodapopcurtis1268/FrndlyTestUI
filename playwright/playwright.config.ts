import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load .env for local runs; GitHub Actions injects env vars directly
dotenv.config();

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',

  // Global test timeout (per test)
  timeout: 90_000,

  // expect() timeout (auto-wait)
  expect: { timeout: 30_000 },

  // Retry once on CI to handle transient network flakes; no retries locally
  retries: isCI ? 1 : 0,

  // Parallel workers: 4 on CI (4 independent browser sessions); 1 locally so
  // you can watch the headed run without windows fighting each other
  workers: isCI ? 4 : 1,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? 'https://try.frndlytv.com',

    // Keep video/screenshot/trace only when a test fails — avoids storing
    // gigabytes of recordings for every passing test
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',

    // actionTimeout controls how long individual actions (click, fill, etc.)
    // wait before throwing. 15 s is generous for remote page interactions.
    actionTimeout: 15_000,
  },

  // Output directory for test artifacts (videos, screenshots, traces)
  outputDir: 'test-results',

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment to add cross-browser coverage in CI:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',  use: { ...devices['Desktop Safari'] } },
  ],
});
