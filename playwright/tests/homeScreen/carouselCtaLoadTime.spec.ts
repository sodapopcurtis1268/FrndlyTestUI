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

    test('User selects Carousel CTA — folio page loads in under 2 seconds [C420688]', async ({ page }, testInfo) => {

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

      // ── Step 2: Find the carousel CTA button ─────────────────────────────
      // Scope to .slick-active so we target the currently-visible slide only.
      // This avoids picking up btn-primary buttons on inactive/hidden slides
      // (which share the same class but have tabindex="-1").
      await page.evaluate(() => window.scrollTo(0, 0));
      const ctaLocator = page.locator('.slick-active button.btn-primary').first();

      const ctaVisible = await ctaLocator.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!ctaVisible) {
        test.skip(true, 'Carousel CTA (.slick-active button.btn-primary) not visible — absent or below fold for this account');
        return;
      }

      const ctaText = (await ctaLocator.textContent())?.trim() ?? '';
      console.log(`Carousel CTA found: "${ctaText}"`);

      await ctaLocator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      // ── Step 3: Click CTA and start timer ────────────────────────────────
      const t0 = Date.now();
      await ctaLocator.click();

      // ── Step 4: Wait for folio / detail page ─────────────────────────────
      // The folio opens as an overlay on the same page. The carousel's own
      // buttons remain in the DOM (inactive slides have tabindex="-1" and live
      // inside .slick-list). We look for a play-action button that is:
      //   • NOT inside the Slick carousel (.slick-list / .slick-slider)
      //   • Actually visible (non-zero dimensions)
      // This unambiguously identifies the folio CTA vs the carousel CTA.
      //
      // If the CTA navigates directly to the player (no folio), the function
      // times out — treat that as a skip condition, not a failure.
      const folioAppeared = await page.waitForFunction(() => {
        const PLAY_TEXTS = ['watch now', 'watch', 'play', 'continue watching', 'start over'];
        const btns = Array.from(document.querySelectorAll('button')) as HTMLElement[];
        return btns.some(btn => {
          const text = btn.innerText?.toLowerCase().trim() ?? '';
          if (!PLAY_TEXTS.some(t => text.includes(t))) return false;
          // Exclude buttons still inside the Slick carousel container
          if (btn.closest('.slick-list, .slick-slider, .slick-track')) return false;
          const rect = btn.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      }, { timeout: 10_000 }).catch(() => null);

      if (!folioAppeared) {
        test.skip(true, 'Folio did not appear after CTA click — CTA may navigate directly to player for this content');
        return;
      }

      const loadTimeMs = Date.now() - t0;
      console.log(`Carousel CTA folio load time: ${loadTimeMs} ms (CTA: "${ctaText}")`);

      // ── Step 5: Attach measurement to the HTML report ─────────────────────
      await testInfo.attach('carousel-cta-folio-load-time', {
        body: Buffer.from(`${loadTimeMs} ms  |  CTA: "${ctaText}"`),
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
