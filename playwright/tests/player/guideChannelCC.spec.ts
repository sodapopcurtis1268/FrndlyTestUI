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

      // ── Step 1: Navigate to Guide — intercept API responses for channel data
      // Many OTT apps return channel lists via a JSON API; capture those so we
      // can navigate to watch URLs directly instead of clicking DOM elements.
      const apiChannels: Array<{ name: string; href: string }> = [];
      page.on('response', async (response) => {
        const ct = response.headers()['content-type'] ?? '';
        if (!ct.includes('json')) return;
        try {
          const body = await response.json();
          // Walk common envelope shapes to find an array of items
          const candidates = [
            body,
            body.data, body.channels, body.items, body.results,
            body.content, body.payload, body.response, body.list,
          ];
          const items: any[] = (candidates.find(c => Array.isArray(c) && c.length >= 2) ?? []);
          if (items.length < 2) return;
          const url = response.url();
          console.log(`API hit: ${url.slice(0, 120)} — ${items.length} items | keys: ${Object.keys(items[0] ?? {}).join(', ')}`);
          for (const item of items) {
            const href = item.watch_url ?? item.watchUrl ?? item.url
                       ?? item.stream_url ?? item.streamUrl ?? item.partner_url ?? '';
            const name = item.channel_name ?? item.channelName ?? item.name
                       ?? item.title ?? item.channel_title ?? '';
            if (href && name) apiChannels.push({ name, href });
          }
        } catch { /* ignore parse errors */ }
      });

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
      //   { display: { imageUrl }, id, metadata, target, template }
      // 'target' is an object. Previous attempt produced /channel// meaning
      // target.url = '/channel/' (no slug). Return full first-item JSON to
      // Node.js level (NOT browser console) so it appears in CI stdout.
      const angularResult = await page.evaluate(() => {
        const el = document.querySelector('#list_of_channels') as any;
        const ctx = el?.__ngContext__;
        if (!Array.isArray(ctx)) return { channels: [] as Array<{href:string;name:string}>, debug: 'no Angular context on #list_of_channels' };

        const arr = ctx[26];
        if (!Array.isArray(arr) || !arr[0]?.display?.imageUrl) {
          return { channels: [], debug: `LView[26] unexpected: ${JSON.stringify(arr?.[0]).slice(0, 300)}` };
        }

        // Return full first item to Node.js so we see it in CI stdout
        const debug = JSON.stringify(arr[0]);

        // Data shape confirmed:
        //   target.pageAttributes.networkid  = "31"  (channel's numeric ID)
        //   target.path                      = "channel//"  (unfilled template → /channel/{networkid})
        //   display.markers.special.value    = "non_playable"  (skip these)
        //   display.title                    = "A&E"

        const channels: Array<{href:string;name:string}> = [];
        for (const ch of arr) {
          // Skip channels that cannot be played
          if (ch.display?.markers?.special?.value === 'non_playable') continue;

          const name: string = ch.display?.title ?? String(ch.id ?? '');
          // networkid is the reliable channel identifier
          const networkId: string =
            ch.target?.pageAttributes?.networkid ??
            ch.metadata?.id ??
            (typeof ch.id !== 'object' ? String(ch.id ?? '') : '');

          if (!networkId || !name) continue;

          // target.path = "channel//" → real URL is /channel/{networkId}
          const href = `${window.location.origin}/channel/${networkId}`;
          channels.push({ href, name });
        }

        return {
          channels: channels.filter((v, i, a) => a.findIndex(x => x.href === v.href) === i),
          debug,
        };
      });

      // These log at Node.js level — they WILL appear in CI stdout
      console.log('Angular LView[26] firstItem (full):', angularResult.debug);
      const angularChannels = angularResult.channels;
      console.log(`Angular component channels: ${angularChannels.length}`);
      if (angularChannels.length > 0) {
        console.log('Angular sample:', JSON.stringify(angularChannels.slice(0, 3), null, 2));
      }

      const channelLinks = [...domChannelLinks, ...angularChannels, ...apiChannels]
        .filter((v, i, arr) => arr.findIndex(x => x.href === v.href) === i);

      console.log(`Channel links: dom=${domChannelLinks.length} angular=${angularChannels.length} api=${apiChannels.length} total=${channelLinks.length}`)
      if (channelLinks.length > 0) {
        console.log('Sample links:', JSON.stringify(channelLinks.slice(0, 5), null, 2));
      }

      // ── Step 4: Build final channel list from all collected sources ──────────
      if (channelLinks.length === 0) {
        test.skip(true, 'No channel links found via DOM, Angular context, API, or click-capture — check console above');
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

        console.log(`\n[${i + 1}/${channels.length}] Testing: "${ch.name}"`);

        try {
          // All channels now have an href (from DOM links, Angular context, API,
          // or click-capture). Navigate directly.
          await page.goto(ch.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });

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

          const folioAppeared = await folioBtn.waitFor({ state: 'visible', timeout: 12_000 })
            .then(() => true).catch(() => false);

          if (folioAppeared) {
            console.log(`  🎬 Folio appeared — clicking watch button`);
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
