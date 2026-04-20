import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';
import { config } from '../utils/config';

/**
 * Asset playback tests — one test per card play.
 *
 * Structure: 20 rows × 3 cards = 60 individual tests. Each test:
 *   1. Navigates to /home (already authenticated via storageState from auth.setup.ts)
 *   2. Clicks one specific card in one row
 *   3. Measures time-to-first-frame (TTFF) and attaches it to the HTML report
 *   4. Saves a screenshot for visual verification
 *   5. Video is automatically recorded per test (test.use({ video: 'on' }))
 *
 * With workers=4, four tests run in parallel — each in its own isolated
 * browser context. No shared state between tests.
 *
 * Mirrors AssetPlaybackTest.java.
 */

// Record video for every test (overrides the project default of 'retain-on-failure')
test.use({ video: 'on' });

const HOME_URL = config.homeUrl;

const ROWS = [
  'Live Now',
  'Recommended for You',
  'Blockbuster Boulevard',
  'New Episodes',
  'Just Added Movies',
  'Watch Again',
  'Frndly Featured',
  'Trending Now',
  '72-Hour Look Back',
  'Coming Soon - Set Your DVR',
  'Timeless Classics',
  'Frndly TV Fan Favorites',
  'Hallmark Holidays',
  'History or Mystery',
  'Rom-Com',
  'My Recordings',
  'My Favorites',
  'Most Watched',
  'Leaving This Month',
  'Frndly TV Staff Picks',
];

// 20 rows × 3 cards = 60 individual tests
// Card indices 0, 1, 2 = first 3 cards in each row.
// The test itself skips gracefully if the row or card doesn't exist.
interface TestCase {
  rowName: string;
  cardIndex: number;
}

const TEST_CASES: TestCase[] = ROWS.flatMap(rowName =>
  [0, 1, 2].map(cardIndex => ({ rowName, cardIndex }))
);

for (const { rowName, cardIndex } of TEST_CASES) {
  test(`@regression ${rowName} — card ${cardIndex + 1}`, async ({ page }, testInfo) => {
    // ── Navigate to /home (storageState = already logged in) ─────────────────
    await navigateHome(page);

    const db = new DashboardPage(page);

    // ── Check card exists ────────────────────────────────────────────────────
    const cardCount = await db.getCardCountInRow(rowName);
    if (cardCount === 0) {
      test.skip(true, `Row '${rowName}' not found or has no cards`);
      return;
    }
    if (cardCount <= cardIndex) {
      test.skip(true, `Row '${rowName}' has only ${cardCount} cards (index ${cardIndex} out of range)`);
      return;
    }

    // ── Click the card ───────────────────────────────────────────────────────
    const startMs = Date.now();
    const player = await db.clickCardAtIndexInRow(rowName, cardIndex);
    if (!player) {
      throw new Error(`Row '${rowName}' card[${cardIndex}]: not found after scrolling`);
    }

    // ── Measure time-to-first-frame (TTFF) ───────────────────────────────────
    const ttffMs = await player.waitForVideoToStart(config.videoTimeoutSeconds);

    if (ttffMs === -1) {
      throw new Error(
        `Row '${rowName}' card[${cardIndex}]: video did not start within ${config.videoTimeoutSeconds} s`
      );
    }

    console.log(`Row '${rowName}' card[${cardIndex}] — TTFF: ${ttffMs} ms`);

    // ── Attach TTFF to the Playwright HTML report ────────────────────────────
    // Visible in the report under each test's "Attachments" section.
    await testInfo.attach('time-to-first-frame', {
      body: Buffer.from(`${ttffMs} ms`),
      contentType: 'text/plain',
    });

    // ── Capture screenshot for visual verification ───────────────────────────
    const screenshotLabel = `${rowName.replace(/[^a-zA-Z0-9]+/g, '-')}-card${cardIndex}`;
    await player.captureScreenshot(screenshotLabel);

    // ── Assert TTFF within acceptable range ─────────────────────────────────
    expect(ttffMs, `TTFF exceeded ${config.videoTimeoutSeconds} s threshold`).toBeLessThanOrEqual(
      config.videoTimeoutSeconds * 1000
    );
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Navigates to /home using domcontentloaded (faster for Angular SPAs than the
 * default 'load' event), then waits for row content to appear.
 * Retries with a hard refresh if Angular fails to bootstrap on first load.
 */
async function navigateHome(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });

  const contentLoaded = () =>
    page.waitForFunction(
      () => document.querySelectorAll('h3.ott_tray_title').length > 0,
      { timeout: 30_000 }
    );

  try {
    await contentLoaded();
    return;
  } catch {
    if (!page.url().startsWith(HOME_URL)) {
      throw new Error(`Session expired, redirected to: ${page.url()}`);
    }
    console.log('Home page content not loaded after 30 s; retrying with refresh');
    await page.reload({ waitUntil: 'domcontentloaded' });
  }

  try {
    await contentLoaded();
  } catch {
    if (page.url().startsWith(HOME_URL)) {
      throw new Error('Home page failed to display row content after navigate + refresh (60 s total)');
    }
    throw new Error(`Session expired after refresh, redirected to: ${page.url()}`);
  }
}
