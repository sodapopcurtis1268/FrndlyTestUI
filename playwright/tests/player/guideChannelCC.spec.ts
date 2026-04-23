import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Guide — Closed Captions on every channel
 *
 * Steps:
 *   1. Navigate to the Guide
 *   2. Collect all channel rows
 *   3. For each channel:
 *        a. Click the channel to begin playback
 *        b. Wait for video to start
 *        c. Wait VIDEO_PLAY_SECONDS (default 25 s) of live playback
 *        d. Enable CC via the player CC button
 *        e. Verify a caption/subtitle track is active (mode === 'showing')
 *        f. Navigate back to the Guide
 *   4. Assert every channel that successfully played had CC available
 *
 * Results are collected for ALL channels before asserting so the full
 * pass/fail breakdown is always visible in the report, even on failure.
 *
 * CC button selectors match the same priority list as closedCaptions.spec.ts.
 */

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

// Selectors used to identify clickable channel items in the guide.
// Logged on first run — extend this list once the real selector is known.
const CHANNEL_ITEM_SELECTORS = [
  '[class*="guide-row"]',
  '[class*="channel-row"]',
  '[class*="guide-item"]',
  '[class*="guide-channel"]',
  '[class*="channel-item"]',
  '[class*="channel-cell"]',
  '[class*="guide-cell"]',
  '[class*="guide_row"]',
  '[class*="channel_row"]',
  'li[class*="channel"]',
  'div[class*="channel"]',
];

interface ChannelResult {
  name:         string;
  index:        number;
  videoStarted: boolean;
  ccAvailable:  boolean;
  ccActive:     boolean;
  skipReason?:  string;
}

