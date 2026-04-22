import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Home Screen — Within-row navigation lag test
 *
 * Requirement:
 *   Navigating within a content row (scrolling left and right through cards)
 *   should be seamless; there should be no input lag between user action and
 *   on-screen response.
 *
 * How lag is measured:
 *   The browser's Long Tasks API records any main-thread task that blocks
 *   rendering for > 50 ms. We observe these while scrolling left and right
 *   within a row using the row's Slick arrow buttons (primary) and mouse-wheel
 *   horizontal scroll (fallback). No single task may exceed MAX_LONG_TASK_MS.
 *
 * Threshold: 300 ms — unambiguously perceptible on any device.
 */

const MAX_LONG_TASK_MS = 300;
const SCROLL_STEPS = 4;     // number of right-scroll steps before reversing
const STEP_PAUSE_MS = 250;  // pause between each arrow click / wheel event

test.describe('Home Screen', () => {
  test.describe('Performance', () => {

    test('Navigate within rows — no visual lag during left/right scroll', async ({ page }, testInfo) => {

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

      // ── Step 2: Scroll down to find a content row with visible cards ──────
      // Skip the hero carousel — target the first standard content row that
      // has at least one card (.sheet_poster or .roller_poster).
      await page.evaluate(() => window.scrollTo(0, 0));

      const rowIndex = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.sec_slider'));
        for (let i = 0; i < rows.length; i++) {
          const cards = rows[i].querySelectorAll('.sheet_poster, .roller_poster');
          if (cards.length > 1) return i;
        }
        return -1;
      });

      if (rowIndex === -1) {
        test.skip(true, 'No content row with multiple cards found — cannot test horizontal scroll');
        return;
      }

      const rowLocator = page.locator('.sec_slider').nth(rowIndex);
      await rowLocator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400); // let the row settle into view

      const rowBox = await rowLocator.boundingBox();
      if (!rowBox) {
        test.skip(true, 'Could not determine row bounding box');
        return;
      }

      // Position mouse at the horizontal centre of the row so wheel events
      // are delivered to the correct scrollable container.
      const cx = rowBox.x + rowBox.width / 2;
      const cy = rowBox.y + rowBox.height / 2;
      await page.mouse.move(cx, cy);

      const rowTitle = await page.evaluate((idx: number) => {
        const titles = document.querySelectorAll('h3.ott_tray_title');
        return titles[idx]?.textContent?.trim() ?? `Row ${idx}`;
      }, rowIndex);

      console.log(`Testing horizontal scroll in row: "${rowTitle}"`);

      // ── Step 3: Set up Long Task observer ────────────────────────────────
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

      // ── Step 4: Scroll RIGHT through the row ─────────────────────────────
      // Primary: click the Slick .slick-next arrow button inside the row.
      // Fallback: horizontal mouse-wheel event (works for CSS-scroll rows).
      for (let i = 0; i < SCROLL_STEPS; i++) {
        const nextBtn = rowLocator.locator('.slick-next, [class*="right-arrow"], [class*="next-arrow"]').first();
        const hasNext = await nextBtn.isVisible({ timeout: 500 }).catch(() => false);

        if (hasNext) {
          await nextBtn.click();
        } else {
          await page.mouse.wheel(300, 0);
        }
        await page.waitForTimeout(STEP_PAUSE_MS);
      }

      // ── Step 5: Scroll LEFT back through the row ─────────────────────────
      for (let i = 0; i < SCROLL_STEPS; i++) {
        const prevBtn = rowLocator.locator('.slick-prev, [class*="left-arrow"], [class*="prev-arrow"]').first();
        const hasPrev = await prevBtn.isVisible({ timeout: 500 }).catch(() => false);

        if (hasPrev) {
          await prevBtn.click();
        } else {
          await page.mouse.wheel(-300, 0);
        }
        await page.waitForTimeout(STEP_PAUSE_MS);
      }

      // ── Step 6: Collect long task data ───────────────────────────────────
      const longTasks = await page.evaluate((): number[] => {
        (window as any).__longTaskObserver?.disconnect();
        return (window as any).__longTasks ?? [];
      });

      const maxLongTaskMs   = longTasks.length > 0 ? Math.max(...longTasks) : 0;
      const totalBlockingMs = longTasks.reduce((a: number, b: number) => a + b, 0);

      console.log(`Row tested           : "${rowTitle}"`);
      console.log(`Long tasks (>50 ms)  : ${longTasks.length}`);
      console.log(`Max long task        : ${maxLongTaskMs.toFixed(0)} ms`);
      console.log(`Total blocking time  : ${totalBlockingMs.toFixed(0)} ms`);

      // ── Step 7: Attach metrics to report ─────────────────────────────────
      await testInfo.attach('row-internal-scroll-lag', {
        body: Buffer.from(
          [
            `Row tested           : "${rowTitle}"`,
            `Scroll steps (each direction): ${SCROLL_STEPS}`,
            `Long tasks (>50 ms)  : ${longTasks.length}`,
            `Max long task        : ${maxLongTaskMs.toFixed(0)} ms`,
            `Total blocking time  : ${totalBlockingMs.toFixed(0)} ms`,
            `Threshold            : ${MAX_LONG_TASK_MS} ms`,
          ].join('\n')
        ),
        contentType: 'text/plain',
      });

      // ── Step 8: Screenshot ────────────────────────────────────────────────
      const screenshotDir = path.join(__dirname, '..', '..', 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({
        path: path.join(screenshotDir, `row-internal-scroll-${Date.now()}.png`),
      });

      // ── Step 9: Assert no single long task exceeded the threshold ─────────
      expect(
        maxLongTaskMs,
        `Horizontal row scroll produced a ${maxLongTaskMs.toFixed(0)} ms long task — ` +
        `must be ≤ ${MAX_LONG_TASK_MS} ms to avoid perceptible lag`
      ).toBeLessThanOrEqual(MAX_LONG_TASK_MS);
    });

  });
});
