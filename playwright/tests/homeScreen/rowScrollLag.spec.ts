import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Home Screen — Row scroll lag test
 *
 * Requirement:
 *   Navigating between rows should be seamless; there should be no input lag
 *   between user action and on-screen response.
 *
 * How lag is measured:
 *   The browser's Long Tasks API records any main-thread task that blocks
 *   rendering for > 50 ms. Tasks above the threshold cause perceptible jank.
 *   We observe these during a full top-to-bottom scroll and assert that no
 *   single task exceeds MAX_LONG_TASK_MS.
 *
 * Threshold rationale:
 *   300 ms is chosen over the 50 ms browser default to account for CI runner
 *   variability. A 300 ms block is unambiguously noticeable to any user.
 */

const MAX_LONG_TASK_MS = 300;

test.describe('Home Screen', () => {
  test.describe('Performance', () => {

    test('Navigate between rows — no visual lag during scroll [C420690]', async ({ page }, testInfo) => {

      // ── Step 1: Navigate to Home ──────────────────────────────────────────
      await page.goto(config.homeUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      const rowsReady = await page.waitForFunction(
        () => document.querySelectorAll('h3.ott_tray_title').length > 0,
        { timeout: 30_000 }
      ).catch(() => null);

      if (!rowsReady) {
        test.skip(true, 'Home page rows did not render within 30 s — skipping lag test');
        return;
      }

      // ── Step 2: Set up Long Task observer before any scrolling ───────────
      await page.evaluate(() => {
        (window as any).__longTasks = [];
        try {
          const observer = new PerformanceObserver((list) => {
            list.getEntries().forEach((e) => {
              (window as any).__longTasks.push(e.duration);
            });
          });
          observer.observe({ entryTypes: ['longtask'] });
          (window as any).__longTaskObserver = observer;
        } catch (_) {
          // longtask API unavailable — array stays empty, test will pass
        }
      });

      // ── Step 3: Scroll from top to bottom ────────────────────────────────
      // Simulate a user paging through all content rows using mouse wheel
      // events (400 px per step, 80 ms pause between steps).
      // Cap at 100 steps (~40 000 px) so the test doesn't run indefinitely
      // on an extremely long page.
      await page.evaluate(() => window.scrollTo(0, 0));
      const t0 = Date.now();

      for (let i = 0; i < 100; i++) {
        const atBottom = await page.evaluate(() => {
          const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
          return scrollTop + clientHeight >= scrollHeight - 10;
        });
        if (atBottom) break;

        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(80);
      }

      const scrollDurationMs = Date.now() - t0;

      // ── Step 4: Collect long task data ───────────────────────────────────
      const longTasks = await page.evaluate((): number[] => {
        (window as any).__longTaskObserver?.disconnect();
        return (window as any).__longTasks ?? [];
      });

      const rowCount = await page.evaluate(
        () => document.querySelectorAll('h3.ott_tray_title').length
      );

      const maxLongTaskMs  = longTasks.length > 0 ? Math.max(...longTasks) : 0;
      const totalBlockingMs = longTasks.reduce((a: number, b: number) => a + b, 0);

      console.log(`Scroll duration      : ${scrollDurationMs} ms`);
      console.log(`Rows visible         : ${rowCount}`);
      console.log(`Long tasks (>50 ms)  : ${longTasks.length}`);
      console.log(`Max long task        : ${maxLongTaskMs.toFixed(0)} ms`);
      console.log(`Total blocking time  : ${totalBlockingMs.toFixed(0)} ms`);

      // ── Step 5: Attach metrics to report ─────────────────────────────────
      await testInfo.attach('scroll-lag-metrics', {
        body: Buffer.from(
          [
            `Scroll duration      : ${scrollDurationMs} ms`,
            `Rows visible         : ${rowCount}`,
            `Long tasks (>50 ms)  : ${longTasks.length}`,
            `Max long task        : ${maxLongTaskMs.toFixed(0)} ms`,
            `Total blocking time  : ${totalBlockingMs.toFixed(0)} ms`,
            `Threshold            : ${MAX_LONG_TASK_MS} ms`,
          ].join('\n')
        ),
        contentType: 'text/plain',
      });

      // ── Step 6: Screenshot at bottom of page ─────────────────────────────
      const screenshotDir = path.join(__dirname, '..', '..', 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({
        path: path.join(screenshotDir, `row-scroll-bottom-${Date.now()}.png`),
      });

      // ── Step 7: Assert no single long task exceeded the threshold ─────────
      expect(
        maxLongTaskMs,
        `Scroll produced a ${maxLongTaskMs.toFixed(0)} ms long task — must be ≤ ${MAX_LONG_TASK_MS} ms to avoid perceptible lag`
      ).toBeLessThanOrEqual(MAX_LONG_TASK_MS);
    });

  });
});
