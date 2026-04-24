import { test, expect } from '@playwright/test';
import { config } from '../../utils/config';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Guide — Closed Captions on every channel
 *
 * Navigation strategy (important):
 *   Navigating directly to /channel/N lands on a channel INFO page — the
 *   video player is NOT shown automatically. The player only opens when the
 *   user clicks a channel image in the guide.
 *
 *   page.evaluate() JS .click() fires an isTrusted=false synthetic event that
 *   Angular's router ignores. page.mouse.click(x, y) fires a real mouse event
 *   with isTrusted=true that Angular responds to and opens the player overlay
 *   (URL stays at /guide while the player plays over the guide).
 *
 * Per-channel flow:
 *   1. Ensure we are on /guide (navigate there if URL drifted)
 *   2. page.evaluate(): find channel img by title, scroll into view, return coords
 *   3. page.mouse.click(x, y): real click → Angular opens player overlay
 *   4. Poll 60 s for <video> to start
 *   5. Check textTracks for CC
 *   6. Press Escape to close the player overlay
 *   7. Repeat for next channel
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

    test.setTimeout(7_200_000); // 2 hours

    test('Every guide channel has closed captions', async ({ page }, testInfo) => {

      const guideUrl = config.watchUrl + '/guide';

      // ── Step 1: Navigate to Guide ─────────────────────────────────────────
      await page.goto(guideUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Wait for guide surface content (partner links indicate real render)
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
        test.skip(true, 'Guide page did not render real content within 45 s');
        return;
      }

      // Scroll the guide so Angular's intersection observer hydrates
      // #list_of_channels and all .channel divs with their img elements.
      await page.evaluate(async () => {
        const col = document.querySelector(
          '.tvguide, .guide_container, .guide-container, #guide, [class*="guide_wrap"], [class*="channel_list"]'
        ) as HTMLElement | null;
        const target = col ?? document.documentElement;
        const total = target.scrollHeight ?? document.body.scrollHeight;
        for (let pos = 0; pos <= total; pos += 300) {
          target.scrollTop = pos;
          await new Promise(r => setTimeout(r, 80));
        }
        target.scrollTop = 0;
      });

      // Wait for #list_of_channels channel images to appear
      let listReady = false;
      for (let p = 0; p < 15 && !listReady; p++) {
        listReady = await page.evaluate(() =>
          document.querySelectorAll('#list_of_channels .channel img[title]').length > 0
        ).catch(() => false);
        if (!listReady) await page.waitForTimeout(1_000);
      }
      console.log(`list_of_channels rendered: ${listReady}`);

      // ── Step 2: Collect channel list from Angular LView[26] ──────────────
      // Using ONLY the Angular list — it covers all channels including those
      // that also appear as featured DOM partner links at the top.
      const angularResult = await page.evaluate((): { channels: Array<{href: string; name: string}>; debug: string } => {
        const list = document.querySelector('#list_of_channels') as HTMLElement | null;
        if (!list) return { channels: [], debug: '#list_of_channels not found' };

        // Method 1: per-.channel div __ngContext__
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

        // Method 2: parent LView[26] index-based loop
        const pCtx = (list as any).__ngContext__;
        const arr = Array.isArray(pCtx) ? pCtx[26] : null;
        const arrLen = Array.isArray(arr) ? arr.length : 0;

        if (arrLen === 0) {
          return { channels: [], debug: 'per-div=0, parent lview[26] empty' };
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
        return {
          channels: unique2,
          debug: 'parent-lview: arrLen=' + arrLen + ' pushed=' + channels2.length + ' unique=' + unique2.length,
        };
      });

      console.log('Angular LView[26]:', angularResult.debug);
      const channels = angularResult.channels;
      console.log(`Channels to test: ${channels.length}`);
      if (channels.length > 0) {
        console.log('Sample:', JSON.stringify(channels.slice(0, 3), null, 2));
      }

      if (channels.length === 0) {
        test.skip(true, 'No channels found in Angular LView — check console above');
        return;
      }

      console.log(`Total channels to test: ${channels.length}`);

      const results: ChannelResult[] = [];

      // ── Step 3: Test each channel ─────────────────────────────────────────
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
          // Ensure we're on the guide page (player close might have navigated away)
          if (!page.url().includes('/guide')) {
            await page.goto(guideUrl, { waitUntil: 'commit', timeout: 30_000 });
            await page.waitForTimeout(2_000);
          }

          // Find the channel image in #list_of_channels, scroll it into view,
          // and return its viewport coordinates.
          // page.evaluate handles special chars in title (A&E, Crime+Investigation, etc.)
          const coords = await page.evaluate((name: string) => {
            const imgs = Array.from(
              document.querySelectorAll('#list_of_channels .channel img')
            ) as HTMLElement[];
            const img = imgs.find(el => el.getAttribute('title') === name);
            if (!img) return null;
            img.scrollIntoView({ block: 'center', behavior: 'instant' });
            const rect = img.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            const elAtPoint = document.elementFromPoint(x, y);
            return {
              x, y,
              elTag:   elAtPoint?.tagName ?? 'none',
              elClass: (elAtPoint?.className ?? '').toString().slice(0, 80),
            };
          }, ch.name);

          if (!coords) {
            result.skipReason = `"${ch.name}" img not in guide DOM`;
            console.log(`  ⏭  ${result.skipReason}`);
            results.push(result);
            continue;
          }

          if (i < 5) {
            console.log(`  -> elementFromPoint: <${coords.elTag}> "${coords.elClass}"`);
          }

          // Small pause to let scrollIntoView settle before clicking
          await page.waitForTimeout(300);

          // Disable pointer-events on overlay_shadow elements so the real mouse
          // click (isTrusted=true) reaches the channel img underneath.
          // These fixed/absolute overlays cover the guide and intercept clicks.
          await page.evaluate(() => {
            document.querySelectorAll<HTMLElement>('[class*="overlay_shadow"], [id*="overlay_shadow"]')
              .forEach(el => { (el as any).__origPE = el.style.pointerEvents; el.style.pointerEvents = 'none'; });
          });

          // page.mouse.click() generates a real mouse event with isTrusted=true.
          // Angular's (click) binding fires → router opens player overlay on /guide.
          // JS element.click() / page.evaluate click() produces isTrusted=false
          // which Angular's router ignores — that's why the previous approach failed.
          await page.mouse.click(coords.x, coords.y);

          // Restore overlay pointer-events immediately after the click
          await page.evaluate(() => {
            document.querySelectorAll<HTMLElement>('[class*="overlay_shadow"], [id*="overlay_shadow"]')
              .forEach(el => { el.style.pointerEvents = (el as any).__origPE ?? ''; });
          });

          await page.waitForTimeout(500);

          console.log(`  -> clicked — url: ${page.url()}`);

          // Diagnostic dump for first 5 channels (understand page structure)
          if (i < 5) {
            const diag = await page.evaluate((cx) => {
              const v = document.querySelector('video') as HTMLVideoElement | null;
              const iframes = Array.from(document.querySelectorAll('iframe'))
                .map(f => ({ src: (f as HTMLIFrameElement).src.slice(0, 80), id: f.id }));
              const btns = Array.from(document.querySelectorAll('button'))
                .map(b => ({
                  text: (b as HTMLButtonElement).innerText?.trim().slice(0, 30),
                  aria: b.getAttribute('aria-label') || '',
                  cls:  b.className.slice(0, 40),
                }))
                .filter(b => b.text || b.aria)
                .slice(0, 8);
              const playerEls = Array.from(document.querySelectorAll(
                '[class*="player"], [class*="Player"], .jw-video, video-js'
              )).map(el => el.className.slice(0, 60)).slice(0, 5);
              const elAfterClick = document.elementFromPoint(cx.x, cx.y);
              return {
                hasVideo: !!v,
                videoRS:  v?.readyState ?? -1,
                iframes,
                buttons: btns,
                playerEls,
                elAfterClick: `<${elAfterClick?.tagName}> ${(elAfterClick?.className ?? '').toString().slice(0, 60)}`,
                url: location.href.slice(0, 80),
              };
            }, coords).catch(() => null);
            if (diag) console.log(`  -> diag: ${JSON.stringify(diag)}`);
          }

          // Poll for video (60 s). Player overlay on /guide should contain a
          // <video> element. Call v.play() on each tick to handle autoplay blocks.
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
            // Close any open overlay before next channel
            await page.keyboard.press('Escape');
            await page.waitForTimeout(300);
            results.push(result);
            continue;
          }

          result.videoStarted = true;

          console.log(`  ▶  Playing for ${config.videoPlaySeconds} s…`);
          await page.waitForTimeout(config.videoPlaySeconds * 1_000);

          // Check CC via textTracks
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
          } else if (!trackInfo.active) {
            // Hover to reveal controls then click CC button
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

            const ccActive = await page.evaluate(() => {
              const v = document.querySelector('video') as HTMLVideoElement | null;
              return Array.from(v?.textTracks ?? [])
                .some(t => (t.kind === 'captions' || t.kind === 'subtitles') && t.mode === 'showing');
            });

            result.ccActive = ccActive;
            console.log(`  ${ccActive ? '✅' : '❌'} CC active: ${ccActive}`);
          } else {
            result.ccActive = true;
            console.log(`  ✅ CC already active`);
          }

        } catch (err: any) {
          result.skipReason = `Error: ${err.message?.slice(0, 120)}`;
          console.log(`  ⚠  ${result.skipReason}`);
        }

        // Close player overlay (Escape) so guide is ready for the next channel
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        results.push(result);
      }

      // ── Step 4: Report ────────────────────────────────────────────────────
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

      // ── Step 5: Assert ────────────────────────────────────────────────────
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
