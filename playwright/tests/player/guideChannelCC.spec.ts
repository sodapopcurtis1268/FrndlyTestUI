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

      // ── Step 1: Navigate to Guide ─────────────────────────────────────────────
      await page.goto(guideUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Wait for REAL channel content — the skeleton phase shows a gradient on every
      // channel_img div; we need to wait until Angular has bound actual logo URLs or
      // at least one /partner/ <a> link is present.
      const guideLoaded = await page.waitForFunction(() => {
        // Real condition 1: any same-host <a> link pointing to /partner/
        if (document.querySelector('a[href*="/partner/"]')) return true;
        // Real condition 2: any channel_img with a non-gradient background-image
        const imgs = Array.from(document.querySelectorAll('.channel_img')) as HTMLElement[];
        return imgs.some(img => {
          const bg = (img.getAttribute('style') ?? '')
                   + window.getComputedStyle(img).backgroundImage;
          return bg.includes('url(') && !bg.includes('linear-gradient');
        });
      }, { timeout: 45_000 }).catch(() => null);

      if (!guideLoaded) {
        test.skip(true, 'Guide page did not render real content within 45 s — check URL or account access');
        return;
      }

      // Scroll the guide's channel column top-to-bottom so Angular's intersection
      // observer hydrates every channel_img div with its logo background-image.
      await page.evaluate(async () => {
        // The guide renders channels in a vertically-scrollable column
        const col = document.querySelector(
          '.tvguide, .guide_container, .guide-container, #guide, [class*="guide_wrap"], [class*="channel_list"]'
        ) as HTMLElement | null;
        const target: Element = col ?? document.documentElement;
        const total = (target as HTMLElement).scrollHeight ?? document.body.scrollHeight;
        const step  = 300;
        for (let pos = 0; pos <= total; pos += step) {
          (target as HTMLElement).scrollTop = pos;
          await new Promise(r => setTimeout(r, 80));
        }
        (target as HTMLElement).scrollTop = 0;
      });
      // Give Angular time to apply bg-image bindings after scroll
      await page.waitForTimeout(2_000);

      // ── Step 2: Inspect #list_of_channels — the real loaded guide structure ──
      // Previous runs confirmed the skeleton phase shows channel_img divs but the
      // fully-loaded guide uses id="list_of_channels". Dump its structure so we
      // can identify clickable channel rows and extract Angular component data.
      const listOfChannelsInfo = await page.evaluate(() => {
        const el = document.querySelector('#list_of_channels') as HTMLElement | null;
        if (!el) return { found: false, html: '', children: [] as any[], ngKeys: [] as string[] };

        const children = Array.from(el.children).slice(0, 20).map(c => ({
          tag:        c.tagName,
          id:         c.id,
          class:      c.className,
          childCount: c.children.length,
          text:       (c as HTMLElement).innerText?.trim().slice(0, 60) ?? '',
          outerHTML:  c.outerHTML.slice(0, 300),
          hasHref:    !!(c as HTMLAnchorElement).href || !!c.querySelector('a[href]'),
        }));

        // Angular 11 LView: the __ngContext__ array holds component instances
        // at indices that vary; scan for objects with channel-like properties.
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

        return { found: true, html: el.outerHTML.slice(0, 4000), children, ngKeys };
      });

      console.log('list_of_channels found:', listOfChannelsInfo.found);
      console.log('list_of_channels HTML (4 kB):', listOfChannelsInfo.html);
      console.log('list_of_channels children:', JSON.stringify(listOfChannelsInfo.children, null, 2));
      console.log('list_of_channels Angular context:', listOfChannelsInfo.ngKeys);

      // ── Step 3: Find channel links ────────────────────────────────────────────
      // Strategy A — <a href> partner links already in the DOM
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
            try { return new URL(a.href).hostname === location.hostname; }
            catch { return false; }
          })
          .map(a => ({
            href: a.href,
            name: a.innerText?.trim().replace(/\n[\s\S]*/g, '').slice(0, 60) ?? '',
          }))
          .filter((v, i, arr) => arr.findIndex(x => x.href === v.href) === i)
          .slice(0, 200);
      });

      // Strategy B — Angular LView extraction
      // CI confirmed: LView[26] on #list_of_channels = ARRAY(66) with shape
      //   { display: { imageUrl, title }, id, metadata, target: { pageAttributes: { networkid } } }
      // Two-method approach to work around for...of producing 0 on Angular's internal array:
      //   1. Per-.channel div: each *ngFor child has __ngContext__ containing the item object
      //   2. Parent LView[26] with index-based loop as fallback
      const angularResult = await page.evaluate((): { channels: Array<{href: string; name: string}>; debug: string } => {
        const list = document.querySelector('#list_of_channels') as HTMLElement | null;
        if (!list) return { channels: [], debug: '#list_of_channels not found' };

        // ── Method 1: per-.channel div ────────────────────────────────────────
        // Angular *ngFor attaches each iteration's LView to the rendered child
        // elements. The channel img title gives the name; scanning the div's
        // __ngContext__ gives the channel object with networkId.
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
        // Fall back to the parent element's LView at index 26 which holds the
        // full channel array. Use an indexed loop (not for...of) to be safe.
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

      // These log at Node.js level — they WILL appear in CI stdout
      console.log('Angular LView[26] firstItem (full):', angularResult.debug);
      const angularChannels = angularResult.channels;
      console.log(`Angular component channels: ${angularChannels.length}`);
      if (angularChannels.length > 0) {
        console.log('Angular sample:', JSON.stringify(angularChannels.slice(0, 3), null, 2));
      }

      const channelLinks = [...domChannelLinks, ...angularChannels]
        .filter((v, i, arr) => arr.findIndex(x => x.href === v.href) === i);

      console.log(`Channel links: dom=${domChannelLinks.length} angular=${angularChannels.length} total=${channelLinks.length}`)
      if (channelLinks.length > 0) {
        console.log('Sample links:', JSON.stringify(channelLinks.slice(0, 5), null, 2));
      }

      // ── Step 4: Build final channel list from all collected sources ──────────
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

      // ── Step 6: Test each channel ─────────────────────────────────────────
      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i];
        const result: ChannelResult = {
          name:         ch.name,
          index:        i,
          videoStarted: false,
          ccAvailable:  false,
          ccActive:     false,
        };

        console.log(`\n[${i + 1}/${channels.length}] Testing: "${ch.name}" — ${ch.href}`);

        try {
          // 'commit' resolves as soon as the server responds — before Angular
          // bootstraps — which avoids the hang caused by domcontentloaded waiting
          // for deferred scripts in the SPA shell.
          console.log(`  → goto…`);
          await page.goto(ch.href, { waitUntil: 'commit', timeout: 30_000 });
          console.log(`  → landed: ${page.url()}`);

          // Handle channel detail / folio page — /partner/* pages require
          // clicking Watch before playback starts. Extend timeout to 12 s
          // to give the Angular page time to render after navigation.
          const folioBtn = page.locator([
            'button:has-text("Watch Now")',
            'button:has-text("Watch Live")',
            'button:has-text("Watch")',
            'button:has-text("Play")',
            'a:has-text("Watch Now")',
            'a:has-text("Watch Live")',
            'a:has-text("Watch")',
          ].join(', ')).first();

          // Give Angular more time to bootstrap after 'commit' navigation (20 s)
          console.log(`  → checking folio…`);
          const folioAppeared = await folioBtn.waitFor({ state: 'visible', timeout: 20_000 })
            .then(() => true).catch(() => false);

          if (folioAppeared) {
            console.log(`  -> folio found — clicking watch button`);
            await folioBtn.click({ timeout: 20_000 });
            console.log(`  -> post-click URL: ${page.url()}`);
          }

          // Poll for video start — manual loop avoids waitForFunction timeout
          // issues caused by test.setTimeout(7_200_000) overriding page defaults.
          console.log(`  -> polling for video…`);
          let videoStarted = false;
          for (let poll = 0; poll < 30 && !videoStarted; poll++) {
            videoStarted = await page.evaluate(() => {
              const v = document.querySelector('video') as HTMLVideoElement | null;
              return !!(v && v.readyState >= 2 && (v.currentTime > 0 || !v.paused));
            }).catch(() => false);
            if (!videoStarted) await page.waitForTimeout(1_000);
          }
          console.log(`  -> video poll done: started=${videoStarted}`);

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
                await btn.click({ timeout: 5_000 });
                console.log(`  -> CC button clicked (${sel})`);
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
