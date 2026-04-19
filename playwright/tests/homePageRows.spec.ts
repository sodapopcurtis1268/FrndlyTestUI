import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { FrndlyLoginPage } from '../pages/FrndlyLoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { config } from '../utils/config';

/**
 * Tests the first asset in each of the 20 home-page content rows.
 *
 * Each row is a separate test entry in the Playwright HTML report (mirrors
 * TestNG @DataProvider behaviour). With workers=4 in CI, 4 rows run in
 * parallel — each in its own isolated browser context with its own login
 * session. No shared state between tests.
 *
 * Mirrors HomePageRowsTest.java.
 */

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
  test(`Row: ${rowName}`, async ({ page }) => {
    // Each test gets its own browser context (Playwright default) so login is
    // independent — no session sharing between parallel rows.
    const dashboard = await new FrndlyLoginPage(page).login(config.username, config.password);

    // Navigate to /home and verify content loaded
    await page.goto(HOME_URL);
    await page.waitForFunction(
      () => document.querySelectorAll('h3.ott_tray_title').length > 0,
      { timeout: 30_000 }
    );

    const db = new DashboardPage(page);
    const cardCount = await db.getCardCountInRow(rowName);

    if (cardCount === 0) {
      console.warn(`SKIP: row '${rowName}' not found or has no cards`);
      test.skip(); // graceful skip — row not present for this account
      return;
    }

    console.log(`Row '${rowName}' — ${cardCount} cards`);

    // Click the first card
    const screenshotName = rowName.replace(/[^a-zA-Z0-9]+/g, '-') + '-card0-' + Date.now();
    const player = await db.clickCardAtIndexInRow(rowName, 0);

    if (!player) {
      throw new Error(`Row '${rowName}' card[0]: not found after scrolling`);
    }

    const screenshotPath = await player.captureScreenshot(screenshotName);

    // Navigate back to stop playback
    await navigateHome(page);

    // Validate the screenshot file was saved
    expect(fs.existsSync(screenshotPath), `Screenshot not saved: ${screenshotPath}`).toBe(true);
    expect(fs.statSync(screenshotPath).size, `Screenshot is empty: ${screenshotPath}`).toBeGreaterThan(0);

    console.log(`Row '${rowName}' — screenshot: ${path.basename(screenshotPath)}`);
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigates to /home with a refresh retry if Angular fails to bootstrap content.
 * Throws if content never appears (prevents indefinite hangs on VOD rows).
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
      // Redirected to /authenticator — session expired (unusual mid-test)
      throw new Error(`Session expired, redirected to: ${page.url()}`);
    }
    // Angular stuck after VOD — try a hard refresh
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
