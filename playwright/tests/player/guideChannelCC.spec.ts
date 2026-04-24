import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Guide — Closed Captions on every channel
 *
 * Steps:
 *   1. Navigate to the Guide once to collect all channel URLs
 *   2. For each channel, navigate DIRECTLY to its URL (no guide re-visit per channel)
 *      - Angular JS bundle is cached after the first load — no cold-boot penalty
 *   3. Click Watch/Watch Now if the channel lands on a folio detail page first
 *   4. Wait up to 60 s for video to start
 *   5. Check HTMLVideoElement.textTracks for caption/subtitle tracks
 *   6. If CC is available but not active, click the CC button
 *   7. Assert CC mode is 'showing'
 *
 * Results are collected for ALL channels before asserting so the full
 * pass/fail breakdown is always visible in the report, even on failure.
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

    // Large timeout: 60 s/channel × 70+ channels + navigation overhead
    test.setTimeout(7_200_000); // 2 hours

    test('Every guide channel has closed captions', async ({ page }, testInfo) => {

      const guideUrl = config.watchUrl + '/guide';

      // ── Step 1: Navigate to Guide to collect channel list ─────────────────
      await page.goto(guideUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Wait for the guide's channel list to render (manual poll — avoids
      // waitForFunction timeout issues that occur with test.setTimeout(7_200_000))
      let guideLoaded = false;
      for (let p = 0; p < 45 && !guideLoaded; p++) {
        guideLoaded = await page.evaluate(() => {
          if (document.querySelector('a[href*="/partner/"]')) return true;
          const imgs = Array.from(document.querySelectorAll('.channel_img')) as HTMLElement[];
          return imgs.some(img => {
            const bg = (img.getAttribute('style') ?? '') +
                       window.getComputedStyle(img).backgroundImage;
            return bg.includes('url(') && !bg.includes('linear-gradient');
          });
        }).catch(() => false);
        if (!guideLoaded) await page.waitForTimeout(1_000);
      }

      if (!guideLoaded) {
        test.skip(true, 'Guide page did not render real content within 45 s — check URL or account access');
        return;
      }

      // ── Step 2: Dump #list_of_channels for diagnostics ───────────────────
      const listOfChannelsInfo = await page.evaluate(() => {
        const el = document.querySelector('#list_of_channels') as HTMLElement | null;
        if (!el) return { found: false, html: '', ngKeys: [] as string[] };

        const ngKeys: string[] = [];
        const ngCtx = (el as any).__ngContext__;
        if (Array.isArray(ngCtx)) {
          for (let i = 0; i < Math.min(ngCtx.length, 40); i++) {
            const item = ngCtx[i];
            if (item && typeof item === 'object' && !Array.isArray(item)) {
              const keys = Object.keys(item).filter(k => k.length < 40);
              if (keys.length > 0 && keys.length < 60) {
                ngKeys.push(`[${i}]: ${keys.join(', ')}`);
              }
            } else if (Array.isArray(item) && item.length > 3 &&
                       item[0] && typeof item[0] === 'object') {
              const k0 = Object.keys(item[0]);
              if (k0.some(k => /channel|partner|slug|name|url|id/i.test(k))) {
                ngKeys.push(`[${i}] ARRAY(${item.length}): keys=${k0.slice(0, 8).join(',')} sample=${JSON.stringify(item[0]).slice(0, 150)}`);
              }
            }
          }
        }

        return { found: true, html: el.outerHTML.slice(0, 2000), ngKeys };
      });

      console.log('list_of_channels found:', listOfChannelsInfo.found);
      console.log('list_of_channels Angular context:', listOfChannelsInfo.ngKeys);

      // ── Step 3: Collect channel URLs ─────────────────────────────────────
      // Strategy A — <a href> partner links in the DOM (featured channels)
      const domChannelLinks: Array<{ href: string; name: string }> = await page.evaluate(() => {
        const NAV_TEXTS = new Set(
          ['home', 'guide', 'movies', 'tv', 'my stuff', 'add-ons', 'settings', 'search', '']
        );
        const contentBody = document.querySelector('#content_body, .content_body');
        const links = Array.from(
          (contentBody ?? document).querySelectorAll('a[href]')
        ) as HTMLAnchorElement[];
        return links
          .filter(a => {
            const text = (a.innerText?.trim() ?? '').toLowerCase();
            if (!text || NAV_TEXTS.has(text)) return false;
            if (a.closest('.ott-sticky-header, .ott-header')) return false;
            // Exclude settings/privacy links — they are not channels
            try {
              const u = new URL(a.href);
              if (u.hostname !== location.hostname) return false;
              if (u.pathname.startsWith('/settings')) return false;
              if (u.hash) return false; // anchor-only links (#privacyControl etc.)
              return true;
            } catch { return false; }
          })
          .map(a => ({
            href: a.href,
            name: a.innerText?.trim().replace(/\n[\s\S]*/g, '').slice(0, 60) ?? '',
          }))
          .filter((v, i, arr) => arr.findIndex(x => x.href === v.href) === i)
          .slice(0, 200);
      });

      // Strategy B — Angular LView extraction
      // CI confirmed: LView[26] on #list_of_channels = ARRAY(66) of channel objects
      // with shape { display: { title, markers }, target: { pageAttributes: { networkid } } }
      // Skip channels marked non_playable (no live stream — e.g. SVOD-only packages).
      const angularResult = await page.evaluate((): { channels: Array<{href: string; name: string}>; debug: string } => {
        const list = document.querySelector('#list_of_channels') as HTMLElement | null;
        if (!list) return { channels: [], debug: '#list_of_channels not found' };

        // ── Method 1: per-.channel div ────────────────────────────────────────
        const channelDivs = Array.from(list.querySelectorAll('.channel')) as HTMLElement[];
        const channels1: Array<{href: string; name: string}> = [];

        for (let d = 0; d < channelDivs.length; d++) {
          const div = channelDivs[d];
          const img = div.querySelector('img[title]') as HTMLImageElement | null;
          const domName = img ? (img.getAttribute('title') ?? '') : '';

          const divCtx = (div as any).__ngContext__;
          let ch: any = null;
          if (Array.isArray(divCtx)) {
            for (let j = 0; j < Math.min(divCtx.length, 50); j++) {
              const item = divCtx[j];
              if (!item || typeof item !== 'object') continue;
              if (!Array.isArray(item) && item.display && item.display.imageUrl) { ch = item; break; }
              if (item.$implicit && item.$implicit.display && item.$implicit.display.imageUrl) { ch = item.$implicit; break; }
            }
          }

          // Skip non_playable channels (SVOD-only, no live stream)
          if (ch && ch.display && ch.display.markers &&
              ch.display.markers.special &&
              ch.display.markers.special.value === 'non_playable') continue;

          const name = domName || String(ch && ch.display && ch.display.title ? ch.display.title : '');
          const networkId = String(
            (ch && ch.target && ch.target.pageAttributes && ch.target.pageAttributes.networkid)
              ? ch.target.pageAttributes.networkid
              : (ch && ch.metadata && ch.metadata.id ? ch.metadata.id : '')
          ).trim();

          if (name && networkId) {
            channels1.push({ name, href: window.location.origin + '/channel/' + networkId });
          }
        }

        if (channels1.length > 0) {
          const unique = channels1.filter(function(v, i, a) { return a.findIndex(function(x) { return x.href === v.href; }) === i; });
          return { channels: unique, debug: 'per-div: ' + channelDivs.length + ' divs → ' + unique.length + ' channels' };
        }

        // ── Method 2: parent LView[26] index-based loop ───────────────────────
        const pCtx = (list as any).__ngContext__;
        const arr = Array.isArray(pCtx) ? pCtx[26] : null;
        const arrLen = Array.isArray(arr) ? arr.length : 0;

        if (arrLen === 0) {
          return { channels: [], debug: 'per-div=0, parent lview[26] empty (arrLen=' + arrLen + ')' };
        }

        const channels2: Array<{href: string; name: string}> = [];
        for (let i = 0; i < arrLen; i++) {
          const ch = arr[i];
          if (!ch || typeof ch !== 'object') continue;

          // Skip non_playable channels
          if (ch.display && ch.display.markers &&
              ch.display.markers.special &&
              ch.display.markers.special.value === 'non_playable') continue;

          const name = String(
            ch.display && ch.display.title ? ch.display.title : (ch.id != null ? ch.id : '')
          ).trim();
          const networkId = String(
            ch.target && ch.target.pageAttributes && ch.target.pageAttributes.networkid
              ? ch.target.pageAttributes.networkid
              : (ch.metadata && ch.metadata.id ? ch.metadata.id : '')
          ).trim();
          if (name && networkId) {
            channels2.push({ name, href: window.location.origin + '/channel/' + networkId });
          }
        }

        const unique2 = channels2.filter(function(v, i, a) { return a.findIndex(function(x) { return x.href === v.href; }) === i; });
        const firstItemStr = JSON.stringify(arr[0]).slice(0, 200);
        return {
          channels: unique2,
          debug: 'parent-lview: arrLen=' + arrLen + ' pushed=' + channels2.length + ' unique=' + unique2.length + ' firstItem=' + firstItemStr,
        };
      });

      console.log('Angular LView[26]:', angularResult.debug);
      const angularChannels = angularResult.channels;
      console.log(`Angular channels (playable): ${angularChannels.length}`);
      if (angularChannels.length > 0) {
        console.log('Angular sample:', JSON.stringify(angularChannels.slice(0, 3), null, 2));
      }

      // Merge DOM partner links + Angular channels; deduplicate by href
      const channelLinks = [...domChannelLinks, ...angularChannels]
        .filter((v, i, arr) => arr.findIndex(x => x.href === v.href) === i);

      console.log(`Channel links: dom=${domChannelLinks.length} angular=${angularChannels.length} total=${channelLinks.length}`);
      if (channelLinks.length > 0) {
        console.log('Sample links:', JSON.stringify(channelLinks.slice(0, 5), null, 2));
      }

      if (channelLinks.length === 0) {
        test.skip(true, 'No channel links found via DOM or Angular LView — check console above');
        return;
      }

      type ChannelEntry = { name: string; href: string };
      const channels: ChannelEntry[] = channelLinks.map((l, i) => ({
        name: l.name || `Channel ${i + 1}`,
        href: l.href,
      }));

      console.log(`Total channels to test: ${channels.length}`);

      const results: ChannelResult[] = [];

      // ── Step 4: Test each channel via DIRECT URL NAVIGATION ──────────────
      // Navigate to each channel URL directly. The Angular JS bundle is cached
      // in Chrome's HTTP cache after the first load, so subsequent page.goto()
      // calls skip the network download — Angular still bootstraps but without
      // the 30-60 s cold-boot download overhead seen in CI.
      //
      // This replaces the guide-click approach (clicking .channel divs via
      // page.evaluate JS) which failed because Angular's router ignores
      // synthetic DOM click() events from evaluate() — only real Playwright
      // mouse events or router.navigate() calls trigger navigation.
      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i];
        const result: ChannelResult = {
          name:         ch.name,
          index:        i,
          videoStarted: false,
          ccAvailable:  false,
          ccActive:     false,
        };

        console.log(`\n[${i + 1}/${channels.length}] Testing: "${ch.name}"`);

        try {
          // Navigate directly to channel URL
          await page.goto(ch.href, { waitUntil: 'commit', timeout: 30_000 });

          // Poll up to 30 s for the channel page to render.
          // Accept either: a video element (direct playback) OR a Watch button
          // (folio/detail page that requires one more click).
          let pageReady = false;
          for (let p = 0; p < 30 && !pageReady; p++) {
            pageReady = await page.evaluate(() => {
              if (document.querySelector('video')) return true;
              const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
              return btns.some(b => /^watch(\s+now)?$/i.test((b.innerText ?? '').trim()));
            }).catch(() => false);
            if (!pageReady) await page.waitForTimeout(1_000);
          }

          if (!pageReady) {
            result.skipReason = 'Channel page did not render within 30 s';
            console.log(`  ⏭  ${result.skipReason}`);
            results.push(result);
            continue;
          }

          // Some channels land on a folio/detail page with a Watch button before
          // starting playback. Click it if present.
          const watchBtn = page.locator('button').filter({ hasText: /^watch(\s+now)?$/i }).first();
          if (await watchBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await watchBtn.click().catch(() => {});
            console.log(`  -> clicked Watch button`);
            await page.waitForTimeout(1_000);
          }

          // Poll for video (60 s). Angular SPA + HLS stream init takes 10-30 s in CI.
          // Call v.play() on each poll to override any lingering autoplay block.
          let videoStarted = false;
          for (let poll = 0; poll < 60 && !videoStarted; poll++) {
            videoStarted = await page.evaluate(() => {
              const v = document.querySelector('video') as HTMLVideoElement | null;
              if (!v) return false;
              if (v.paused && v.readyState >= 1) v.play().catch(() => {});
              return v.readyState >= 2 && (v.currentTime > 0 || !v.paused);
            }).catch(() => false);
            if (!videoStarted) await page.waitForTimeout(1_000);
          }

          const finalUrl = page.url();
          const videoState = await page.evaluate(() => {
            const v = document.querySelector('video') as HTMLVideoElement | null;
            if (!v) return 'no video element';
            return `rs=${v.readyState} paused=${v.paused} t=${v.currentTime.toFixed(1)} err=${v.error?.code ?? 'none'} src=${v.currentSrc.slice(0, 80)}`;
          }).catch(() => 'eval failed');
          console.log(`  -> video=${videoStarted} url=${finalUrl} | ${videoState}`);

          if (!videoStarted) {
            result.skipReason = 'Video did not start within 60 s';
            console.log(`  ⏭  Skipped`);
            results.push(result);
            continue;
          }

          result.videoStarted = true;

          // ── Watch for VIDEO_PLAY_SECONDS ──────────────────────────────────
          console.log(`  ▶  Playing for ${config.videoPlaySeconds} s…`);
          await page.waitForTimeout(config.videoPlaySeconds * 1_000);

          // ── Check CC availability via textTracks ──────────────────────────
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

          // ── Enable CC via player button if not already showing ────────────
          if (!trackInfo.active) {
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
                await btn.click({ timeout: 5_000 });
                console.log(`  -> CC button clicked (${sel})`);
                await page.waitForTimeout(800);
                break;
              }
            }
          }

          // ── Confirm CC is now active ──────────────────────────────────────
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

      const reportsDir = path.join(__dirname, '..', '..', 'run_results');
      fs.mkdirSync(reportsDir, { recursive: true });
      fs.writeFileSync(
        path.join(reportsDir, `guide-cc-${Date.now()}.txt`),
        reportText
      );

      const screenshotDir = path.join(__dirname, '..', '..', 'screenshots');
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({
        path: path.join(screenshotDir, `guide-cc-final-${Date.now()}.png`),
      });

      // ── Step 6: Assert ────────────────────────────────────────────────────
      const ccFailures   = results.filter(r => r.videoStarted && r.ccAvailable && !r.ccActive);
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
