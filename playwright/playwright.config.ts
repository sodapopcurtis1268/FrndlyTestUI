import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load .env for local runs; GitHub Actions injects env vars directly
dotenv.config();

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',

  // Global test timeout (per test).
  // Budget: 30 s goto + 30 s Angular render + 30 s video + 30 s screenshot/cleanup + 60 s CI headroom = 180 s
  // CI machines share CPU across 2 workers + video recording, so navigation alone can take 60-90 s.
  timeout: 180_000,

  // expect() timeout (auto-wait)
  expect: { timeout: 30_000 },

  // Retry once to handle transient network flakes (slow Frndly TV server,
  // Angular lazy-load timeouts). One retry is cheap vs. false-failure noise.
  retries: 1,

  // Parallel workers: 2 on CI — 4 workers caused CPU contention that made
  // page.goto + waitForFunction consume 90+ s, leaving no budget for video.
  // 2 workers doubles per-test CPU budget; suite takes ~2× longer but is stable.
  workers: isCI ? 2 : 1,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['./utils/testrailReporter.ts'],
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

    // ── Login suite ──────────────────────────────────────────────────────────
    // Verifies end-to-end login flow with real credentials (no saved auth state).
    //   npx playwright test --project=login
    {
      name: 'login',
      testMatch: /\/login\.spec\.ts/,
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

    // ── Player suite ─────────────────────────────────────────────────────────
    // Functional tests for video player features (CC, playback controls, etc.)
    //   npx playwright test --project=player
    {
      name: 'player',
      testMatch: /\/player\/(closedCaptions|rowInternalScrollLag)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: '.auth/user.json',
        video: 'on',
      },
      dependencies: ['setup'],
    },

    // ── Guide CC suite ───────────────────────────────────────────────────────
    // Long-running: iterates every guide channel, 25 s playback each.
    //   npx playwright test --project=guideCC
    {
      name: 'guideCC',
      testMatch: /\/player\/guideChannelCC\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: '.auth/user.json',
        video: 'retain-on-failure',
        // Allow video autoplay without a prior user gesture.
        // page.goto() does not count as a user interaction so Chrome's default
        // autoplay policy silently blocks live streams from playing.
        launchOptions: {
          args: ['--autoplay-policy=no-user-gesture-required'],
        },
      },
      dependencies: ['setup'],
    },

    // ── Navigation suite ─────────────────────────────────────────────────────
    // UX / Usability tests: focused states, keyboard navigation, header behaviour.
    //   npx playwright test --project=navigation
    {
      name: 'navigation',
      testMatch: /\/navigation\/.*\.spec\.ts/,
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
