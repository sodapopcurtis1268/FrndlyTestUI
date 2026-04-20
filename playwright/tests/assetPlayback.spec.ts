import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { FrndlyLoginPage } from '../pages/FrndlyLoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { PlayerPage } from '../pages/PlayerPage';
import { config } from '../utils/config';

/**
 * Tests the first 3 and last 3 assets in each of the 20 home-page content rows.
 *
 * Each row is a separate test — with workers=4 in CI, four rows run in parallel,
 * each in its own browser context with its own login session.
 *
 * Video is recorded for every test (configured via playwright.config.ts
 * video: 'retain-on-failure' — override per-test below if you want all videos).
 *
 * Mirrors AssetPlaybackTest.java.
 */

// Record video for every test in this file (override config default)
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

for (const rowName of ROWS) {
  test(`Asset Playback — ${rowName}`, async ({ page }) => {
    // ── Login ─────────────────────────────────────────────────────────────────
    const dashboard = await new FrndlyLoginPage(page).login(config.username, config.password);

    // ── Navigate to /home, get card count ────────────────────────────────────
    await navigateHome(page);
    const db = new DashboardPage(page);
    const cardCount = await db.getCardCountInRow(rowName);

    if (cardCount === 0) {
      console.warn(`SKIP: row '${rowName}' not found or has no cards`);
      test.skip();
      return;
    }

    console.log(`Row '${rowName}' — ${cardCount} cards`);

    // ── Determine test indices: first 3 + last 3 (de-duplicated) ─────────────
    const indices = getTestIndices(cardCount);
    const failures: string[] = [];

    for (const index of indices) {
      const failure = await testCard(page, rowName, index);
      if (failure) failures.push(failure);
    }

    if (failures.length > 0) {
      throw new Error(`Row '${rowName}' had ${failures.length} card failure(s):\n${failures.join('\n')}`);
    }
  });
}

// ── Card test logic ───────────────────────────────────────────────────────────

async function testCard(
  page: import('@playwright/test').Page,
  rowName: string,
  index: number
): Promise<string | null> {
  // Fresh /home before each card so intersection observers reset
  try {
    await navigateHome(page);
  } catch (e) {
    return `card[${index}]: home page failed to load before click — ${(e as Error).message}`;
  }

  const db = new DashboardPage(page);
  const startMs = Date.now();
  const screenshotName = rowName.replace(/[^a-zA-Z0-9]+/g, '-') + '-card' + index + '-' + startMs;

  const player = await db.clickCardAtIndexInRow(rowName, index);
  if (!player) {
    return `card[${index}]: not found after scrolling`;
  }

  const screenshotPath = await player.captureScreenshot(screenshotName);

  // Navigate back to stop playback — VOD can leave Angular in a broken state
  try {
    await navigateHome(page);
  } catch (e) {
    console.warn(`Row '${rowName}' card[${index}]: home page failed to reload after playback`);
    return `card[${index}]: home page failed to reload after playback — ${(e as Error).message}`;
  }

  // Validate screenshot
  if (!fs.existsSync(screenshotPath)) {
    return `card[${index}]: screenshot not saved at ${screenshotPath}`;
  }
  if (fs.statSync(screenshotPath).size === 0) {
    return `card[${index}]: screenshot is empty — ${path.basename(screenshotPath)}`;
  }

  console.log(
    `Row '${rowName}' card[${index}] — started: ${new Date(startMs).toISOString()} | screenshot: ${path.basename(screenshotPath)}`
  );
  return null; // success
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * De-duplicated list of indices: first 3 + last 3.
 * total=10 → [0,1,2,7,8,9] | total=4 → [0,1,2,3] | total=2 → [0,1]
 */
function getTestIndices(total: number): number[] {
  const set = new Set<number>();
  for (let i = 0; i < Math.min(3, total); i++) set.add(i);
  for (let i = Math.max(0, total - 3); i < total; i++) set.add(i);
  return [...set];
}

/**
 * Navigates to /home with a refresh retry if Angular fails to bootstrap.
 * Throws after 60 s total so VOD rows don't run indefinitely.
 */
async function navigateHome(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(HOME_URL);

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
    await page.reload();
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
