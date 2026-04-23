# Frndly TV — UI Test Automation Suite

> **Owner:** QA / Engineering  
> **Repo:** [FrndlyTestUI](https://github.com/sodapopcurtis1268/FrndlyTestUI)  
> **Active branch:** `feature/playwright-web-suite`  
> **Status:** Active development — Playwright suite growing alongside legacy Java/Selenium stack

---

## Table of Contents

1. [Overview](#overview)
2. [Why We Migrated to Playwright](#why-we-migrated-to-playwright)
3. [Tech Stack](#tech-stack)
4. [Repository Layout](#repository-layout)
5. [Authentication Strategy](#authentication-strategy)
6. [Test Suites](#test-suites)
   - [Smoke Suite](#smoke-suite)
   - [Regression Suite](#regression-suite)
   - [Home Screen Suite](#home-screen-suite)
   - [Player Suite](#player-suite)
   - [Guide CC Suite](#guide-cc-suite)
7. [CI / GitHub Actions](#ci--github-actions)
8. [Configuration & Secrets](#configuration--secrets)
9. [Page Objects](#page-objects)
10. [Branch & PR Workflow](#branch--pr-workflow)
11. [How to Add a New Test](#how-to-add-a-new-test)
12. [Glossary](#glossary)

---

## Overview

This document describes the full end-to-end automated test suite for the Frndly TV web application (`watch.frndlytv.com`). The suite covers:

| Coverage Area | Test Type |
|---|---|
| Home page content rows (19 rows) | Regression — TTFF per row |
| Core user journey (login → play → sign out) | Smoke E2E |
| Live Now row & random trending row | Smoke TTFF |
| Home screen load performance | Performance |
| Carousel CTA load time | Performance |
| Row scroll lag (vertical) | Performance |
| In-row horizontal scroll lag | Performance |
| Tile load time | Performance |
| Closed captions — single video | Functional |
| Closed captions — every guide channel | Functional (long-running) |

---

## Why We Migrated to Playwright

The original stack used **Java 17 + Selenium 4 + TestNG + LambdaTest**. Key pain points that drove the migration:

| Java / Selenium / LambdaTest | Playwright / TypeScript / GitHub Actions |
|---|---|
| Manual `WebDriverWait` loops everywhere for Angular lazy loading | Auto-wait built in — no explicit waits in most cases |
| `typeAngular()` workaround required for every login input | Same workaround isolated to login only |
| LambdaTest costs money; 1 parallel session on free tier | GitHub Actions free tier; up to 4 parallel workers |
| Monte Screen Recorder — manual setup, separate process | `video: 'on'` in config — zero setup, automatic per test |
| HTML report required Extent Reports library | `reporter: 'html'` built in, with screenshots, videos, and traces |
| Sessions killed after long runs | Each test is fully isolated — no shared session state |
| Non-existent rows waste 25 s scrolling before failing | Graceful `test.skip()` — no time wasted on missing content |

The Java project remains untouched in the repo root. All new development is in `playwright/`.

---

## Tech Stack

| Technology | Version | Role |
|---|---|---|
| Playwright | 1.44+ | Browser automation + test runner |
| TypeScript | 5.4+ | Language |
| Node.js | 20+ | Runtime |
| Google Chrome | Latest | Primary browser (Widevine DRM for VOD) |
| GitHub Actions | — | Free CI grid |
| dotenv | 16+ | Local `.env` variable loading |

> **Why Google Chrome specifically?** Playwright's default Chromium build does not include the Widevine DRM plugin. Using `channel: 'chrome'` picks up the user-installed Chrome binary which has Widevine, enabling VOD playback in tests.

---

## Repository Layout

```
FrndlyTestUI/
├── src/                            ← Legacy Java/Selenium/TestNG (untouched)
│   └── main/java/com/automation/
├── playwright/                     ← Active development
│   ├── playwright.config.ts        # Suite config: projects, workers, timeouts, artifacts
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example                # Template — copy to .env, never commit real values
│   ├── .env                        # Gitignored — local credentials
│   ├── .auth/
│   │   └── user.json               # Saved login session (created by auth.setup.ts)
│   ├── pages/
│   │   ├── BasePage.ts             # Shared helpers: typeAngular, jsClick, scrollPage
│   │   ├── FrndlyLoginPage.ts      # 3-attempt login with Angular form handling
│   │   ├── DashboardPage.ts        # findRowSection, clickCardAtIndexInRow, getRowNames
│   │   ├── PlayerPage.ts           # waitForVideoToStart — TTFF measurement + DRM detection
│   │   ├── SettingsPage.ts         # scrollToAndClickSignOut
│   │   └── HomePage.ts             # Landing page (try.frndlytv.com)
│   ├── tests/
│   │   ├── auth.setup.ts           # Login once → save .auth/user.json for all tests
│   │   ├── liveNow.spec.ts         # [smoke] Live Now row TTFF
│   │   ├── trendingMovies.spec.ts  # [smoke] Random eligible row TTFF
│   │   ├── frndlyTV.spec.ts        # [smoke] Full E2E smoke
│   │   ├── homeScreen/
│   │   │   ├── loadTime.spec.ts           # Home page load ≤ 2 s
│   │   │   ├── carouselCtaLoadTime.spec.ts # Carousel CTA click → folio load time
│   │   │   ├── rowScrollLag.spec.ts       # Vertical scroll long-task detection
│   │   │   ├── rowInternalScrollLag.spec.ts # In-row horizontal scroll lag
│   │   │   └── tileLoadTime.spec.ts       # Tile image load time
│   │   ├── player/
│   │   │   ├── closedCaptions.spec.ts     # CC available/off-by-default/toggle on/off
│   │   │   └── guideChannelCC.spec.ts     # CC check on every guide channel (2 h)
│   │   └── rows/                   # [regression] One file per home-page row (19 total)
│   │       ├── recommendedForYou.spec.ts
│   │       ├── blockbusterBoulevard.spec.ts
│   │       └── ... (17 more)
│   └── utils/
│       ├── config.ts               # Typed env var wrapper — throws on missing required vars
│       └── createRowTest.ts        # Factory: registers a standard TTFF test for a row
└── docs/
    └── confluence-automation-overview.md  ← This document
```

---

## Authentication Strategy

All tests that require a logged-in session use **Playwright's `storageState`** feature:

1. **`auth.setup.ts`** runs once before any test suite
2. It logs in via `FrndlyLoginPage` (navigates to `/authenticator`, fills email + password using `typeAngular()`, waits for `/home` redirect)
3. Saves cookies + localStorage to `.auth/user.json`
4. All subsequent tests load this file as `storageState` — they start pre-authenticated with no login overhead

```
auth.setup.ts runs once
  └─► saves .auth/user.json
        ├─► smoke project loads user.json
        ├─► regression project loads user.json
        ├─► homeScreen project loads user.json
        ├─► player project loads user.json
        └─► guideCC project loads user.json
```

> **Security:** `.auth/user.json` is gitignored and never committed. In CI, it is created fresh on every run.

---

## Test Suites

### Smoke Suite

**Project name:** `smoke`  
**Run command:** `npx playwright test --project=smoke`  
**When:** After every deploy or code change. ~2 minutes.

| File | Test name | What it verifies |
|---|---|---|
| `liveNow.spec.ts` | Live Now — first card TTFF | Navigates to Live Now row, clicks card, measures time-to-first-frame, takes screenshot |
| `trendingMovies.spec.ts` | Random row TTFF | Picks a random eligible content row, measures TTFF; skips DRM-blocked rows gracefully |
| `frndlyTV.spec.ts` | E2E smoke | Full journey: login → Continue Watching card → player screenshot → Settings → Sign Out → assert redirect to `/authenticator` |

---

### Regression Suite

**Project name:** `regression`  
**Run command:** `npx playwright test --project=regression`  
**When:** Nightly or on PRs. Each test is independent.

19 tests — one per home-page content row. Every file is 2 lines:

```typescript
import { createRowTest } from '../../utils/createRowTest';
createRowTest('Blockbuster Boulevard');
```

`createRowTest()` registers a standard test that:
1. Navigates to `/home` (pre-authenticated)
2. Scrolls to find the named row — skips if not visible for this account
3. Clicks first card in the row
4. Measures TTFF — attaches result to HTML report Attachments tab
5. Skips gracefully if DRM-blocked
6. Records video for every test (`video: 'on'`)
7. Captures a screenshot of the playing video

**Full row list:**

| Row | File |
|---|---|
| Recommended for You | `recommendedForYou.spec.ts` |
| Blockbuster Boulevard | `blockbusterBoulevard.spec.ts` |
| New Episodes | `newEpisodes.spec.ts` |
| Most Watched | `mostWatched.spec.ts` |
| Staff Picks | `staffPicks.spec.ts` |
| Trending Now | `trendingNow.spec.ts` |
| Watch Again | `watchAgain.spec.ts` |
| Frndly Featured | `frndlyFeatured.spec.ts` |
| Frndly Fan Favorites | `frndlyFanFavorites.spec.ts` |
| Hallmark Holidays | `hallmarkHolidays.spec.ts` |
| Timeless Classics | `timelessClassics.spec.ts` |
| Rom Com | `romCom.spec.ts` |
| History or Mystery | `historyOrMystery.spec.ts` |
| Just Added Movies | `justAddedMovies.spec.ts` |
| Leaving This Month | `leavingThisMonth.spec.ts` |
| My Favorites | `myFavorites.spec.ts` |
| Live Now | `liveNow.spec.ts` |
| History or Mystery | `historyOrMystery.spec.ts` |
| Staff Picks | `staffPicks.spec.ts` |

---

### Home Screen Suite

**Project name:** `homeScreen`  
**Run command:** `npx playwright test --project=homeScreen`  
**When:** Performance regression checks.

| File | Test name | SLA / Threshold |
|---|---|---|
| `loadTime.spec.ts` | Home Screen / Performance / Load time does not exceed 2 seconds | ≤ 2,000 ms from `page.goto` until `HOME` nav link is visible |
| `carouselCtaLoadTime.spec.ts` | Home Screen / Performance / Carousel CTA load time | Clicks first visible carousel button, measures folio render time |
| `rowScrollLag.spec.ts` | Home Screen / Performance / Navigate between rows — no visual lag | Scrolls home page top-to-bottom; detects main-thread long tasks > 300 ms via `PerformanceObserver` |
| `rowInternalScrollLag.spec.ts` | Home Screen / Performance / Navigate within rows — no visual lag | Horizontal scroll within the first row with multiple cards; detects long tasks > 300 ms |
| `tileLoadTime.spec.ts` | Home Screen / Performance / Tile load time | Measures time for tile images to fully load in the first content row |

**Long Task detection** (used by scroll lag tests):

```javascript
new PerformanceObserver(list => {
  list.getEntries().forEach(entry => {
    if (entry.duration > 300) lagDetected = true;
  });
}).observe({ entryTypes: ['longtask'] });
```

A long task is any main-thread block > 50 ms (browser definition). The tests flag blocks > 300 ms as visible lag.

---

### Player Suite

**Project name:** `player`  
**Run command:** `npx playwright test --project=player`  
**When:** On demand or nightly.

#### `closedCaptions.spec.ts` — CC toggle functional test

Tests the complete CC workflow on a single piece of content:

| Step | Assertion |
|---|---|
| Navigate to home, click first carousel card | Video starts playing |
| Check `HTMLVideoElement.textTracks` | CC tracks available |
| Check default state | CC is **OFF** by default |
| Click CC button in player controls | CC mode becomes `'showing'` |
| Click CC button again | CC mode returns to `'hidden'` |

**Skip conditions** (not failures):
- No visible carousel card
- Video did not start within 60 s (DRM / server issue)
- Content has no caption or subtitle tracks
- No CC button found in player controls

**CC button detection** (15 selectors tried in order):
```
button[aria-label*="caption" i]
button[aria-label*="subtitle" i]
button[aria-label="CC"]
button[title*="caption" i]
.vjs-captions-button
[data-testid*="caption" i]
... (15 total)
```

---

### Guide CC Suite

**Project name:** `guideCC`  
**Run command:** `npx playwright test --project=guideCC`  
**Timeout:** 2 hours  
**When:** Weekly or on demand. Long-running.

Tests that **every channel in the TV Guide has closed captions available**.

**Flow per channel:**
1. Navigate to the channel's page (`/partner/channel_slug`)
2. Click the Watch button (folio)
3. Wait 25 seconds of live playback
4. Check `HTMLVideoElement.textTracks` for caption/subtitle tracks
5. If tracks are present but CC is off, click the CC button to enable it
6. Assert CC mode is `'showing'`

**Results report** — attached to the HTML report and saved to `run_results/guide-cc-*.txt`:

```
Guide CC Test — 2025-01-15T10:30:00Z
Total channels: 70
CC active ✅ : 68
CC not active ❌: 1
No CC tracks : 1
Skipped      : 0
```

**Channel discovery strategy:**
The guide (`/guide`) renders channel rows as empty `div.channel_img` divs (CSS background-image logos). Channel names appear as `<a>` links for a featured set (6 channels), with the remaining 64 channels using Angular dynamic click bindings. The test uses a multi-strategy approach to collect all channel navigation URLs.

> **Status as of April 2026:** Channel URL discovery is actively being refined. Currently finding 6/70 channels via `<a>` DOM links. Investigation into Angular component state and CSS background-image URL patterns is ongoing.

---

## CI / GitHub Actions

**Workflow file:** `.github/workflows/playwright.yml`

### Triggers

```yaml
on:
  push:
    branches: [main, feature/playwright-web-suite]
  pull_request:
  workflow_dispatch:   # manual trigger from Actions tab
```

### Jobs

| Job | Timeout | Project | Runs |
|---|---|---|---|
| `setup` | 5 min | Auth setup | Every trigger |
| `smoke` | 20 min | `smoke` | Every trigger |
| `regression` | 45 min | `regression` | Every trigger |
| `home-screen` | 20 min | `homeScreen` | Every trigger |
| `player` | 20 min | `player` | Every trigger |
| `guide-cc` | 120 min | `guideCC` | Every trigger |

### Artifacts

After every run, two artifacts are uploaded (always, even on failure):

| Artifact | Contents | Retention |
|---|---|---|
| `playwright-report` | Full HTML report — videos, screenshots, traces, TTFF attachments | 30 days |
| `test-results` | Raw videos and traces | 7 days |

Download from: **GitHub → Actions → [run] → Artifacts section**

### Suite naming in GitHub Actions UI

Tests appear in the Actions summary under a hierarchy using `/` as the separator:

```
Home Screen / Performance / Load time does not exceed 2 seconds
Player / Closed Captions / CC is available, off by default, and can be toggled on and off
Guide / Closed Captions / Every guide channel has closed captions
Regression / Live Now / First card plays within timeout
```

---

## Configuration & Secrets

### Environment variables

All config flows through `playwright/utils/config.ts`, which reads `process.env`. Locally, values come from `playwright/.env` (gitignored). In CI, they are injected as GitHub Actions secrets.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `BASE_URL` | No | `https://try.frndlytv.com` | Landing / login page URL |
| `WATCH_URL` | Yes | — | `https://watch.frndlytv.com` |
| `USERNAME` | Yes | — | Test account email address |
| `PASSWORD` | Yes | — | Test account password |
| `VIDEO_PLAY_SECONDS` | No | `25` | Seconds to let video play before CC/screenshot check |
| `VIDEO_TIMEOUT_SECONDS` | No | `30` | Max seconds to wait for video to start (TTFF budget) |

### GitHub Actions secrets

Set in: **GitHub repo → Settings → Secrets and variables → Actions**

| Secret name | Maps to |
|---|---|
| `FRNDLY_USERNAME` | `USERNAME` |
| `FRNDLY_PASSWORD` | `PASSWORD` |
| `BASE_URL` | `BASE_URL` |
| `WATCH_URL` | `WATCH_URL` |

### Local setup

```bash
# From repo root
cd playwright
npm install
npx playwright install chromium

# Create local .env (never committed)
cp .env.example .env
# Edit .env with your test account credentials
```

---

## Page Objects

All page objects extend `BasePage` and live in `playwright/pages/`.

### `BasePage`

Foundation class shared by all page objects.

| Method | Signature | Purpose |
|---|---|---|
| `typeAngular` | `(locator, value)` | Uses JS native setter to trigger Angular reactive form validators — required for email/password inputs |
| `jsClick` | `(locator)` | Dispatches `MouseEvent` via `evaluate()` — bypasses Playwright visibility check for lazy-loaded or off-screen cards |
| `takeScreenshot` | `(name)` | Saves `screenshots/<name>-<timestamp>.png` |
| `scrollPageToLoadAllRows` | `()` | Scrolls 600 px per step until `document.scrollHeight` stops growing |

### `FrndlyLoginPage`

Navigates to `/authenticator`. 3-attempt retry loop. Uses `typeAngular()` for email + password. Waits up to 60 s for Angular router to redirect to `/home`.

### `DashboardPage`

| Method | Purpose |
|---|---|
| `findRowSection(rowName)` | Scroll-and-poll for `h3.ott_tray_title` text match; returns `.sec_slider` locator |
| `getCardCountInRow(rowName)` | Counts `.sheet_poster, .roller_poster` elements in row |
| `clickCardAtIndexInRow(rowName, index)` | Scroll into view → jsClick → return `PlayerPage` |
| `getRowNames()` | Full-page scroll → collect all `h3.ott_tray_title` text values |

### `PlayerPage`

| Method | Return | Purpose |
|---|---|---|
| `waitForVideoToStart(timeoutSeconds)` | ms / `-1` / `-2` | TTFF in ms; `-1` = timeout; `-2` = DRM blocked |
| `captureScreenshot(name)` | path | Waits `VIDEO_PLAY_SECONDS`, then screenshots player |
| `clickClose()` | `DashboardPage` | `page.goBack()` → waits for `/home` |
| `isVideoPlaying()` | boolean | `!paused && currentTime > 0` snapshot check |

> **DRM note:** Widevine VOD content may not decrypt in CI. `waitForVideoToStart` detects `DRM_NO_KEY_SYSTEM` in the page and returns `-2`. Tests skip (not fail) on DRM blocks.

### `SettingsPage`

`scrollToAndClickSignOut()` — scrolls to the sign-out button and clicks it. Waits for redirect to `/authenticator`.

### `HomePage`

`clickLogin()` — returns `FrndlyLoginPage`. Used by the explicit login E2E smoke test.

---

## Branch & PR Workflow

All new Playwright work is developed on:

```
feature/playwright-web-suite
```

Merges to `main` are done via Pull Request. GitHub Actions runs the full suite on push to both branches and on PRs.

```
feature/playwright-web-suite  ──PR──►  main
        │                                │
        └── CI runs on push              └── CI runs on merge
```

> **Do not push directly to `main`.** All changes go through a PR so the full suite runs as a gate.

---

## How to Add a New Test

### New regression row test (2 lines)

```typescript
// playwright/tests/rows/myNewRow.spec.ts
import { createRowTest } from '../../utils/createRowTest';
createRowTest('My New Row Name');
```

The `regression` project `testMatch` already picks up `tests/rows/**/*.spec.ts` — no config changes needed.

### New Home Screen performance test

1. Create `playwright/tests/homeScreen/myPerf.spec.ts`
2. Use `test.describe('Home Screen', () => { test.describe('Performance', () => { ... }) })`
3. The `homeScreen` project picks it up automatically via `testMatch: /\/homeScreen\/.*\.spec\.ts/`

### New smoke test

1. Create your spec file
2. Add the filename to the `testMatch` regex in the `smoke` project in `playwright.config.ts`

### New Player functional test

1. Create `playwright/tests/player/myPlayerTest.spec.ts`
2. Add the filename to the `testMatch` regex in the `player` project in `playwright.config.ts`

### Finding the right selector

1. Open `watch.frndlytv.com` in Chrome (logged in)
2. Right-click the element → **Inspect**
3. Test your selector in the DevTools console:
   ```javascript
   document.querySelectorAll('button[aria-label*="caption"]')
   ```
4. Prefer `aria-label`, `[class*="fragment"]`, or `[data-testid]` over brittle XPath

### Angular-specific tips

| Scenario | What to do |
|---|---|
| Login form inputs | Use `typeAngular()` — Angular reactive forms need the native JS setter |
| Lazy-loaded cards | Use `jsClick()` — cards may be `display:none` until scrolled into view |
| Angular router navigation | Use `page.waitForURL('**/target-path')` not `waitForNavigation` |
| Post-playback navigation | Always call `navigateHome()` after a video plays — Angular can get stuck after VOD |
| Slick slider cards | Scope to `.slick-active:not(.slick-cloned)` to avoid off-screen duplicate slides |

---

## Glossary

| Term | Definition |
|---|---|
| **TTFF** | Time-to-first-frame — milliseconds from card click until `video.currentTime > 0` |
| **DRM** | Digital Rights Management (Widevine) — VOD content requires a valid CDM; CI headless Chrome may lack it |
| **storageState** | Playwright's mechanism for saving and restoring browser session (cookies + localStorage) |
| **`createRowTest()`** | Factory function that generates a standard TTFF regression test for a named home-page row |
| **Long Task** | Browser event > 50 ms that blocks the main thread — anything > 300 ms is flagged as visible lag |
| **folio** | The detail/info overlay that some content cards open before the player (has a Watch Now button) |
| **`channel_img`** | Empty `div` in the TV Guide grid — channel logo rendered as CSS `background-image` |
| **`typeAngular()`** | JavaScript-based input helper that fires the native `input` event, required to trigger Angular form validators |
| **`jsClick()`** | JavaScript `HTMLElement.click()` dispatch via Playwright `evaluate()` — bypasses visibility checks |
| **`video.textTracks`** | Browser API for subtitle/caption tracks on a video element; `mode === 'showing'` means CC is active |

---

*Last updated: April 2026*  
*Suite version: Playwright 1.44 + TypeScript 5.4 + Angular 11 (target app)*
