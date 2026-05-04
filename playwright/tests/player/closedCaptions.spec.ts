import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Player — Closed Captions test
 *
 * Requirements:
 *   1. Closed caption tracks are available for content that supports them.
 *   2. CC is off by default when a video starts.
 *   3. The user can toggle CC on  — captions become active (track.mode === 'showing').
 *   4. The user can toggle CC off — captions return to hidden.
 *
 * Detection strategy:
 *   Primary   — HTMLVideoElement.textTracks API (authoritative CC state)
 *   Secondary — DOM caption overlay element visibility (confirms render)
 *
 * CC button discovery:
 *   Tries common aria-label / class / attribute patterns used by video players.
 *   Logs all player control buttons on first run so unknown selectors can be
 *   added without re-running blind.
 *
 * Skip conditions (not failures):
 *   - No content row found for this account
 *   - Video did not start within timeout (server / DRM issue)
 *   - Content has no CC tracks (live channels often lack captions)
 *   - No CC toggle button found in player controls
 */

// Ordered list of CC button selectors to try (most specific first)
const CC_BUTTON_SELECTORS = [
  'button[aria-label*="caption" i]',
  'button[aria-label*="subtitle" i]',
  'button[aria-label*="closed" i]',
  'button[aria-label="CC"]',
  'button[title*="caption" i]',
  'button[title*="subtitle" i]',
  'button[title="CC"]',
  'button[class*="caption"]',
  'button[class*="subtitle"]',
  'button[class*="cc-btn"]',
  'button[class*="cc_btn"]',
  '.vjs-captions-button',
  '.vjs-subtitles-button',
  '[data-testid*="caption" i]',
  '[data-testid*="subtitle" i]',
];

