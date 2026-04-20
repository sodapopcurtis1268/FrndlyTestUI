import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Home Screen — Performance test group
 *
 * Requirement:
 *   The home screen load time shall not exceed 2 seconds.
 *   Content not immediately visible may lazy-load in the background.
 *   Once loaded, the user shall be able to navigate at will.
 *
 * What "loaded" means here:
 *   The navigation bar (HOME link) is visible and interactive.
 *   This is the earliest point at which a user can actually use the app.
 *   Content rows below the fold continue to load in the background.
 */

const LOAD_TIME_THRESHOLD_MS = 2_000;

test.describe('Home Screen', () => {
  test.describe('Performance', () => {

    test('Load time does not exceed 2 seconds', async ({ page }, testInfo) => {

      // ── Step 1: Open the Frndly App ───────────────────────────────────────
      // Timer starts before page.goto so the full network round-trip is captured
      const t0 = Date.now();
      await page.goto(config.homeUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // ── Step 2: Wait for navigation bar to be interactive ─────────────────
      // The HOME nav link being visible means Angular has bootstrapped and the
      // app shell is ready for interaction. Content rows may still be loading.
      const homeLink = page.getByRole('link', { name: 'HOME' });
      await homeLink.waitFor({ state: 'visible', timeout: 10_000 });
      const loadTimeMs = Date.now() - t0;

      console.log(`Home screen load time: ${loadTimeMs} ms`);

      // Attach measurement to the HTML report's Attachments tab
      await testInfo.attach('home-screen-load-time', {
        body: Buffer.from(`${loadTimeMs} ms`),
        contentType: 'text/plain',
      });

      // ── Step 3: Assert load time ≤ 2 seconds ──────────────────────────────
      expect(
        loadTimeMs,
        `Home screen took ${loadTimeMs} ms — must be ≤ ${LOAD_TIME_THRESHOLD_MS} ms`
      ).toBeLessThanOrEqual(LOAD_TIME_THRESHOLD_MS);

      // ── Step 4: Verify user can navigate at will ───────────────────────────
      // Click GUIDE and verify Angular router navigates
      await page.getByRole('link', { name: 'GUIDE' }).click();
      await page.waitForURL('**/guide', { timeout: 10_000 });

      // Navigate back to Home — confirms two-way navigation works
      await page.getByRole('link', { name: 'HOME' }).click();
      await page.waitForURL('**/home', { timeout: 10_000 });

      // ── Step 5: Screenshot of the loaded home screen ───────────────────────
      const screenshotDir = path.join(__dirname, '..', '..', 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });
      const screenshotPath = path.join(screenshotDir, `home-screen-load-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath });
      console.log(`Screenshot saved: ${screenshotPath}`);

      // ── Step 6: Close the application ─────────────────────────────────────
      // Browser context is closed automatically when the test ends.
    });

  });
});
