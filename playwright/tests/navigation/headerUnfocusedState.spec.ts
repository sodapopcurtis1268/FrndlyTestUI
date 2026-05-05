import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';

/**
 * Header Navigation | Unfocused State Validation
 * Area: App UX / Usability
 *
 * Verifies that all nav items that are neither active (current page) nor
 * hovered/focused are displayed with light grey text.
 *
 * Steps:
 *   1. Navigate to /home — HOME is active
 *   2. Move mouse away from nav bar (no hover)
 *   3. Collect text color of every non-active nav item
 *   4. Assert each is light grey (rgba(255,255,255,0.8) or similar low-opacity white)
 *   5. Screenshot and video attached to report
 */

test.use({ video: 'on' });

test.describe('Header Navigation', () => {
  test.describe('Unfocused State Validation', () => {

    test('non-active nav items display light grey text when not focused or hovered [C420694]', async ({ page }, testInfo) => {

      // ── Step 1: Navigate to /home ───────────────────────────────────────────
      await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => document.querySelectorAll('h3.ott_tray_title').length > 0,
        { timeout: 30_000 }
      );

      // ── Step 2: Move mouse away from the nav bar ────────────────────────────
      // Move to the centre of the page content so nothing in the nav is hovered
      await page.mouse.move(
        page.viewportSize()!.width  / 2,
        page.viewportSize()!.height / 2
      );
      await page.waitForTimeout(500);

      // ── Step 3: Collect styles of every nav item ────────────────────────────
      const navItems = await page.evaluate(() => {
        const links = Array.from(
          document.querySelectorAll('.ott-header a')
        ) as HTMLElement[];

        return links
          .filter(a => {
            if (!a.innerText?.trim().length) return false;
            // Only include links that are actually visible on screen
            const rect = a.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < 120;
          })
          .map(a => {
            const cs = window.getComputedStyle(a);
            return {
              text:       a.innerText.trim(),
              isActive:   a.classList.contains('ott-link-active'),
              color:      cs.color,
              fontWeight: cs.fontWeight,
              opacity:    cs.opacity,
            };
          });
      });

      console.log('Nav item styles:', JSON.stringify(navItems, null, 2));

      // ── Screenshot: all items at rest ───────────────────────────────────────
      await testInfo.attach('nav-unfocused-state', {
        body:        await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
      });

      // ── Step 4: Assert non-active items are light grey ──────────────────────
      // Light grey in this context = white with reduced opacity/alpha
      // e.g. rgba(255,255,255,0.8) or rgba(255,255,255,0.6)
      // Rule: R,G,B all ≥ 200 AND alpha < 1.0 (not fully opaque white)
      // Active item (full white, font-weight 700) is excluded.
      const isLightGrey = (color: string) => {
        // Match rgba(r,g,b,a) or rgb(r,g,b)
        const rgba = color.match(/[\d.]+/g)?.map(Number) ?? [];
        if (rgba.length < 3) return false;
        const [r, g, b, a = 1] = rgba;
        // All channels near-white AND either alpha < 1 or slightly dimmed
        return r >= 180 && g >= 180 && b >= 180 && a < 1.0;
      };

      const nonActiveItems = navItems.filter(i => !i.isActive);
      expect(nonActiveItems.length, 'Expected at least one non-active nav item').toBeGreaterThan(0);

      const failures: string[] = [];
      for (const item of nonActiveItems) {
        if (!isLightGrey(item.color)) {
          failures.push(`"${item.text}" — color: ${item.color}`);
        }
      }

      // Attach full breakdown to report
      await testInfo.attach('nav-unfocused-styles', {
        body: Buffer.from(JSON.stringify({
          activeItem:    navItems.find(i => i.isActive),
          nonActiveItems,
          failures,
        }, null, 2)),
        contentType: 'application/json',
      });

      expect(
        failures,
        `The following non-active nav items did not show light grey text:\n${failures.join('\n')}`
      ).toHaveLength(0);
    });

  });
});
