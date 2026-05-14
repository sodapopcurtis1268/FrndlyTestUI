import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';

/**
 * Header Navigation | Highlight State Validation
 * Area: App UX / Usability
 *
 * Verifies that the currently active nav item is represented by white bold text
 * (the "highlight state") while the user hovers/focuses a different nav item.
 *
 * Steps:
 *   1. Navigate to /home  — HOME is the current page
 *   2. Hover GUIDE        — a page the user is NOT currently on
 *   3. Assert HOME (current page) has white bold text
 *   4. Navigate to /guide — GUIDE becomes the current page
 *   5. Hover MOVIES       — a page the user is NOT currently on
 *   6. Assert GUIDE (current page) has white bold text
 *
 * Video and screenshots are attached to the HTML report.
 */

test.use({ video: 'on' });

test.describe('Header Navigation', () => {
  test.describe('Highlight State Validation', () => {

    test('current page nav item shows white bold highlight while another item is hovered [C420693]', async ({ page }, testInfo) => {

      // ── Step 1: Navigate to /home ───────────────────────────────────────────
      await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => document.querySelectorAll('h3.ott_tray_title').length > 0,
        { timeout: 30_000 }
      );

      // ── Helper: get styles of the active nav item ───────────────────────────
      const getActiveStyles = () => page.evaluate(() => {
        const el = document.querySelector('a.ott-link-active') as HTMLElement | null;
        if (!el) return null;
        const cs = window.getComputedStyle(el);
        return {
          text:       el.innerText?.trim() ?? '',
          color:      cs.color,
          fontWeight: cs.fontWeight,
        };
      });

      // ── Helper: is white (rgb ≥ 200 on all channels) ────────────────────────
      const isWhite = (color: string) => {
        const rgb = color.match(/\d+/g)?.map(Number) ?? [];
        return rgb.length >= 3 && rgb[0] >= 200 && rgb[1] >= 200 && rgb[2] >= 200;
      };

      // ── Helper: is bold (font-weight ≥ 700) ────────────────────────────────
      const isBold = (fontWeight: string) => {
        const fw = parseInt(fontWeight, 10);
        return fw >= 700 || fontWeight === 'bold';
      };

      // ── Step 2: Hover GUIDE (not the current page) ─────────────────────────
      const guideLink = page.locator('.ott-header a[href*="/guide"]').first();
      await guideLink.hover();
      await page.waitForTimeout(500);

      // Screenshot 1: HOME active, GUIDE hovered
      await testInfo.attach('HOME-active-GUIDE-hovered', {
        body:        await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
      });

      // ── Step 3: Assert HOME (current page) has white bold text ──────────────
      const homeStyles = await getActiveStyles();
      console.log('HOME active styles (GUIDE hovered):', JSON.stringify(homeStyles));

      expect(homeStyles, 'No active nav item found on home page').not.toBeNull();
      expect(homeStyles!.text).toMatch(/home/i);

      expect(
        isWhite(homeStyles!.color),
        `HOME text should be white. Got: ${homeStyles!.color}`
      ).toBe(true);

      expect(
        isBold(homeStyles!.fontWeight),
        `HOME text should be bold (font-weight ≥ 700). Got: ${homeStyles!.fontWeight}`
      ).toBe(true);

      // Also capture the hovered (GUIDE) item's styles for the report
      const guideHoveredStyles = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('.ott-header a')) as HTMLElement[];
        const guide = links.find(a => a.innerText?.trim().toUpperCase() === 'GUIDE');
        if (!guide) return null;
        const cs = window.getComputedStyle(guide);
        return {
          text:       guide.innerText?.trim(),
          color:      cs.color,
          fontWeight: cs.fontWeight,
        };
      });
      console.log('GUIDE hovered styles:', JSON.stringify(guideHoveredStyles));

      // ── Step 4: Navigate to /guide ──────────────────────────────────────────
      await guideLink.click();
      await page.waitForURL('**/guide', { timeout: 15_000 });
      await page.waitForTimeout(500);

      // ── Step 5: Hover MOVIES (not the current page) ─────────────────────────
      const moviesLink = page.locator('.ott-header a[href*="/movies"]').first();
      await moviesLink.hover();
      await page.waitForTimeout(500);

      // Screenshot 2: GUIDE active, MOVIES hovered
      await testInfo.attach('GUIDE-active-MOVIES-hovered', {
        body:        await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
      });

      // ── Step 6: Assert GUIDE (current page) has white bold text ─────────────
      const guideActiveStyles = await getActiveStyles();
      console.log('GUIDE active styles (MOVIES hovered):', JSON.stringify(guideActiveStyles));

      expect(guideActiveStyles, 'No active nav item found on guide page').not.toBeNull();
      expect(guideActiveStyles!.text).toMatch(/guide/i);

      expect(
        isWhite(guideActiveStyles!.color),
        `GUIDE text should be white. Got: ${guideActiveStyles!.color}`
      ).toBe(true);

      expect(
        isBold(guideActiveStyles!.fontWeight),
        `GUIDE text should be bold (font-weight ≥ 700). Got: ${guideActiveStyles!.fontWeight}`
      ).toBe(true);

      // ── Attach full style summary to report ─────────────────────────────────
      await testInfo.attach('nav-highlight-styles', {
        body: Buffer.from(JSON.stringify({
          homeActive:     homeStyles,
          guideHovered:   guideHoveredStyles,
          guideActive:    guideActiveStyles,
        }, null, 2)),
        contentType: 'application/json',
      });
    });

  });
});
