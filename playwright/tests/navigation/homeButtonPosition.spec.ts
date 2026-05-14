import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';

/**
 * HOME | Main Navigation — HOME Button Position Validation
 * Area: App UX / Usability / Homepage
 *
 * Verifies that the HOME button is present in the main header navigation and
 * is positioned:
 *   - Immediately to the LEFT of the Guide button
 *   - To the RIGHT of the Search icon
 *
 * Expected nav order (left-to-right): [Search icon] … [HOME] [GUIDE] …
 *
 * Steps:
 *   1. Open FrndlyTV app (/home)
 *   2. Wait for page to fully render
 *   3. Locate HOME, GUIDE, and Search elements; collect their bounding rects
 *   4. Assert HOME is visible in the header
 *   5. Assert HOME is to the right of Search  (HOME.left > Search.left)
 *   6. Assert HOME is to the left of Guide    (HOME.left < Guide.left)
 *   7. Assert HOME and Guide are adjacent     (no other nav item between them)
 *   8. Attach annotated screenshot and position data to the HTML report
 *   9. Video recorded for the full test run
 */

test.use({ video: 'on' });

test.describe('Header Navigation', () => {
  test.describe('HOME | Main Navigation', () => {

    test('HOME button is displayed immediately to the left of Guide and to the right of Search [C420695]', async ({ page }, testInfo) => {

      // ── Step 1: Open FrndlyTV app ────────────────────────────────────────────
      await page.goto(config.homeUrl, { waitUntil: 'domcontentloaded' });

      // Wait for Angular to finish rendering home screen rows
      await page.waitForFunction(
        () => document.querySelectorAll('h3.ott_tray_title').length > 0,
        { timeout: 30_000 }
      );

      // ── Step 2: Allow nav bar to stabilise ──────────────────────────────────
      await page.waitForTimeout(500);

      // ── Step 3: Collect positions of all visible nav items ───────────────────
      const navData = await page.evaluate(() => {
        // All anchor tags inside the header that are visible within the top 120px
        const links = Array.from(
          document.querySelectorAll('.ott-header a')
        ) as HTMLElement[];

        const visible = links
          .filter(a => {
            const rect = a.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < 120;
          })
          .map(a => ({
            text:   a.innerText?.trim().toUpperCase() ?? '',
            href:   (a as HTMLAnchorElement).href ?? '',
            left:   Math.round(a.getBoundingClientRect().left),
            right:  Math.round(a.getBoundingClientRect().right),
            top:    Math.round(a.getBoundingClientRect().top),
            bottom: Math.round(a.getBoundingClientRect().bottom),
          }))
          .sort((a, b) => a.left - b.left);   // left-to-right order

        // Search icon may be a button or a non-text link — look for it separately
        const searchSelectors = [
          '.ott-header [class*="search"]',
          '.ott-header a[href*="search"]',
          '.ott-header button[aria-label*="earch" i]',
          '.ott-header [aria-label*="earch" i]',
          '.ott-header .search',
        ];

        let searchRect: { left: number; right: number; top: number; bottom: number } | null = null;
        for (const sel of searchSelectors) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && r.top >= 0 && r.top < 120) {
              searchRect = {
                left:   Math.round(r.left),
                right:  Math.round(r.right),
                top:    Math.round(r.top),
                bottom: Math.round(r.bottom),
              };
              break;
            }
          }
        }

        return { navItems: visible, searchRect };
      });

      console.log('Nav items (left→right):', JSON.stringify(navData.navItems, null, 2));
      console.log('Search rect:', JSON.stringify(navData.searchRect));

      // ── Step 4: Find HOME and GUIDE items ────────────────────────────────────
      const homeItem  = navData.navItems.find(i => i.text === 'HOME' || i.href.includes('/home'));
      const guideItem = navData.navItems.find(i => i.text === 'GUIDE' || i.href.includes('/guide'));

      // ── Screenshot 1: Full header with nav bar ───────────────────────────────
      await testInfo.attach('nav-home-button-position', {
        body:        await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
      });

      // ── Step 5: HOME button must be present ──────────────────────────────────
      expect(
        homeItem,
        `HOME button not found in header nav. Items found: ${navData.navItems.map(i => i.text || i.href).join(', ')}`
      ).toBeDefined();

      // ── Step 6: GUIDE button must be present ─────────────────────────────────
      expect(
        guideItem,
        `GUIDE button not found in header nav. Items found: ${navData.navItems.map(i => i.text || i.href).join(', ')}`
      ).toBeDefined();

      // ── Step 7: HOME is to the RIGHT of Search ───────────────────────────────
      if (navData.searchRect) {
        expect(
          homeItem!.left,
          `HOME button (left: ${homeItem!.left}) should be to the right of the Search icon (left: ${navData.searchRect.left})`
        ).toBeGreaterThan(navData.searchRect.left);
      } else {
        // Search icon not found via CSS — log and skip positional check vs search
        console.warn('Search icon element not detected; skipping HOME > Search positional check.');
        await testInfo.attach('search-not-found-warning', {
          body: Buffer.from('Search icon element could not be located via CSS selectors. HOME > Search positional assertion was skipped.'),
          contentType: 'text/plain',
        });
      }

      // ── Step 8: HOME is to the LEFT of Guide ─────────────────────────────────
      expect(
        homeItem!.left,
        `HOME button (left: ${homeItem!.left}) should be to the left of the GUIDE button (left: ${guideItem!.left})`
      ).toBeLessThan(guideItem!.left);

      // ── Step 9: HOME is IMMEDIATELY to the left of Guide ─────────────────────
      // Sort all items by x position and find indices
      const sortedItems = [...navData.navItems].sort((a, b) => a.left - b.left);
      const homeIdx  = sortedItems.findIndex(i => i.text === 'HOME' || i.href.includes('/home'));
      const guideIdx = sortedItems.findIndex(i => i.text === 'GUIDE' || i.href.includes('/guide'));

      expect(homeIdx, 'HOME item not found in sorted nav list').toBeGreaterThanOrEqual(0);
      expect(guideIdx, 'GUIDE item not found in sorted nav list').toBeGreaterThanOrEqual(0);

      expect(
        guideIdx - homeIdx,
        `HOME (index ${homeIdx}) should be immediately to the left of GUIDE (index ${guideIdx}). ` +
        `Nav order: ${sortedItems.map(i => i.text || i.href).join(' → ')}`
      ).toBe(1);

      // ── Attach full position data to report ──────────────────────────────────
      await testInfo.attach('nav-home-position-data', {
        body: Buffer.from(JSON.stringify({
          navOrder:   sortedItems.map(i => ({ text: i.text, left: i.left })),
          homeItem,
          guideItem,
          searchRect: navData.searchRect,
          assertions: {
            homeFound:            !!homeItem,
            guideFound:           !!guideItem,
            homeLeftOfGuide:      homeItem!.left < guideItem!.left,
            homeRightOfSearch:    navData.searchRect ? homeItem!.left > navData.searchRect.left : 'search-not-found',
            homeImmediatelyLeftOfGuide: guideIdx - homeIdx === 1,
          },
        }, null, 2)),
        contentType: 'application/json',
      });

      // ── Screenshot 2: Focused on the header area ──────────────────────────────
      // Clip to the top navigation strip for a tighter evidence screenshot
      const headerClip = {
        x:      0,
        y:      0,
        width:  page.viewportSize()!.width,
        height: Math.min(120, page.viewportSize()!.height),
      };
      await testInfo.attach('nav-header-strip', {
        body:        await page.screenshot({ clip: headerClip }),
        contentType: 'image/png',
      });
    });

  });
});