test.describe('Guide', () => {
  test.describe('Closed Captions', () => {

    // Large timeout: 25 s/channel × 70+ channels + navigation overhead
    test.setTimeout(7_200_000); // 2 hours

    test('Every guide channel has closed captions', async ({ page }, testInfo) => {

      const guideUrl = config.watchUrl + '/guide';

      // ── Step 1: Navigate to Guide ─────────────────────────────────────────
      await page.goto(guideUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Wait for the guide to render channel rows
      const guideLoaded = await page.waitForFunction(() => {
        // Accept any element whose class contains "guide" or "channel"
        return document.querySelectorAll('[class*="guide"],[class*="channel"]').length > 3;
      }, { timeout: 30_000 }).catch(() => null);

      if (!guideLoaded) {
        test.skip(true, 'Guide page did not render — check URL or account access');
        return;
      }

      // ── Step 2: Discover the channel item selector ────────────────────────
      // Log guide structure on first run so unknown selectors can be identified
      const guideStructure = await page.evaluate((selectors) => {
        return selectors.map(sel => ({
          selector: sel,
          count: document.querySelectorAll(sel).length,
          sample: (document.querySelector(sel) as HTMLElement)?.innerText?.trim().slice(0, 60) ?? '',
        })).filter(s => s.count > 0);
      }, CHANNEL_ITEM_SELECTORS);

      console.log('Guide structure discovery:', JSON.stringify(guideStructure, null, 2));

      // Pick the selector that found the most items (most likely the channel rows)
      const bestSelector = guideStructure.sort((a, b) => b.count - a.count)[0];

      if (!bestSelector) {
        test.skip(true, 'No channel items found in guide — check CHANNEL_ITEM_SELECTORS list');
        return;
      }

      console.log(`Using selector: "${bestSelector.selector}" (${bestSelector.count} channels)`);

      // ── Step 3: Collect channel names ─────────────────────────────────────
      // Log the full inner structure of the first channel element so we can
      // identify the correct child selector for the channel name.
      const firstChannelHtml = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.innerHTML.slice(0, 600) : 'not found';
      }, bestSelector.selector);
      console.log('First channel element HTML:', firstChannelHtml);

      const channelNames: string[] = await page.evaluate((sel) => {
        return Array.from(document.querySelectorAll(sel)).map((el, i) => {
          const h = el as HTMLElement;
          // Try common child selectors for channel name
          const nameEl =
            h.querySelector('[class*="channel-name"]') ??
            h.querySelector('[class*="channel_name"]') ??
            h.querySelector('[class*="channelName"]') ??
            h.querySelector('[class*="channel-title"]') ??
            h.querySelector('[class*="title"]') ??
            h.querySelector('[class*="name"]') ??
            h.querySelector('h3, h4, h5, strong, b');

          if (nameEl) return (nameEl as HTMLElement).innerText?.trim() || `Channel ${i + 1}`;

          // Fallback: find the longest non-"LIVE"/"HD" token in innerText lines
          const lines = h.innerText?.trim().split('\n').map(l => l.trim()).filter(Boolean) ?? [];
          const best = lines.find(l => l.length > 2 && !['LIVE', 'HD', 'SD', '4K'].includes(l.toUpperCase()));
          return best || `Channel ${i + 1}`;
        });
      }, bestSelector.selector);

      console.log(`Found ${channelNames.length} channels`);

      const results: ChannelResult[] = [];

      // ── Step 4: Test each channel ─────────────────────────────────────────
      for (let i = 0; i < channelNames.length; i++) {
        const channelName = channelNames[i];
        const result: ChannelResult = {
          name:         channelName,
          index:        i,
          videoStarted: false,
          ccAvailable:  false,
          ccActive:     false,
        };

        console.log(`\n[${i + 1}/${channelNames.length}] Testing: "${channelName}"`);

        try {
          // Navigate to guide fresh for each channel (avoids stale DOM)
          if (i > 0) {
            await page.goto(guideUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
            await page.waitForFunction(
              (sel) => document.querySelectorAll(sel).length > 0,
              bestSelector.selector,
              { timeout: 15_000 }
            );
          }

          // Click the channel item by index
          const channelItem = page.locator(bestSelector.selector).nth(i);
          await channelItem.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          await channelItem.click();

          // Handle folio overlay if it appears before the player
          const folioBtn = page.locator([
            'button:has-text("Watch Now")',
            'button:has-text("Watch Live")',
            'button:has-text("Play")',
            'button:has-text("Watch")',
          ].join(', ')).first();

          const folioAppeared = await folioBtn.waitFor({ state: 'visible', timeout: 6_000 })
            .then(() => true).catch(() => false);

          if (folioAppeared) {
            await folioBtn.click();
          }

          // Wait for video element to start playing
          const videoStarted = await page.waitForFunction(() => {
            const v = document.querySelector('video') as HTMLVideoElement | null;
            return v !== null && v.readyState >= 2 && (v.currentTime > 0 || !v.paused);
          }, { timeout: 30_000 }).catch(() => null);

          if (!videoStarted) {
            result.skipReason = 'Video did not start within 30 s';
            console.log(`  ⏭  Skipped — ${result.skipReason}`);
            results.push(result);
            continue;
          }

          result.videoStarted = true;

          // ── Watch for VIDEO_PLAY_SECONDS ────────────────────────────────
          console.log(`  ▶  Playing for ${config.videoPlaySeconds} s…`);
          await page.waitForTimeout(config.videoPlaySeconds * 1_000);

          // ── Check CC availability via textTracks ────────────────────────
          const trackInfo = await page.evaluate(() => {
            const v = document.querySelector('video') as HTMLVideoElement | null;
            const tracks = Array.from(v?.textTracks ?? []);
            return {
              available: tracks.some(t => t.kind === 'captions' || t.kind === 'subtitles'),
              active:    tracks.some(t => (t.kind === 'captions' || t.kind === 'subtitles') && t.mode === 'showing'),
              tracks:    tracks.map(t => ({ kind: t.kind, label: t.label, mode: t.mode })),
            };
          });

          result.ccAvailable = trackInfo.available;
          console.log(`  📋 CC tracks: ${JSON.stringify(trackInfo.tracks)}`);

          if (!trackInfo.available) {
            result.skipReason = 'No caption/subtitle tracks on this channel';
            console.log(`  ✗  No CC tracks found`);
            results.push(result);
            continue;
          }

          // ── Enable CC via player button if not already showing ──────────
          if (!trackInfo.active) {
            // Hover over video to reveal player controls
            const videoBox = await page.locator('video').first().boundingBox();
            if (videoBox) {
              await page.mouse.move(
                videoBox.x + videoBox.width / 2,
                videoBox.y + videoBox.height / 2
              );
              await page.waitForTimeout(500);
            }

            for (const sel of CC_BUTTON_SELECTORS) {
              const btn = page.locator(sel).first();
              const visible = await btn.isVisible({ timeout: 500 }).catch(() => false);
              if (visible) {
                await btn.click();
                console.log(`  🔘 CC button clicked (${sel})`);
                await page.waitForTimeout(800);
                break;
              }
            }
          }

          // ── Confirm CC is now active ────────────────────────────────────
          const ccActive = await page.evaluate(() => {
            const v = document.querySelector('video') as HTMLVideoElement | null;
            return Array.from(v?.textTracks ?? [])
              .some(t => (t.kind === 'captions' || t.kind === 'subtitles') && t.mode === 'showing');
          });

          result.ccActive = ccActive;
          const icon = ccActive ? '✅' : '❌';
          console.log(`  ${icon} CC active: ${ccActive}`);

        } catch (err: any) {
          result.skipReason = `Error: ${err.message?.slice(0, 120)}`;
          console.log(`  ⚠  ${result.skipReason}`);
        }

        results.push(result);
      }

      // ── Step 5: Build and attach full results report ──────────────────────
      const passed  = results.filter(r => r.ccActive).length;
      const failed  = results.filter(r => r.videoStarted && r.ccAvailable && !r.ccActive).length;
      const noCc    = results.filter(r => r.videoStarted && !r.ccAvailable).length;
      const skipped = results.filter(r => !r.videoStarted || r.skipReason).length;

      const reportLines = [
        `Guide CC Test — ${new Date().toISOString()}`,
        `Total channels: ${results.length}`,
        `CC active ✅ : ${passed}`,
        `CC not active ❌: ${failed}`,
        `No CC tracks : ${noCc}`,
        `Skipped      : ${skipped}`,
        '',
        'Channel-by-channel results:',
        ...results.map(r => {
          if (!r.videoStarted) return `  ⏭  [${r.index + 1}] ${r.name} — ${r.skipReason ?? 'video did not start'}`;
          if (!r.ccAvailable)  return `  📵 [${r.index + 1}] ${r.name} — no CC tracks`;
          if (r.ccActive)      return `  ✅ [${r.index + 1}] ${r.name} — CC active`;
          return                      `  ❌ [${r.index + 1}] ${r.name} — CC available but not active`;
        }),
      ];

      const reportText = reportLines.join('\n');
      console.log('\n' + reportText);

      await testInfo.attach('guide-cc-results', {
        body: Buffer.from(reportText),
        contentType: 'text/plain',
      });

      // Save report as a local file too
      const reportsDir = path.join(__dirname, '..', '..', 'run_results');
      fs.mkdirSync(reportsDir, { recursive: true });
      fs.writeFileSync(
        path.join(reportsDir, `guide-cc-${Date.now()}.txt`),
        reportText
      );

      // Screenshot of the last channel tested
      const screenshotDir = path.join(__dirname, '..', '..', 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({
        path: path.join(screenshotDir, `guide-cc-final-${Date.now()}.png`),
      });

      // ── Step 6: Assert all playable channels had CC ───────────────────────
      // Channels where video didn't start are excluded (server/DRM issue,
      // not a CC issue). Channels where CC tracks were found but not active
      // are the true failures.
      const ccFailures = results.filter(r => r.videoStarted && r.ccAvailable && !r.ccActive);
      const noCcChannels = results.filter(r => r.videoStarted && !r.ccAvailable);

      if (noCcChannels.length > 0) {
        console.warn(`⚠  ${noCcChannels.length} channel(s) had no CC tracks:\n` +
          noCcChannels.map(r => `  - ${r.name}`).join('\n'));
      }

      expect(
        ccFailures.length,
        `${ccFailures.length} channel(s) had CC tracks but CC could not be activated:\n` +
        ccFailures.map(r => `  - ${r.name}`).join('\n')
      ).toBe(0);

      expect(
        noCcChannels.length,
        `${noCcChannels.length} channel(s) had no CC tracks at all:\n` +
        noCcChannels.map(r => `  - ${r.name}`).join('\n')
      ).toBe(0);
    });

  });
});
