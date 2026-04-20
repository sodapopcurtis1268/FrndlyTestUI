import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load .env for local runs; GitHub Actions injects env vars directly
dotenv.config();

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',

  // Global test timeout (per test).
  // Budget: 30 s goto + 30 s Angular render + 30 s video + 30 s screenshot/cleanup = 120 s
  timeout: 120_000,

  // expect() timeout (auto-wait)
  expect: { timeout: 30_000 },

  // Retry once to handle transient network flakes (slow Frndly TV server,
  // Angular lazy-load timeouts). One retry is cheap vs. false-failure noise.
  retries: 1,

  // Parallel workers: 4 on CI (4 independent browser sessions); 1 locally so
  // you can watch the headed run without windows fighting each other
  workers: isCI ? 4 : 1,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    baseURL: process.env.BASE_URL ?? 'https://frndlytv-prod-copyweb.revlet.net/',

    // Keep video/screenshot/trace only when a test fails — avoids storing
    // gigabytes of recordings for every passing test
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',

    // No actionTimeout set here — individual methods pass explicit timeouts
    // where needed. The global test timeout (90 s above) is the safety net.
  },

  // Output directory for test artifacts (videos, screenshots, traces)
  outputDir: 'test-results',

  projects: [
    // ── Auth setup (runs once before any test suite) ─────────────────────────
    // Logs in and saves .auth/user.json so all suites start pre-authenticated.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },

    // ── Smoke suite ──────────────────────────────────────────────────────────
    // Fast sanity check (~3 tests). Run after every deploy or code change.
    //   npx playwright test --project=smoke
    //   npx playwright test --grep @smoke
    {
      name: 'smoke',
      testMatch: /\/(liveNow|trendingMovies|frndlyTV)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Use Google Chrome (not Chromium) — Chrome includes Widevine DRM
        // which is required for VOD playback on Frndly TV.
        channel: 'chrome',
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // ── Regression suite ─────────────────────────────────────────────────────
    // One test per row (19 rows). Run nightly or on PR.
    //   npx playwright test --project=regression
    //   npx playwright test --grep @regression
    //   npx playwright test blockbusterBoulevard   ← run a single row
    {
      name: 'regression',
      testMatch: /\/rows\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: '.auth/user.json',
        video: 'on',  // record every row test — playback visible in HTML report
      },
      dependencies: ['setup'],
    },

    // ── Home Screen suite ────────────────────────────────────────────────────
    // Performance tests for the home screen load time SLA.
    //   npx playwright test --project=homeScreen
    {
      name: 'homeScreen',
      testMatch: /\/homeScreen\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: '.auth/user.json',
        video: 'on',
      },
      dependencies: ['setup'],
    },

    // Uncomment to add cross-browser coverage:
    // { name: 'smoke-firefox',     testMatch: /\/(liveNow|trendingMovies|frndlyTV)\.spec\.ts/,     use: { ...devices['Desktop Firefox'], storageState: '.auth/user.json' }, dependencies: ['setup'] },
    // { name: 'regression-webkit', testMatch: /\/(homePageRows|assetPlayback)\.spec\.ts/, use: { ...devices['Desktop Safari'],  storageState: '.auth/user.json' }, dependencies: ['setup'] },
  ],
});
