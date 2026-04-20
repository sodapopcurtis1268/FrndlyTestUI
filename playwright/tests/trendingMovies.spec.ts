import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';
import { config } from '../utils/config';

/**
 * Measures time-to-first-frame (TTFF) for a random content row's first asset.
 *
 * Filters out non-content rows (navigation rows, DVR, user-specific rows),
 * picks a random eligible row, clicks the first card, and asserts that video
 * starts within VIDEO_TIMEOUT_SECONDS.
 *
 * Retries up to 3 different rows when DRM blocks playback (VOD content
 * requires Widevine which isn't available in the test environment). If all
 * sampled rows are DRM-blocked the test is skipped rather than failed.
 *
 * Video is recorded automatically via playwright.config.ts.
 *
 * Mirrors TrendingMoviesPlaybackTest.java.
 */

// Rows excluded from random selection:
// - Navigation/meta rows that aren't playable content
// - VOD-only rows where cards open a detail page requiring a play button click
//   (these work fine in regression but add unpredictability to a smoke TTFF test)
const EXCLUDED_ROWS = new Set([
  'Browse By Genre',
  'Coming Soon',
  'Featured Channels',
  'Add-Ons',
  'My Recordings',
  'My Favorites',
  '72-Hour Look Back',
  'Continue Watching',
  'Coming Soon - Set Your DVR',
  'Frndly TV Staff Picks',
  'Leaving This Month',
]);

const MAX_DRM_RETRIES = 3;

test('@smoke Random row — time to first frame', async ({ page }) => {
  // ── Navigate to /home (already authenticated via storageState) ───────────────
  await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelectorAll('h3.ott_tray_title').length > 0,
    { timeout: 30_000 }
  );

  // ── Scroll full dashboard to load all rows ──────────────────────────────────
  const db = new DashboardPage(page);
  await db.scrollPageToLoadAllRows();

  // ── Collect and filter row names ────────────────────────────────────────────
  const allRows = await db.getRowNames();
  const eligible = allRows.filter(row =>
    !EXCLUDED_ROWS.has(row) &&
    !row.startsWith('Because You Watched')
  );

  if (eligible.length === 0) {
    throw new Error('No eligible content rows found on the home page');
  }

  // ── Shuffle eligible rows so retries pick different ones ────────────────────
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const toTry = shuffled.slice(0, MAX_DRM_RETRIES);

  let lastRowName = '';
  let ttffMs = -2;
  let winningPlayer = null;

  for (const rowName of toTry) {
    lastRowName = rowName;
    console.log(`Selected row: '${rowName}' (${eligible.length} eligible rows)`);

    // Navigate back to /home between retries (page may have changed after a click)
    if (rowName !== toTry[0]) {
      await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => document.querySelectorAll('h3.ott_tray_title').length > 0,
        { timeout: 30_000 }
      );
    }

    const player = await db.clickFirstCardInRow(rowName);
    if (!player) {
      console.log(`Row '${rowName}': no cards found, trying next row`);
      continue;
    }

    ttffMs = await player.waitForVideoToStart(config.videoTimeoutSeconds);

    if (ttffMs === -2) {
      console.log(`Row '${rowName}': DRM blocked — trying next row`);
      continue;
    }

    // Got a result (positive TTFF or -1 timeout) — keep this player and stop retrying
    winningPlayer = player;
    break;
  }

  if (ttffMs === -2) {
    test.skip(true, `All sampled rows DRM-blocked (Widevine not available in this environment)`);
    return;
  }

  if (ttffMs === -1) {
    throw new Error(
      `Row '${lastRowName}': video did not start within ${config.videoTimeoutSeconds} s`
    );
  }

  console.log(`Row '${lastRowName}' — TTFF: ${ttffMs} ms`);

  await winningPlayer!.captureScreenshot(`trending-${lastRowName.replace(/[^a-zA-Z0-9]+/g, '-')}`);

  // ── Assert TTFF is within the configured threshold ─────────────────────────
  expect(ttffMs).toBeLessThanOrEqual(config.videoTimeoutSeconds * 1000);
});
