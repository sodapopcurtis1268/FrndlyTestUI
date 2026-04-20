import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';
import { config } from '../utils/config';

/**
 * Live Now — first asset time-to-first-frame (TTFF).
 *
 * Single focused test:
 *   1. Navigate to /home (pre-authenticated via storageState)
 *   2. Find the "Live Now" row
 *   3. Click the first card
 *   4. Measure TTFF — time from click until video is actually playing
 *   5. Attach TTFF ms to the HTML report
 *   6. Capture a screenshot of the playing video
 *
 * Video is recorded for every run (not just on failure) so you can review
 * the full playback sequence in the Playwright report.
 */

test.use({ video: 'on' });

const ROW_NAME = 'Live Now';
const HOME_URL = config.homeUrl;

test(`${ROW_NAME} — first asset TTFF`, async ({ page }, testInfo) => {
  // ── Navigate to /home ────────────────────────────────────────────────────────
  // storageState (from auth.setup.ts) means we arrive already logged in.
  // domcontentloaded is faster than the default 'load' for Angular SPAs.
  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });

  // Wait for at least one row to be rendered before we start scrolling
  await page.waitForFunction(
    () => document.querySelectorAll('h3.ott_tray_title').length > 0,
    { timeout: 30_000 }
  );

  const db = new DashboardPage(page);

  // ── Verify the row exists ────────────────────────────────────────────────────
  const cardCount = await db.getCardCountInRow(ROW_NAME);
  if (cardCount === 0) {
    throw new Error(`Row '${ROW_NAME}' not found or has no cards — check that this row is visible for this account`);
  }
  console.log(`Row '${ROW_NAME}' — ${cardCount} cards visible`);

  // ── Click first card and start timing ───────────────────────────────────────
  // clickFirstCardInRow scrolls the card into view and uses jsClick to bypass
  // Playwright's visibility check for Angular lazy-loaded cards.
  const clickedAt = Date.now();
  const player = await db.clickFirstCardInRow(ROW_NAME);
  if (!player) {
    throw new Error(`Row '${ROW_NAME}': card[0] not found after scrolling`);
  }

  // ── Measure TTFF ─────────────────────────────────────────────────────────────
  // waitForVideoToStart polls every 500 ms for video.currentTime > 0 (VOD) or
  // !video.paused (live). Returns elapsed ms since PlayerPage was constructed,
  // or -1 if the video never starts within the timeout.
  const ttffMs = await player.waitForVideoToStart(config.videoTimeoutSeconds);

  if (ttffMs === -1) {
    throw new Error(
      `'${ROW_NAME}' card[0]: video did not start within ${config.videoTimeoutSeconds} s`
    );
  }

  const totalElapsedMs = Date.now() - clickedAt;
  console.log(`TTFF: ${ttffMs} ms  |  total elapsed from click: ${totalElapsedMs} ms`);

  // ── Attach TTFF to the Playwright HTML report ─────────────────────────────────
  // Visible under each test's "Attachments" tab in the report.
  await testInfo.attach('time-to-first-frame', {
    body: Buffer.from(`${ttffMs} ms`),
    contentType: 'text/plain',
  });

  // ── Screenshot of playing video ───────────────────────────────────────────────
  // captureScreenshot waits VIDEO_PLAY_SECONDS, then takes a full-page screenshot.
  await player.captureScreenshot(`live-now-card0`);

  // ── Assert TTFF within threshold ─────────────────────────────────────────────
  expect(ttffMs, `TTFF ${ttffMs} ms exceeded ${config.videoTimeoutSeconds * 1000} ms threshold`)
    .toBeLessThanOrEqual(config.videoTimeoutSeconds * 1000);
});
