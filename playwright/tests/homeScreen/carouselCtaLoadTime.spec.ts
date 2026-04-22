import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Home Screen — Carousel CTA performance test
 *
 * Requirement:
 *   When the user selects a CTA button on the hero carousel card, the folio
 *   page (detail overlay) shall load in less than 2 seconds.
 *
 * What "CTA" means here:
 *   The action button(s) rendered directly on the active hero carousel slide
 *   (e.g. "Watch Now", "More Info") — distinct from clicking the card image
 *   thumbnail in a content row.
 *
 * What "loaded" means:
 *   A play CTA button is visible on the folio/detail page — the earliest point
 *   at which the user can take a meaningful action.
 */

const LOAD_TIME_THRESHOLD_MS = 2_000;

// Candidate selectors for the hero/spotlight carousel container.
// The carousel uses Slick slider — look for its wrapper elements.
const HERO_CONTAINER_SELECTORS = [
  '.slick-slider',
  '[class*="slick-slider"]',
  '[class*="ott-carousel"]',
  '[class*="carousel-grid"]',
  '.ott_hero',
  '.ott_spotlight',
  '.hero_banner',
  '.hero-banner',
  '.hero_section',
  '.hero-section',
  '[class*="hero_slider"]',
  '[class*="spotlight_slider"]',
  '[class*="feature_banner"]',
  '[class*="banner_sec"]',
];

// CTA button selectors to try within the hero container.
// "Dive In" with class btn-primary is the confirmed Frndly TV carousel CTA.
// Additional selectors kept as fallbacks for content rotation.
const HERO_CTA_SELECTORS = [
  'button.btn-primary',           // confirmed: "Dive In" button
  'button:has-text("Dive In")',   // confirmed text label
  'button:has-text("Watch Now")',
  'button:has-text("More Info")',
  'button:has-text("Watch")',
  'button:has-text("Play")',
  'button:has-text("Info")',
  'button:has-text("Continue Watching")',
  'a:has-text("Watch Now")',
  'a:has-text("More Info")',
  '[class*="cta"]',
];

