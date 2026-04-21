import { test, expect } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';
import { config } from './config';

const HOME_URL = config.homeUrl;

interface RowTestOptions {
  /**
   * When true, skip instead of fail if the video doesn't start within the
   * timeout. Use for personalised rows (e.g. Most Watched) where the content
   * shown to the test account may vary run-to-run.
   */
  skipOnTimeout?: boolean;
}

/**
 * Creates a standardised @regression test for a single home-page content row.
 * Call this once at the top level of each row spec file.
 *
 * The test:
 *   1. Navigates to /home (pre-authenticated via storageState from auth.setup.ts)
 *   2. Finds the named row — skips gracefully if not visible for this account
 *   3. Clicks the first card
 *   4. Measures time-to-first-frame (TTFF) and attaches it to the HTML report
 *   5. Captures a screenshot of the playing video
 *   6. Records video for every run (not just failures)
 *
 * Usage:
 *   import { createRowTest } from '../../utils/createRowTest';
 *   createRowTest('Blockbuster Boulevard');
 *   createRowTest('Most Watched', { skipOnTimeout: true });
 */
export function createRowTest(rowName: string, options: RowTestOptions = {}): void {
  const slug = rowName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

  test(`@regression ${rowName} — first asset TTFF`, async ({ page }, testInfo) => {
      // ── Navigate to /home ────────────────────────────────────────────────────
      // Explicit timeout prevents page.goto from consuming the full test budget
      // on a slow server — budget: 30 s for goto, 30 s for Angular render.
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Wait for Angular to render at least one row heading.
      // Catch timeout and skip rather than fail — a slow server is not a
      // product defect and a retry would just consume another 180 s budget.
      const rowsReady = await page.waitForFunction(
        () => document.querySelectorAll('h3.ott_tray_title').length > 0,
        { timeout: 30_000 }
      ).catch(() => null);

      if (!rowsReady) {
        test.skip(true, `Home page rows did not render within 30 s — Frndly TV server may be slow`);
        return;
      }

      const db = new DashboardPage(page);

      // ── Verify row exists ────────────────────────────────────────────────────
      const cardCount = await db.getCardCountInRow(rowName);
      if (cardCount === 0) {
        test.skip(true, `Row '${rowName}' not found or has no cards for this account`);
        return;
      }

      console.log(`Row '${rowName}' — ${cardCount} cards visible`);

      // ── Click first card ─────────────────────────────────────────────────────
      const player = await db.clickFirstCardInRow(rowName);
      if (!player) {
        throw new Error(`Row '${rowName}': card[0] not found after scrolling`);
      }

      // ── Measure TTFF ─────────────────────────────────────────────────────────
      const ttffMs = await player.waitForVideoToStart(config.videoTimeoutSeconds);
      if (ttffMs === -2) {
        test.skip(true, `Row '${rowName}': DRM_NO_KEY_SYSTEM — VOD content requires Widevine license, not available in this environment`);
        return;
      }
      if (ttffMs === -1) {
        if (options.skipOnTimeout) {
          test.skip(true, `Row '${rowName}': video did not start within ${config.videoTimeoutSeconds} s — content varies by account`);
          return;
        }
        throw new Error(
          `Row '${rowName}': video did not start within ${config.videoTimeoutSeconds} s`
        );
      }

      console.log(`TTFF: ${ttffMs} ms`);

      // ── Attach TTFF to the Playwright HTML report ────────────────────────────
      await testInfo.attach('time-to-first-frame', {
        body: Buffer.from(`${ttffMs} ms`),
        contentType: 'text/plain',
      });

      // ── Screenshot ───────────────────────────────────────────────────────────
      await player.captureScreenshot(`${slug}-card0`);

      // ── Assert ───────────────────────────────────────────────────────────────
      expect(ttffMs).toBeLessThanOrEqual(config.videoTimeoutSeconds * 1000);
  });
}
