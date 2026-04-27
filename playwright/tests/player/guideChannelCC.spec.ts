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

    const ccMode    = config.guideCC === 'off' ? 'off' : 'on';
    const chTarget  = config.guideChannel || 'all';
    test(`Guide CC [mode=${ccMode}] [channels=${chTarget}]`, async ({ page }, testInfo) => {

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
      // Walk up from #list_of_channels to find its actual scrollable ancestor
      // (the static selector list above was missing the real guide container).
      await page.evaluate(async () => {
        const scrolled = new Set<Element>();

        const doScroll = async (target: HTMLElement) => {
          if (scrolled.has(target)) return;
          scrolled.add(target);
          const total = target.scrollHeight;
          for (let pos = 0; pos <= total; pos += 200) {
            target.scrollTop = pos;
            await new Promise(r => setTimeout(r, 60));
          }
          target.scrollTop = 0;
          await new Promise(r => setTimeout(r, 100));
        };

        // Walk up from #list_of_channels to find scrollable ancestors
        const list = document.querySelector('#list_of_channels') as HTMLElement | null;
        if (list) {
          let el: HTMLElement | null = list.parentElement;
          while (el && el !== document.documentElement) {
            const cs = window.getComputedStyle(el);
            const oy = cs.overflowY;
            if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 5) {
              await doScroll(el);
            }
            el = el.parentElement;
          }
        }

        // Also try common guide container selectors
        for (const sel of [
          '.tvguide', '.guide_container', '.guide-container', '#guide',
          '[class*="guide_wrap"]', '[class*="guide_left"]', '[class*="channels_col"]',
        ]) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el) await doScroll(el);
        }

        // Always scroll documentElement as final pass
        await doScroll(document.documentElement);
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

      // ── Channel filtering by GUIDE_CHANNEL env var ────────────────────────
      const targetNames = config.guideChannel
        ? config.guideChannel.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : [];
      const channelsToTest = targetNames.length
        ? channels.filter(ch => targetNames.includes(ch.name.toLowerCase()))
        : channels;

      if (channelsToTest.length === 0) {
        test.skip(true, `GUIDE_CHANNEL="${config.guideChannel}" matched no channels in the guide`);
        return;
      }

      console.log(`Testing ${channelsToTest.length} channel(s) [GUIDE_CC=${config.guideCC}]`);

      // ── One-time diagnostic: dump rt_block structure ─────────────────────
      // This tells us whether rt_block is a subscription gate, a wrapper
      // container, or a positioned overlay — critical for choosing click strategy.
      const rtBlockDiag = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('[class*="rt_block"],[id*="rt_block"]')) as HTMLElement[];
        if (els.length === 0) return { count: 0, info: [] as object[] };
        return {
          count: els.length,
          info: els.slice(0, 3).map(el => {
            const cs = window.getComputedStyle(el);
            return {
              tag:       el.tagName,
              cls:       el.className,
              position:  cs.position,
              zIndex:    cs.zIndex,
              pe:        cs.pointerEvents,
              w:         cs.width,
              h:         cs.height,
              top:       cs.top,
              left:      cs.left,
              children:  el.children.length,
              html:      el.innerHTML.slice(0, 300),
            };
          }),
        };
      });
      console.log('rt_block diagnostic:', JSON.stringify(rtBlockDiag, null, 2));

      const results: ChannelResult[] = [];

      // ── Step 3: setBitmovinCC helper ──────────────────────────────────────
      // Frndly TV's Bitmovin player renders CC via bmpui-ui-subtitle-overlay.
      // CC is OFF by default (overlay hidden). The "Subtitles" button opens the
      // appearance panel (font/color), NOT the track selector. To enable CC we
      // must go through the main settings gear → subtitle track page.
      //
      // Detection: bmpui-ui-subtitle-overlay without bmpui-hidden class = CC on.
      // Enable: gear icon → settings panel → click subtitle entry → click track.
      // Disable: same flow, click "Off".
      // Bitmovin JS API tried first (faster), gear UI used as fallback.
      const setBitmovinCC = async (mode: 'on' | 'off') => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Read the subtitle overlay's current hidden/visible state
        const readOverlay = () => page.evaluate(() => {
          const ov = document.querySelector('.bmpui-ui-subtitle-overlay') as HTMLElement | null;
          if (!ov) return { exists: false, hidden: true, cls: '' };
          const hidden = ov.classList.contains('bmpui-hidden') ||
                         window.getComputedStyle(ov).display === 'none';
          return { exists: true, hidden, cls: ov.className.toString().slice(0, 80) };
        });

        const initial = await readOverlay();
        console.log(`  -> Subtitle overlay: ${JSON.stringify(initial)}`);

        if (!initial.exists) {
          return { success: false, item: null as string | null,
                   items: [] as string[], ccAvailable: false };
        }

        // Return early if already in the desired state
        const ccOn = !initial.hidden;
        if (mode === 'on'  && ccOn)  return { success: true, item: 'already-on',  items: [], ccAvailable: true };
        if (mode === 'off' && !ccOn) return { success: true, item: 'already-off', items: [], ccAvailable: true };

        // ── Try 1: Bitmovin JS API (scan window scope broadly) ──────────────
        const apiOk = await page.evaluate((targetMode: string) => {
          const hasAPI = (o: any): boolean =>
            !!o && typeof o === 'object' && typeof o?.subtitles?.list === 'function';

          let p: any = null;

          // Named candidates
          for (const k of ['bitmovinplayer', 'player', 'Player', 'bitmovin']) {
            try { if (hasAPI((window as any)[k])) { p = (window as any)[k]; break; } } catch {}
          }
          if (!p) {
            try { if (hasAPI((window as any).bitmovin?.player)) p = (window as any).bitmovin.player; } catch {}
          }

          // Scan first 300 window properties for any object with subtitles.list
          if (!p) {
            for (const k of Object.getOwnPropertyNames(window).slice(0, 300)) {
              try {
                const v = (window as any)[k];
                if (hasAPI(v)) { p = v; break; }
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                  for (const k2 of Object.keys(v).slice(0, 30)) {
                    try { if (hasAPI(v[k2])) { p = v[k2]; break; } } catch {}
                  }
                  if (p) break;
                }
              } catch {}
            }
          }

          // Check DOM element properties
          if (!p) {
            for (const el of Array.from(document.querySelectorAll('[class*="bmpui-ui-uicontainer"]'))) {
              for (const k of ['__player', 'player', '_player', 'bitmovinPlayer', '__bitmovin__']) {
                if (hasAPI((el as any)[k])) { p = (el as any)[k]; break; }
              }
              if (p) break;
            }
          }

          if (!p) return { found: false, tracks: [] as string[], action: 'no-api' };

          const tracks: Array<{id: string; label: string}> = p.subtitles.list();
          const labels = tracks.map((t: any) => String(t.label ?? t.id));

          if (targetMode === 'off') {
            if (typeof p.subtitles.disable === 'function') p.subtitles.disable();
            return { found: true, tracks: labels, action: 'api-disabled' };
          } else {
            const first = tracks[0];
            if (!first) return { found: true, tracks: labels, action: 'no-tracks' };
            p.subtitles.enable(first.id);
            return { found: true, tracks: labels, action: 'api-enabled:' + (first.label ?? first.id) };
          }
        }, mode);

        console.log(`  -> Bitmovin API: ${JSON.stringify(apiOk)}`);

        if (apiOk.found) {
          await page.waitForTimeout(700);
          const post = await readOverlay();
          const success = mode === 'on' ? !post.hidden : post.hidden;
          console.log(`  -> Post-API overlay: ${JSON.stringify(post)}`);
          return { success, item: success ? mode : null,
                   items: apiOk.tracks, ccAvailable: true };
        }

        // ── Try 2: Settings gear UI → subtitle track page ───────────────────
        // Hover video first so controls are revealed
        const vb = await page.locator('video').first().boundingBox().catch(() => null);
        if (vb) {
          await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
          await page.waitForTimeout(400);
        }

        // Click the main settings gear button via page.mouse.click (isTrusted=true)
        const gearCoords = await page.evaluate(() => {
          const sels = [
            '.bmpui-ui-settingstogglebutton',
            'button[aria-label="Settings"]',
            'button[aria-label="Open settings"]',
            '[class*="settingstoggle"]',
          ];
          for (const sel of sels) {
            const btn = document.querySelector(sel) as HTMLElement | null;
            if (!btn) continue;
            // Un-hide bmpui-hidden ancestors so the element is reachable
            let el: HTMLElement | null = btn;
            while (el && el !== document.body) {
              el.classList.remove('bmpui-hidden');
              if (el.classList.contains('bmpui-ui-controlbar') || el.classList.contains('bmpui-ui-uicontainer')) break;
              el = el.parentElement;
            }
            const r = btn.getBoundingClientRect();
            return { sel, x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
          return null;
        });
        console.log(`  -> Gear button coords: ${JSON.stringify(gearCoords)}`);

        if (!gearCoords) {
          // Dump all visible buttons to identify the right selector
          const allBtns = await page.evaluate(() =>
            Array.from(document.querySelectorAll('button, [role="button"]'))
              .filter(el => el.getBoundingClientRect().width > 0)
              .map(el => ({
                aria: el.getAttribute('aria-label') ?? '',
                cls:  el.className.toString().slice(0, 60),
                txt:  (el as HTMLElement).innerText?.trim().slice(0, 30),
              })).slice(0, 20)
          );
          console.log(`  -> All visible buttons: ${JSON.stringify(allBtns)}`);
          return { success: false, item: null, items: [], ccAvailable: true };
        }

        await page.mouse.click(gearCoords.x, gearCoords.y);
        await page.waitForTimeout(300); // 300ms is enough for panel open animation

        // Dump what appeared in the DOM after clicking the gear (for diagnosis)
        const postGearDom = await page.evaluate(() => {
          // All visible bmpui elements matching settings/panel/subtitle
          const visible = Array.from(document.querySelectorAll('[class*="bmpui"]'))
            .filter(el => el.getBoundingClientRect().width > 0)
            .map(el => el.className.toString().slice(0, 100))
            .filter(cls => /setting|subtitle|caption|panel|listbox|listitem|toggle/i.test(cls))
            .slice(0, 25);
          // All visible buttons inside any settings-like container
          const settingsBtns = Array.from(document.querySelectorAll(
            '[class*="settings"] button, [class*="Settings"] button, ' +
            '[class*="panel"] button, [class*="Panel"] button'
          )).filter(el => el.getBoundingClientRect().width > 0)
            .map(el => ({
              cls: el.className.toString().slice(0, 60),
              txt: (el as HTMLElement).innerText?.trim().slice(0, 40),
              aria: el.getAttribute('aria-label') ?? '',
            })).slice(0, 20);
          return { visible, settingsBtns };
        });
        console.log(`  -> Post-gear DOM: ${JSON.stringify(postGearDom)}`);

        // The Bitmovin settings panel contains a bmpui-ui-subtitleselectbox —
        // a native <select> element for choosing the subtitle track.
        // Read-only evaluate: discover options and target text without setting value.
        // Bitmovin ignores synthetic dispatchEvent() (isTrusted=false); we must use
        // page.selectOption() from the Playwright layer to fire real browser events.
        const selectInfo = await page.evaluate((targetMode: string) => {
          const wrapper = document.querySelector('.bmpui-ui-subtitleselectbox') as HTMLElement | null;
          if (!wrapper) return { found: false, options: [] as string[], targetText: '', isSelf: false };

          const isSelf = wrapper.tagName === 'SELECT';
          const selectEl = (isSelf ? wrapper : wrapper.querySelector('select')) as HTMLSelectElement | null;
          if (!selectEl) return { found: true, options: [] as string[], targetText: '', isSelf };

          const options = Array.from(selectEl.options).map(o => o.text.trim());
          const target = targetMode === 'off'
            ? Array.from(selectEl.options).find(o => /^off$/i.test(o.text.trim()))
            : Array.from(selectEl.options).find(o => !/^off$/i.test(o.text.trim()));

          return { found: true, options, targetText: target?.text.trim() ?? '', isSelf };
        }, mode);
        console.log(`  -> Subtitle select: ${JSON.stringify(selectInfo)}`);

        let selectedText = '';
        if (selectInfo.found && selectInfo.targetText) {
          // page.selectOption() fires real CDP-level browser events (isTrusted=true)
          // which Bitmovin's event listener responds to. Synthetic dispatchEvent()
          // inside evaluate() has isTrusted=false and is silently ignored by Bitmovin.
          const selCSS = selectInfo.isSelf
            ? '.bmpui-ui-subtitleselectbox'
            : '.bmpui-ui-subtitleselectbox select';
          try {
            await page.selectOption(selCSS, { label: selectInfo.targetText },
                                    { force: true, timeout: 3_000 });
            selectedText = selectInfo.targetText;
            console.log(`  -> page.selectOption("${selectInfo.targetText}") OK`);
            // intentional fall-through to poll below
          } catch (err: any) {
            console.log(`  -> page.selectOption failed: ${err.message?.slice(0, 100)}`);
            // Fallback: synthetic events (works inconsistently but better than nothing)
            const fbOk = await page.evaluate((args: { mode: string; text: string }) => {
              const w = document.querySelector('.bmpui-ui-subtitleselectbox') as HTMLElement | null;
              if (!w) return false;
              const s = (w.tagName === 'SELECT' ? w : w.querySelector('select')) as HTMLSelectElement | null;
              if (!s) return false;
              const opt = Array.from(s.options).find(o => o.text.trim() === args.text);
              if (!opt) return false;
              s.value = opt.value;
              s.dispatchEvent(new Event('change', { bubbles: true }));
              s.dispatchEvent(new Event('input',  { bubbles: true }));
              return true;
            }, { mode, text: selectInfo.targetText });
            if (fbOk) selectedText = selectInfo.targetText;
          }
        }

        // Close the settings panel by clicking the gear again (toggle closed).
        // Using Escape may trigger Bitmovin's cancel handler and revert CC selection.
        await page.mouse.click(gearCoords.x, gearCoords.y);

        // Poll the subtitle overlay for up to 3 s — Bitmovin updates it asynchronously.
        let final = await readOverlay();
        for (let poll = 0; poll < 6 && (mode === 'on' ? final.hidden : !final.hidden); poll++) {
          await page.waitForTimeout(500);
          final = await readOverlay();
        }
        const success = mode === 'on' ? !final.hidden : final.hidden;
        console.log(`  -> Final overlay: ${JSON.stringify(final)} success=${success}`);

        return { success, item: selectedText || null,
                 items: selectInfo.options, ccAvailable: true };
      };

      // ── Step 4: Test each channel ─────────────────────────────────────────
      for (let i = 0; i < channelsToTest.length; i++) {
        const ch = channelsToTest[i];
        const result: ChannelResult = {
          name:         ch.name,
          index:        i,
          videoStarted: false,
          ccAvailable:  false,
          ccActive:     false,
        };

        console.log(`\n[${i + 1}/${channelsToTest.length}] Testing: "${ch.name}" [CC=${config.guideCC}]`);

        try {
          // Dismiss any open popup overlay from the previous channel.
          // template_overlay is a full-screen backdrop (1280×720) that persists
          // after each channel click and intercepts all subsequent guide clicks.
          // Clicking it at the top-left corner (outside the popup card) triggers
          // the backdrop click-outside handler and closes the popup.
          const hasLeftoverOverlay = await page.evaluate(() => {
            const to = document.querySelector('[class*="template_overlay"]') as HTMLElement | null;
            const r = to?.getBoundingClientRect();
            return !!(to && r && r.width > 100);
          });
          if (hasLeftoverOverlay) {
            await page.mouse.click(10, 10);
            await page.waitForTimeout(600);
          }

          // Ensure we're on the guide page (player close might have navigated away)
          if (!page.url().includes('/guide')) {
            await page.goto(guideUrl, { waitUntil: 'commit', timeout: 30_000 });
            await page.waitForTimeout(2_000);
          }

          // Scroll the channel img into view to get its Y coordinate (the row),
          // then compute the click X inside rt_block's program grid (the 3rd child).
          //
          // WHY: rt_block is the program guide grid that physically overlaps the
          // channel-logo column. The Angular (click) binding lives on the program
          // tiles inside rt_block — NOT on the channel <img>. When we disabled
          // rt_block's pointer-events the click fell through to the logo <img>,
          // which has no binding. Fix: keep rt_block clickable and target the
          // program grid (child[2] of rt_block) at the channel's Y row.
          const coords = await page.evaluate(async (name: string) => {
            // Shared helper: given a found img, compute the click coords.
            const computeCoords = (img: HTMLElement) => {
              img.scrollIntoView({ block: 'center', behavior: 'instant' });
              const imgRect = img.getBoundingClientRect();
              const imgCenterY = imgRect.top + imgRect.height / 2;
              const imgCenterX = imgRect.left + imgRect.width / 2;

              // Compute click X inside the program grid (rt_block child[2]).
              // child[0] = overlay_shadow, child[1] = rt_controls (nav arrows),
              // child[2] = the actual program tile grid.
              const rtBlock = document.querySelector('.rt_block') as HTMLElement | null;
              let clickX = imgCenterX;
              let strategy = 'img-center-fallback';
              let pgLeft = 0, pgWidth = 0;

              if (rtBlock && rtBlock.children.length >= 3) {
                const pg = rtBlock.children[2] as HTMLElement;
                const pgRect = pg.getBoundingClientRect();
                pgLeft  = pgRect.left;
                pgWidth = pgRect.width;
                clickX = pgRect.left + pgRect.width * 0.2;
                strategy = 'program-grid-child2';
              } else if (rtBlock) {
                const rtRect = rtBlock.getBoundingClientRect();
                clickX = rtRect.left + rtRect.width * 0.3;
                strategy = 'rt_block-30pct';
              }

              const elAtImgPoint   = document.elementFromPoint(imgCenterX, imgCenterY);
              const elAtClickPoint = document.elementFromPoint(clickX,      imgCenterY);
              return {
                x: clickX, y: imgCenterY,
                imgX: imgCenterX,
                strategy,
                pgLeft, pgWidth,
                elAtImg:   `<${elAtImgPoint?.tagName}>  "${(elAtImgPoint?.className  ?? '').toString().slice(0, 50)}"`,
                elAtClick: `<${elAtClickPoint?.tagName}> "${(elAtClickPoint?.className ?? '').toString().slice(0, 50)}"`,
              };
            };

            // First try: img already in the DOM without scrolling
            let imgs = Array.from(
              document.querySelectorAll('#list_of_channels .channel img')
            ) as HTMLElement[];
            let img = imgs.find(el => el.getAttribute('title') === name);
            if (img) return computeCoords(img);

            // Not found — try scrolling the guide's actual scrollable ancestor
            // to bring this channel's img into the DOM.
            const list = document.querySelector('#list_of_channels') as HTMLElement | null;
            const candidates: HTMLElement[] = [];
            if (list) {
              let el: HTMLElement | null = list.parentElement;
              while (el && el !== document.documentElement) {
                const cs = window.getComputedStyle(el);
                const oy = cs.overflowY;
                if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 5) {
                  candidates.push(el);
                  break; // nearest scrollable ancestor is enough
                }
                el = el.parentElement;
              }
            }
            candidates.push(document.documentElement);

            for (const target of candidates) {
              const total = target.scrollHeight;
              const step  = 150;
              for (let pos = 0; pos <= total + step; pos += step) {
                target.scrollTop = pos;
                await new Promise(r => setTimeout(r, 70));
                imgs = Array.from(
                  document.querySelectorAll('#list_of_channels .channel img')
                ) as HTMLElement[];
                img = imgs.find(el => el.getAttribute('title') === name);
                if (img) return computeCoords(img);
              }
              target.scrollTop = 0; // reset before trying next candidate
            }

            return null;
          }, ch.name);

          if (!coords) {
            result.skipReason = `"${ch.name}" img not in guide DOM`;
            console.log(`  ⏭  ${result.skipReason}`);
            results.push(result);
            continue;
          }

          if (i < 5) {
            console.log(`  -> strategy: ${coords.strategy}  pgLeft=${coords.pgLeft} pgW=${coords.pgWidth}`);
            console.log(`  -> elAtImg:   ${coords.elAtImg}`);
            console.log(`  -> elAtClick: ${coords.elAtClick}`);
          }

          // Small pause to let scrollIntoView settle before clicking
          await page.waitForTimeout(300);

          // Disable ONLY overlay_shadow (the dimming div inside rt_block).
          // We must NOT disable rt_block itself — the program tiles inside it
          // carry the Angular (click) bindings that open the player overlay.
          await page.evaluate(() => {
            let s = document.getElementById('__pw_pe_override__') as HTMLStyleElement | null;
            if (!s) {
              s = document.createElement('style');
              s.id = '__pw_pe_override__';
              document.head.appendChild(s);
            }
            s.textContent = `
              [class*="overlay_shadow"],[id*="overlay_shadow"] {
                pointer-events: none !important;
              }
            `;
          });

          // page.mouse.click() generates a real mouse event with isTrusted=true.
          // Angular's (click) binding fires → opens the player overlay on /guide.
          await page.mouse.click(coords.x, coords.y);

          // Remove the style override
          await page.evaluate(() => {
            document.getElementById('__pw_pe_override__')?.remove();
          });

          // Wait for Angular to finish rendering after the program tile click.
          // The template_overlay appears within ~500 ms but its content (player
          // or watch button) may take another second or two to hydrate.
          await page.waitForTimeout(2_500);

          console.log(`  -> clicked — url: ${page.url()}`);

          // The program tile click opens a popup card inside .container_overlay.
          // template_overlay is just the full-screen backdrop (1280×720, 0 children).
          // container_overlay holds the actual card: image + title + Watch button.
          const watchBtnCoords = await page.evaluate((diagIdx: number) => {
            const card = document.querySelector('[class*="container_overlay"]') as HTMLElement | null;
            const html = card ? card.innerHTML.slice(0, 2500) : 'no container_overlay';

            if (!card) return { coords: null, html, btnInfo: null, clickables: [] as object[] };

            // Log every element inside the card that has cursor:pointer —
            // the Watch CTA is a <div>/<a> with a click handler, not a <button>.
            const clickables = Array.from(card.querySelectorAll('*'))
              .filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0 &&
                       window.getComputedStyle(el).cursor === 'pointer';
              })
              .map(el => ({
                tag: el.tagName,
                cls: (el.className ?? '').toString().slice(0, 60),
                txt: (el as HTMLElement).innerText?.trim().slice(0, 40),
              }));

            // First: match by visible text to avoid picking "Episodes"/"Record"/"Favorite"
            // btn_info elements (all share [class*="btn"] so class alone is insufficient).
            const watchTexts = ['watch live', 'watch', 'resume', 'play'];
            const allInCard = Array.from(card.querySelectorAll('*')) as HTMLElement[];
            let btn: HTMLElement | null = allInCard.find(el => {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) return false;
              const txt = (el as HTMLElement).innerText?.trim().toLowerCase() ?? '';
              return watchTexts.some(w => txt === w);
            }) ?? null;

            // Fallback: class-based — exclude generic [class*="btn"] to avoid wrong buttons
            if (!btn) {
              btn = (
                card.querySelector('[class*="watch"]')  ??
                card.querySelector('[class*="Watch"]')  ??
                card.querySelector('[class*="play"]')   ??
                card.querySelector('[class*="Play"]')   ??
                card.querySelector('[class*="cta"]')    ??
                card.querySelector('button')            ??
                card.querySelector('a')                 ??
                card.querySelector('[role="button"]')   ??
                allInCard.find(el => {
                  const r = el.getBoundingClientRect();
                  return r.width > 0 && r.height > 0 &&
                         window.getComputedStyle(el).cursor === 'pointer';
                }) ?? null
              ) as HTMLElement | null;
            }

            if (!btn) return { coords: null, html, btnInfo: null, clickables };

            const br = btn.getBoundingClientRect();
            if (br.width === 0 || br.height === 0) return { coords: null, html, btnInfo: { invisible: true, cls: btn.className }, clickables };
            return {
              coords: { x: br.left + br.width / 2, y: br.top + br.height / 2 },
              html,
              btnInfo: {
                tag: btn.tagName,
                cls: btn.className?.toString().slice(0, 60),
                txt: (btn as HTMLButtonElement).innerText?.trim().slice(0, 40),
              },
              clickables,
            };
          }, i);

          if (i < 3) {
            console.log(`  -> container_overlay html: ${watchBtnCoords.html}`);
            console.log(`  -> clickables: ${JSON.stringify(watchBtnCoords.clickables)}`);
          }

          if (watchBtnCoords.coords) {
            const wc = watchBtnCoords.coords;
            console.log(`  -> watch btn <${watchBtnCoords.btnInfo?.tag}> "${watchBtnCoords.btnInfo?.cls}" "${watchBtnCoords.btnInfo?.txt}"`);
            await page.mouse.click(wc.x, wc.y);
            await page.waitForTimeout(500);
          } else {
            console.log(`  -> no watch btn in container_overlay (html: ${watchBtnCoords.html.slice(0, 80)})`);
          }

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

          // ── CC set + verify via Bitmovin overlay ─────────────────────────
          // Frndly TV's Bitmovin player renders CC in bmpui-ui-subtitle-overlay,
          // NOT via native video.textTracks. Detection is overlay-based; the
          // Bitmovin JS API is used to enable/disable when needed.
          const ccSetMode: 'on' | 'off' = config.guideCC === 'off' ? 'off' : 'on';
          const ccResult = await setBitmovinCC(ccSetMode);
          console.log(`  -> setBitmovinCC(${ccSetMode}): ${JSON.stringify(ccResult)}`);

          if (ccSetMode === 'on') {
            result.ccAvailable = ccResult.ccAvailable !== false;
            result.ccActive    = ccResult.success;

            if (!result.ccAvailable) {
              result.skipReason = 'No bmpui-ui-subtitle-overlay found — player may not have CC';
              console.log(`  ✗  No CC overlay in player`);
            } else {
              console.log(`  ${result.ccActive ? '✅' : '❌'} CC on: active=${result.ccActive}`);
            }
          } else {
            result.ccAvailable = ccResult.ccAvailable !== false;
            result.ccActive    = ccResult.success; // true = "Off" successfully set

            if (!result.ccAvailable) {
              result.skipReason = 'No subtitle overlay found — nothing to disable';
              console.log(`  ⏭  No CC overlay — nothing to disable`);
            } else {
              console.log(`  ${result.ccActive ? '✅' : '❌'} CC off: disabled=${result.ccActive}`);
            }
          }

        } catch (err: any) {
          result.skipReason = `Error: ${err.message?.slice(0, 120)}`;
          console.log(`  ⚠  ${result.skipReason}`);
        }

        // Close any open popup overlay before the next channel.
        // Escape alone does not close template_overlay — also click the backdrop
        // corner (10,10) which is outside the popup card and triggers click-outside.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const overlayOpen = await page.evaluate(() => {
          const to = document.querySelector('[class*="template_overlay"]') as HTMLElement | null;
          const r = to?.getBoundingClientRect();
          return !!(to && r && r.width > 100);
        });
        if (overlayOpen) {
          await page.mouse.click(10, 10);
          await page.waitForTimeout(500);
        }

        results.push(result);
      }

      // ── Step 5: Report ────────────────────────────────────────────────────
      const finalCcMode = config.guideCC === 'off' ? 'off' : 'on';
      const passed  = results.filter(r => r.ccActive).length;
      const failed  = results.filter(r => r.videoStarted && r.ccAvailable && !r.ccActive).length;
      const noCc    = results.filter(r => r.videoStarted && !r.ccAvailable).length;
      const skipped = results.filter(r => !r.videoStarted || r.skipReason).length;

      const modeLabel = finalCcMode === 'on' ? 'CC-ON test' : 'CC-OFF test';
      const reportLines = [
        `Guide CC Test [${modeLabel}] — ${new Date().toISOString()}`,
        `Channels tested : ${results.length}`,
        finalCcMode === 'on'
          ? `CC enabled ✅  : ${passed}`
          : `CC disabled ✅ : ${passed}`,
        finalCcMode === 'on'
          ? `CC failed ❌   : ${failed}`
          : `CC still on ❌ : ${failed}`,
        `No CC panel    : ${noCc}`,
        `Skipped        : ${skipped}`,
        '',
        'Channel-by-channel results:',
        ...results.map(r => {
          if (!r.videoStarted) return `  ⏭  [${r.index + 1}] ${r.name} — ${r.skipReason ?? 'video did not start'}`;
          if (!r.ccAvailable)  return `  📵 [${r.index + 1}] ${r.name} — no CC panel items`;
          if (r.ccActive)      return finalCcMode === 'on'
            ? `  ✅ [${r.index + 1}] ${r.name} — CC enabled`
            : `  ✅ [${r.index + 1}] ${r.name} — CC disabled`;
          return finalCcMode === 'on'
            ? `  ❌ [${r.index + 1}] ${r.name} — CC could not be enabled`
            : `  ❌ [${r.index + 1}] ${r.name} — CC could not be disabled`;
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
      if (finalCcMode === 'on') {
        // CC-ON mode: every channel that had a video and a subtitle panel should
        // have had CC successfully activated.
        const ccFailures   = results.filter(r => r.videoStarted && r.ccAvailable && !r.ccActive);
        const noCcChannels = results.filter(r => r.videoStarted && !r.ccAvailable);

        if (noCcChannels.length > 0) {
          console.warn(`⚠  ${noCcChannels.length} channel(s) had no CC tracks:\n` +
            noCcChannels.map(r => `  - ${r.name}`).join('\n'));
        }

        expect(
          ccFailures.length,
          `${ccFailures.length} channel(s) had CC tracks but CC could not be enabled:\n` +
          ccFailures.map(r => `  - ${r.name}`).join('\n')
        ).toBe(0);

        expect(
          noCcChannels.length,
          `${noCcChannels.length} channel(s) had no CC tracks at all:\n` +
          noCcChannels.map(r => `  - ${r.name}`).join('\n')
        ).toBe(0);
      } else {
        // CC-OFF mode: every channel that had a video and a subtitle panel should
        // have had CC successfully disabled.
        const stillOnChannels = results.filter(r => r.videoStarted && r.ccAvailable && !r.ccActive);

        if (stillOnChannels.length > 0) {
          console.warn(`⚠  ${stillOnChannels.length} channel(s) could not be disabled:\n` +
            stillOnChannels.map(r => `  - ${r.name}`).join('\n'));
        }

        expect(
          stillOnChannels.length,
          `${stillOnChannels.length} channel(s) could not have CC disabled:\n` +
          stillOnChannels.map(r => `  - ${r.name}`).join('\n')
        ).toBe(0);
      }
    });

  });
});