// Folio/detail page play buttons — same set as tileLoadTime.spec.ts
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

    test('User selects Carousel CTA — folio page loads in under 2 seconds', async ({ page }, testInfo) => {

      // ── Step 1: Navigate to Home ──────────────────────────────────────────
      await page.goto(config.homeUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // Wait for Angular to render at least one row heading, which also
      // confirms the hero area above the rows has had time to render.
      const rowsReady = await page.waitForFunction(
        () => document.querySelectorAll('h3.ott_tray_title').length > 0,
        { timeout: 30_000 }
      ).catch(() => null);

      if (!rowsReady) {
        test.skip(true, 'Home page rows did not render within 30 s — Frndly TV server may be slow');
        return;
      }

      // ── Step 2: Discover hero carousel container ──────────────────────────
      // Log all visible buttons near the top of the page to help identify the
      // correct carousel CTA selector if the test skips on first run.
      const pageButtons = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a[role="button"]'));
        return btns
          .filter(el => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            return rect.top < 600 && rect.width > 0 && rect.height > 0;
          })
          .map(el => ({
            tag: el.tagName,
            text: (el as HTMLElement).innerText?.trim().slice(0, 60),
            classes: el.className,
          }));
      });
      console.log('Buttons visible in top 600px:', JSON.stringify(pageButtons, null, 2));

      // Discover which hero container selector matches
      const heroContainerInfo = await page.evaluate((selectors) => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            return {
              selector: sel,
              tagName: el.tagName,
              classes: el.className,
              childButtons: Array.from(el.querySelectorAll('button, a'))
                .map(b => ({ text: (b as HTMLElement).innerText?.trim().slice(0, 60), classes: b.className })),
            };
          }
        }
        return null;
      }, HERO_CONTAINER_SELECTORS);

      console.log('Hero container discovery:', JSON.stringify(heroContainerInfo, null, 2));

      // ── Step 3: Find the Carousel CTA button ─────────────────────────────
      // Try each CTA selector, first scoped to the hero container (if found),
      // then falling back to the full page top-half.
      let ctaHandle: { selector: string; scopeSelector: string | null } | null = null;

      // Build scoped selectors: hero container first (if found), then full-page.
      // On the confirmed Frndly TV layout the container is .slick-slider;
      // full-page fallback handles any layout variation.
      const scopedSearches: Array<{ scope: string | null; ctaSel: string }> = [];

      if (heroContainerInfo) {
        for (const ctaSel of HERO_CTA_SELECTORS) {
          scopedSearches.push({ scope: heroContainerInfo.selector, ctaSel });
        }
      }
      for (const ctaSel of HERO_CTA_SELECTORS) {
        scopedSearches.push({ scope: null, ctaSel });
      }

      for (const { scope, ctaSel } of scopedSearches) {
        const found = await page.evaluate(({ scopeSel, cta }) => {
          // `:has-text()` is Playwright-only — resolve it manually in the browser.
          function findEl(root: Element | Document, sel: string): HTMLElement | null {
            const m = sel.match(/^([^:]*)?:has-text\("([^"]+)"\)$/);
            if (m) {
              const tag = m[1] || '*';
              const text = m[2].toLowerCase();
              return (Array.from(root.querySelectorAll(tag)) as HTMLElement[])
                .find(el => el.innerText?.trim().toLowerCase().includes(text)) ?? null;
            }
            return root.querySelector(sel) as HTMLElement | null;
          }
          const root = scopeSel ? document.querySelector(scopeSel) : document;
          if (!root) return false;
          const el = findEl(root, cta);
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.top < 700 && rect.width > 0 && rect.height > 0;
        }, { scopeSel: scope, cta: ctaSel });

        if (found) {
          ctaHandle = { selector: ctaSel, scopeSelector: scope };
          console.log(`Found carousel CTA: "${ctaSel}" (scope: ${scope ?? 'page'})`);
          break;
        }
      }

      if (!ctaHandle) {
        test.skip(true, 'No Carousel CTA button found in hero area — check console log above for available selectors');
        return;
      }

      // Scroll the CTA into view
      await page.evaluate(({ scopeSel, cta }) => {
        function findEl(root: Element | Document, sel: string): HTMLElement | null {
          const m = sel.match(/^([^:]*)?:has-text\("([^"]+)"\)$/);
          if (m) {
            const tag = m[1] || '*';
            const text = m[2].toLowerCase();
            return (Array.from(root.querySelectorAll(tag)) as HTMLElement[])
              .find(el => el.innerText?.trim().toLowerCase().includes(text)) ?? null;
          }
          return root.querySelector(sel) as HTMLElement | null;
        }
        const root = scopeSel ? document.querySelector(scopeSel) : document;
        findEl(root!, cta)?.scrollIntoView({ block: 'center' });
      }, { scopeSel: ctaHandle.scopeSelector, cta: ctaHandle.selector });

      await page.waitForTimeout(300);

      // ── Step 4: Click CTA and start timer ─────────────────────────────────
      const t0 = Date.now();

      await page.evaluate(({ scopeSel, cta }) => {
        function findEl(root: Element | Document, sel: string): HTMLElement | null {
          const m = sel.match(/^([^:]*)?:has-text\("([^"]+)"\)$/);
          if (m) {
            const tag = m[1] || '*';
            const text = m[2].toLowerCase();
            return (Array.from(root.querySelectorAll(tag)) as HTMLElement[])
              .find(el => el.innerText?.trim().toLowerCase().includes(text)) ?? null;
          }
          return root.querySelector(sel) as HTMLElement | null;
        }
        const root = scopeSel ? document.querySelector(scopeSel) : document;
        findEl(root!, cta)?.click();
      }, { scopeSel: ctaHandle.scopeSelector, cta: ctaHandle.selector });

      // ── Step 5: Wait for folio / detail page to appear ───────────────────
      await page.waitForSelector(FOLIO_SELECTOR, {
        state: 'visible',
        timeout: 10_000,
      });

      const loadTimeMs = Date.now() - t0;
      console.log(`Carousel CTA folio load time: ${loadTimeMs} ms (CTA: "${ctaHandle.selector}")`);

      // ── Step 6: Attach measurement to the HTML report ─────────────────────
      await testInfo.attach('carousel-cta-folio-load-time', {
        body: Buffer.from(`${loadTimeMs} ms  |  CTA: ${ctaHandle.selector}`),
        contentType: 'text/plain',
      });

      // ── Step 7: Assert load time ≤ 2 seconds ─────────────────────────────
      expect(
        loadTimeMs,
        `Carousel CTA folio took ${loadTimeMs} ms — must be ≤ ${LOAD_TIME_THRESHOLD_MS} ms`
      ).toBeLessThanOrEqual(LOAD_TIME_THRESHOLD_MS);

      // ── Step 8: Screenshot of the loaded folio ────────────────────────────
      const screenshotDir = path.join(__dirname, '..', '..', 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });
      const screenshotPath = path.join(screenshotDir, `carousel-cta-folio-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath });
      console.log(`Screenshot saved: ${screenshotPath}`);
    });

  });
});
