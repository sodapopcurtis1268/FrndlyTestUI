import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Home Screen — Performance test
 *
 * Requirement:
 *   When the user selects a tile from any row, the folio page (detail overlay)
 *   shall load in less than 2 seconds.
 *
 * What "loaded" means here:
 *   A play CTA button is visible on the detail page — the earliest point at
 *   which the user can take a meaningful action. This covers both inline
 *   overlays and full detail-page navigations.
 *
 * Row selection strategy:
 *   Try a ranked list of series/movie rows (not live TV) and use the first
 *   one that has cards already in the DOM — avoids the scroll cost of finding
 *   a row that is off-screen.
 */

const LOAD_TIME_THRESHOLD_MS = 2_000;

// Series / movie rows to try — in preference order.
// Live TV rows (e.g. "Live Now") are excluded: clicking a live card skips
// the folio and goes directly to the player, which is a different flow.
const CANDIDATE_ROWS = [
  'Recommended for You',
  'Trending Now',
  'Frndly TV Fan Favorites',
  'Just Added Movies',
  'Timeless Classics',
  'Watch Again',
  'New Episodes',
];

// All known play CTAs on Frndly TV detail / folio pages.
// The first one to become visible marks "folio loaded".
const FOLIO_SELECTOR = [
  'button:has-text("Continue Watching")',
  'button:has-text("Watch Now")',
  'button:has-text("Watch")',
  'button:has-text("Start Over")',
  'button:has-text("Play")',
  'button[class*="watch"]',
  'button[class*="play"]',
].join(', ');

test.describe('Home Screen', () => {
  test.describe('Performance', () => {

    test('User selects tile — folio page loads in under 2 seconds [C420689]', async ({ page }, testInfo) => {

      // ── Step 1: Navigate to Home ──────────────────────────────────────────
      await page.goto(config.homeUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await page.waitForFunction(
        () => document.querySelectorAll('h3.ott_tray_title').length > 0,
        { timeout: 30_000 }
      );

      // ── Step 2: Find a candidate row with visible cards ───────────────────
      // Prefer rows already in the DOM (no scroll needed) for a clean,
      // repeatable measurement. Fall back to the next candidate if a row has
      // no cards yet.
      let chosenRow = '';
      for (const rowName of CANDIDATE_ROWS) {
        const count: number = await page.evaluate((name) => {
          const heading = Array.from(document.querySelectorAll('h3.ott_tray_title'))
            .find(h => h.textContent?.trim() === name);
          if (!heading) return 0;
          const slider = heading.closest('.sec_slider');
          return slider?.querySelectorAll('.sheet_poster, .roller_poster').length ?? 0;
        }, rowName);

        if (count > 0) {
          chosenRow = rowName;
          break;
        }
      }

      if (!chosenRow) {
        test.skip(true, 'No candidate rows with visible cards found for this account');
        return;
      }

      console.log(`Selected row: '${chosenRow}'`);

      // Scroll the first card of the chosen row into view
      await page.evaluate((name) => {
        const heading = Array.from(document.querySelectorAll('h3.ott_tray_title'))
          .find(h => h.textContent?.trim() === name);
        const slider = heading?.closest('.sec_slider');
        const card = slider?.querySelector('.sheet_poster, .roller_poster') as HTMLElement | null;
        card?.scrollIntoView({ block: 'center' });
      }, chosenRow);
      await page.waitForTimeout(300);

      // ── Step 3: Click tile and start timer ────────────────────────────────
      // Use HTMLElement.click() (not dispatchEvent) so Angular's [routerLink]
      // handler fires. Timer starts immediately before the click — measures
      // the full round trip from interaction to folio visible.
      const t0 = Date.now();

      await page.evaluate((name) => {
        const heading = Array.from(document.querySelectorAll('h3.ott_tray_title'))
          .find(h => h.textContent?.trim() === name);
        const slider = heading?.closest('.sec_slider');
        const card = slider?.querySelector('.sheet_poster, .roller_poster') as HTMLElement | null;
        card?.click();
      }, chosenRow);

      // ── Step 4: Wait for folio / detail page to appear ───────────────────
      // The folio is considered loaded when any play CTA button is visible.
      // 10 s outer timeout ensures a clean failure message if the folio never
      // appears (rather than hitting the global test timeout).
      await page.waitForSelector(FOLIO_SELECTOR, {
        state: 'visible',
        timeout: 10_000,
      });

      const loadTimeMs = Date.now() - t0;
      console.log(`Tile folio load time: ${loadTimeMs} ms (row: '${chosenRow}')`);

      // ── Step 5: Attach measurement to the HTML report ─────────────────────
      await testInfo.attach('tile-folio-load-time', {
        body: Buffer.from(`${loadTimeMs} ms  |  row: ${chosenRow}`),
        contentType: 'text/plain',
      });

      // ── Step 6: Assert load time ≤ 2 seconds ─────────────────────────────
      expect(
        loadTimeMs,
        `Folio page took ${loadTimeMs} ms — must be ≤ ${LOAD_TIME_THRESHOLD_MS} ms`
      ).toBeLessThanOrEqual(LOAD_TIME_THRESHOLD_MS);

      // ── Step 7: Screenshot of the loaded folio ────────────────────────────
      const screenshotDir = path.join(__dirname, '..', '..', 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });
      const screenshotPath = path.join(screenshotDir, `tile-folio-load-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath });
      console.log(`Screenshot saved: ${screenshotPath}`);

      // ── Step 8: Close ─────────────────────────────────────────────────────
      // Browser context is closed automatically when the test ends.
    });

  });
});