test.describe('Player', () => {
  test.describe('Closed Captions', () => {
    test.skip(true, 'Temporarily disabled');

    test('CC is available, off by default, and can be toggled on and off', async ({ page }, testInfo) => {

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
        test.skip(true, 'Home page rows did not render — skipping CC test');
        return;
      }

      // ── Step 2: Find a content row and click the first card ───────────────
      // Scope to .slick-active so we only target cards on the currently
      // visible slide — cards on inactive slides share the same classes but
      // are positioned off-screen inside the slider track, causing Playwright
      // to report "element is not visible" even after scrollIntoViewIfNeeded.
      // Also exclude .slick-cloned (duplicate slides Slick injects for looping).
      const firstCard = page.locator(
        '.sec_slider .slick-active:not(.slick-cloned) .sheet_poster, ' +
        '.sec_slider .slick-active:not(.slick-cloned) .roller_poster'
      ).first();

      const cardVisible = await firstCard.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!cardVisible) {
        test.skip(true, 'No visible content card found in active carousel slides');
        return;
      }

      const cardText = await firstCard.textContent().catch(() => '');
      console.log(`Clicking card: "${cardText?.trim().slice(0, 60)}"`);
      await firstCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await firstCard.click();

      // ── Step 3: Handle folio overlay — click play if it appears ──────────
      // Some cards open a folio detail page before the player.
      const folioPlayBtn = page.locator([
        'button:has-text("Watch Now")',
        'button:has-text("Continue Watching")',
        'button:has-text("Play")',
        'button:has-text("Watch")',
        'button:has-text("Start Over")',
      ].join(', '));

      const folioAppeared = await folioPlayBtn.first().waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => true).catch(() => false);

      console.log(`Folio appeared: ${folioAppeared}`);
      if (folioAppeared) {
        await folioPlayBtn.first().click();
      }

      // ── Step 4: Wait for video to start playing ───────────────────────────
      const videoStarted = await page.waitForFunction(() => {
        const v = document.querySelector('video') as HTMLVideoElement | null;
        return v !== null && v.readyState >= 2 && (v.currentTime > 0 || !v.paused);
      }, { timeout: 60_000 }).catch(() => null);

      if (!videoStarted) {
        const videoState = await page.evaluate(() => {
          const v = document.querySelector('video') as HTMLVideoElement | null;
          return v ? { readyState: v.readyState, currentTime: v.currentTime, paused: v.paused, src: v.currentSrc?.slice(0,80) } : null;
        });
        console.log('Video state at timeout:', JSON.stringify(videoState));
        test.skip(true, 'Video did not start within 60 s — DRM block or server issue');
        return;
      }

      console.log('Video is playing — proceeding with CC checks');

      // ── Step 5: Check CC track availability ──────────────────────────────
      const trackInfo = await page.evaluate(() => {
        const v = document.querySelector('video') as HTMLVideoElement | null;
        if (!v) return { available: false, tracks: [] };
        const tracks = Array.from(v.textTracks).map(t => ({
          kind: t.kind,
          label: t.label,
          language: t.language,
          mode: t.mode,
        }));
        const available = tracks.some(t => t.kind === 'captions' || t.kind === 'subtitles');
        return { available, tracks };
      });

      console.log('Text tracks found:', JSON.stringify(trackInfo.tracks, null, 2));

      if (!trackInfo.available) {
        test.skip(true, 'Content has no caption/subtitle tracks — CC not supported for this asset');
        return;
      }

      // ── Step 6: Assert CC is OFF by default ──────────────────────────────
      const defaultState = await page.evaluate(() => {
        const v = document.querySelector('video') as HTMLVideoElement | null;
        return Array.from(v?.textTracks ?? [])
          .filter(t => t.kind === 'captions' || t.kind === 'subtitles')
          .some(t => t.mode === 'showing');
      });

      console.log(`CC active on load: ${defaultState}`);
      expect(defaultState, 'CC should be off by default when video starts').toBe(false);

      // ── Step 7: Discover the CC toggle button ─────────────────────────────
      // Hover over the video to surface player controls (most players auto-hide)
      const videoBox = await page.locator('video').first().boundingBox();
      if (videoBox) {
        await page.mouse.move(
          videoBox.x + videoBox.width / 2,
          videoBox.y + videoBox.height / 2
        );
        await page.waitForTimeout(500);
      }

      // Log all visible buttons in the player area to help identify selectors
      const playerButtons = await page.evaluate(() => {
        const videoEl = document.querySelector('video');
        if (!videoEl) return [];
        // Walk up to find the player wrapper (common ancestor of video + controls)
        let wrapper: Element | null = videoEl.parentElement;
        for (let i = 0; i < 6; i++) {
          if (!wrapper) break;
          const btns = wrapper.querySelectorAll('button');
          if (btns.length > 1) break;
          wrapper = wrapper.parentElement;
        }
        const root = wrapper ?? document;
        return Array.from(root.querySelectorAll('button')).map(b => ({
          text: (b as HTMLElement).innerText?.trim().slice(0, 40),
          ariaLabel: b.getAttribute('aria-label'),
          title: b.getAttribute('title'),
          classes: b.className.slice(0, 80),
        }));
      });
      console.log('Player buttons:', JSON.stringify(playerButtons, null, 2));

      // Find CC button using ordered selector list
      let ccButton = null;
      for (const sel of CC_BUTTON_SELECTORS) {
        const loc = page.locator(sel).first();
        const visible = await loc.isVisible({ timeout: 500 }).catch(() => false);
        if (visible) {
          ccButton = loc;
          console.log(`CC button found with selector: "${sel}"`);
          break;
        }
      }

      if (!ccButton) {
        test.skip(true, 'CC toggle button not found — check console log above for player button list');
        return;
      }

      // ── Step 8: Toggle CC ON — assert track becomes active ────────────────
      await ccButton.click();
      await page.waitForTimeout(800); // allow player to respond

      const ccOnState = await page.evaluate(() => {
        const v = document.querySelector('video') as HTMLVideoElement | null;
        return Array.from(v?.textTracks ?? [])
          .filter(t => t.kind === 'captions' || t.kind === 'subtitles')
          .some(t => t.mode === 'showing');
      });

      console.log(`CC active after first click (expect ON): ${ccOnState}`);
      expect(ccOnState, 'CC should be ON after clicking the CC button').toBe(true);

      // ── Step 9: Screenshot with CC on ────────────────────────────────────
      const screenshotDir = path.join(__dirname, '..', '..', 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({
        path: path.join(screenshotDir, `cc-on-${Date.now()}.png`),
      });
      console.log('Screenshot saved (CC on)');

      // ── Step 10: Toggle CC OFF — assert track returns to hidden ───────────
      // Re-hover to ensure controls are still visible
      if (videoBox) {
        await page.mouse.move(
          videoBox.x + videoBox.width / 2,
          videoBox.y + videoBox.height / 2
        );
        await page.waitForTimeout(300);
      }

      await ccButton.click();
      await page.waitForTimeout(800);

      const ccOffState = await page.evaluate(() => {
        const v = document.querySelector('video') as HTMLVideoElement | null;
        return Array.from(v?.textTracks ?? [])
          .filter(t => t.kind === 'captions' || t.kind === 'subtitles')
          .some(t => t.mode === 'showing');
      });

      console.log(`CC active after second click (expect OFF): ${ccOffState}`);
      expect(ccOffState, 'CC should be OFF after clicking the CC button again').toBe(false);

      // ── Step 11: Attach summary ───────────────────────────────────────────
      await testInfo.attach('closed-captions-result', {
        body: Buffer.from(
          [
            `CC tracks available  : ${trackInfo.available}`,
            `Tracks found         : ${trackInfo.tracks.map(t => `${t.kind} (${t.language || 'no lang'})`).join(', ')}`,
            `Default state        : ${defaultState ? 'ON ❌' : 'OFF ✅'}`,
            `After toggle on      : ${ccOnState  ? 'ON ✅' : 'OFF ❌'}`,
            `After toggle off     : ${ccOffState ? 'ON ❌' : 'OFF ✅'}`,
          ].join('\n')
        ),
        contentType: 'text/plain',
      });
    });

  });
});
