import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';
import { PlayerPage } from '../pages/PlayerPage';
import { config } from '../utils/config';

/**
 * Measures time-to-first-frame (TTFF) for a random content row's first asset.
 *
 * Filters out non-content rows (navigation rows, DVR, user-specific rows),
 * picks a random eligible row, clicks the first card, and asserts that video
 * starts within VIDEO_TIMEOUT_SECONDS.
 *
 * Video is recorded automatically via playwright.config.ts.
 *
 * Mirrors TrendingMoviesPlaybackTest.java.
 */

// Rows that are navigation/meta rows, not playable content rows
const EXCLUDED_ROWS = new Set([
  'Browse By Genre',
  'Coming Soon',
  'Featured Channels',
  'Add-Ons',
  'My Recordings',
  'My Favorites',
  '72-Hour Look Back',
  'Continue Watching',
]);

test('Random row — time to first frame', async ({ page }) => {
  // ── Login ───────────────────────────────────────────────────────────────────
  await new FrndlyLoginPage(page).login(config.username, config.password);

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

  // ── Pick a random eligible row ──────────────────────────────────────────────
  const rowName = eligible[Math.floor(Math.random() * eligible.length)];
  console.log(`Selected row: '${rowName}' (${eligible.length} eligible rows)`);

  // ── Click first card and measure TTFF ───────────────────────────────────────
  const player = await db.clickFirstCardInRow(rowName);
  if (!player) {
    throw new Error(`Row '${rowName}': no cards found or click failed`);
  }

  const ttffMs = await player.waitForVideoToStart(config.videoTimeoutSeconds);

  if (ttffMs === -1) {
    throw new Error(
      `Row '${rowName}': video did not start within ${config.videoTimeoutSeconds} s`
    );
  }

  console.log(`Row '${rowName}' — TTFF: ${ttffMs} ms`);

  await player.captureScreenshot(`trending-${rowName.replace(/[^a-zA-Z0-9]+/g, '-')}`);

  // ── Assert TTFF is within the configured threshold ─────────────────────────
  expect(ttffMs).toBeLessThanOrEqual(config.videoTimeoutSeconds * 1000);
});
