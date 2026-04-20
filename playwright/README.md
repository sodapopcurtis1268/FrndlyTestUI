# Frndly TV — Playwright Test Suite

End-to-end UI tests and performance measurements for [watch.frndlytv.com](https://watch.frndlytv.com), built with **Playwright + TypeScript** and executed on **GitHub Actions** (free).

This suite lives alongside the legacy Java/Selenium stack in the repo root. Both target the same application — Playwright is the active development path.

---

## Table of Contents

1. [Why Playwright](#why-playwright)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Setup](#setup)
6. [Configuration](#configuration)
7. [Running Tests](#running-tests)
8. [Test Suites](#test-suites)
9. [Test Files Reference](#test-files-reference)
10. [TTFF Measurement](#ttff-measurement)
11. [Videos & Screenshots](#videos--screenshots)
12. [GitHub Actions CI](#github-actions-ci)
13. [Page Objects Reference](#page-objects-reference)
14. [Adding New Tests](#adding-new-tests)

---

## Why Playwright

| Java / Selenium / LambdaTest | Playwright / TypeScript / GitHub Actions |
|---|---|
| Manual `WebDriverWait` loops for Angular | Auto-wait built in — no explicit waits needed |
| `typeAngular()` workaround still required | Same workaround, but isolated to login only |
| LambdaTest costs money, 1 session on free tier | GitHub Actions free tier, 4 parallel workers |
| Monte Screen Recorder — manual setup | `video: 'on'` in config — automatic per test |
| HTML report requires Extent Reports library | `reporter: 'html'` built in, with video + trace |
| Session killed after long runs | Each test is isolated — no shared session state |
| Rows that don't exist waste 25 s scrolling | Graceful skip — no time wasted |

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Playwright | 1.44+ | Browser automation + test runner |
| TypeScript | 5.4+ | Language |
| Node.js | 20+ | Runtime |
| GitHub Actions | — | CI / free test grid |
| dotenv | 16+ | Local `.env` loading |

---

## Project Structure

```
playwright/
├── playwright.config.ts        # Suite config: projects, workers, timeouts, artifacts
├── package.json
├── tsconfig.json
├── .env.example                # Template — copy to .env and fill in real values
├── .env                        # Gitignored — local credentials only
├── .gitignore
├── .npmrc                      # Forces public npm registry (avoids corporate Artifactory)
├── .auth/                      # Gitignored — saved login session (storageState)
│   └── user.json               # Created by auth.setup.ts on first run
├── pages/
│   ├── BasePage.ts             # typeAngular(), jsClick(), scrollPageToLoadAllRows()
│   ├── FrndlyLoginPage.ts      # Navigates to /authenticator, 3-attempt login retry
│   ├── DashboardPage.ts        # findRowSection(), clickCardAtIndexInRow(), getRowNames()
│   ├── PlayerPage.ts           # waitForVideoToStart() — TTFF measurement + DRM detection
│   ├── SettingsPage.ts         # scrollToAndClickSignOut()
│   └── HomePage.ts             # Landing page (try.frndlytv.com)
├── tests/
│   ├── auth.setup.ts           # Logs in once, saves .auth/user.json for all tests
│   ├── liveNow.spec.ts         # [smoke] Single row TTFF — fastest sanity check
│   ├── trendingMovies.spec.ts  # [smoke] Random eligible row TTFF (retries on DRM)
│   ├── frndlyTV.spec.ts        # [smoke] Full E2E: login → play → settings → sign out
│   └── rows/                   # [regression] One file per home-page row
│       ├── recommendedForYou.spec.ts
│       ├── blockbusterBoulevard.spec.ts
│       ├── newEpisodes.spec.ts
│       └── ... (19 total)
└── utils/
    ├── config.ts               # Typed env var wrapper — throws on missing required vars
    └── createRowTest.ts        # Factory: registers a standard @regression TTFF test for a row
```

---

## Prerequisites

- **Node.js 20+** — `brew install node`
- **npm 10+** — bundled with Node.js

---

## Setup

```bash
# 1. Clone the repo
git clone https://github.com/sodapopcurtis1268/FrndlyTestUI.git
cd FrndlyTestUI/playwright

# 2. Install dependencies
npm install

# 3. Install Playwright browser
npx playwright install chromium

# 4. Create your local .env (gitignored — never committed)
cp .env.example .env
```

Then edit `.env` with your values:

```env
BASE_URL=https://try.frndlytv.com
WATCH_URL=https://watch.frndlytv.com
USERNAME=your@email.com
PASSWORD=yourpassword
VIDEO_PLAY_SECONDS=5
VIDEO_TIMEOUT_SECONDS=30
```

---

## Configuration

All settings flow through `utils/config.ts`, which reads `process.env`. Values come from `.env` locally and from **GitHub Actions secrets** in CI.

| Variable | Default | Purpose |
|---|---|---|
| `BASE_URL` | `https://try.frndlytv.com` | Landing page URL |
| `WATCH_URL` | — | Required — `https://watch.frndlytv.com` |
| `USERNAME` | — | Required — test account email |
| `PASSWORD` | — | Required — test account password |
| `VIDEO_PLAY_SECONDS` | `5` | Seconds to let video play before screenshot |
| `VIDEO_TIMEOUT_SECONDS` | `30` | Max seconds to wait for video to start (TTFF threshold) |

---

## Running Tests

All commands must be run from inside the `playwright/` directory:

```bash
cd playwright
```

### Run a specific suite

```bash
# Smoke — 3 fast tests, ~2 min
npx playwright test --project=smoke

# Regression — 80 tests, ~20 min with 4 workers
npx playwright test --project=regression

# Everything
npx playwright test
```

### Run by tag

```bash
npx playwright test --grep @smoke
npx playwright test --grep @regression
```

### Run a single test file

```bash
npx playwright test liveNow
npx playwright test frndlyTV
npx playwright test assetPlayback
```

### Headed mode (watch the browser)

```bash
npx playwright test liveNow --headed
npx playwright test --project=smoke --headed
```

### View the HTML report

```bash
npx playwright show-report
# Opens http://localhost:9323
# If port is busy: npx playwright show-report --port 9324
```

---

## Test Suites

### Smoke (`--project=smoke`) — 3 tests

Run after every deploy or code change. Completes in under 2 minutes.

| Test file | What it does |
|---|---|
| `liveNow.spec.ts` | Clicks the first card in **Live Now**, measures TTFF, records video |
| `trendingMovies.spec.ts` | Picks a random eligible row, measures TTFF |
| `frndlyTV.spec.ts` | Full E2E: login → Continue Watching → Settings → Sign Out |

### Regression (`--project=regression`) — 19 tests

One test per home-page row. Run nightly or on PRs. Each test is fully independent — no shared state, easy to run individually.

| Test file | What it does |
|---|---|
| `rows/liveNow.spec.ts` | First card in **Live Now** — TTFF + video |
| `rows/recommendedForYou.spec.ts` | First card in **Recommended for You** |
| `rows/blockbusterBoulevard.spec.ts` | First card in **Blockbuster Boulevard** |
| … (19 total) | One file per row, all generated by `createRowTest()` |

Run a single row:
```bash
npx playwright test --project=regression blockbusterBoulevard
```

---

## Test Files Reference

### `auth.setup.ts`

Runs once before any test suite. Logs in and saves browser cookies + localStorage to `.auth/user.json`. All downstream tests load this file as `storageState` so they start already authenticated — no login per test.

### `liveNow.spec.ts` — `@smoke`

The simplest, most focused test:
1. Navigate to `/home` (pre-authenticated)
2. Find the **Live Now** row
3. Click the first card
4. Measure TTFF — time from click until `video.currentTime > 0`
5. Attach TTFF to the HTML report's **Attachments** tab
6. Capture a screenshot of the playing video

### `trendingMovies.spec.ts` — `@smoke`

1. Scroll the full home page to load all rows
2. Filter out non-content rows (Browse By Genre, Coming Soon, My Recordings, etc.)
3. Pick up to 3 random eligible rows (shuffled)
4. For each candidate: click the first card, measure TTFF
5. If DRM-blocked (`DRM_NO_KEY_SYSTEM`), try the next candidate row
6. Assert TTFF ≤ `VIDEO_TIMEOUT_SECONDS` for the first non-DRM row; skip gracefully if all candidates are DRM-blocked

### `frndlyTV.spec.ts` — `@smoke`

Full E2E smoke covering the core authenticated user journey:
1. Login via `/authenticator` (explicit — verifies the login form works)
2. Click the first **Continue Watching** card
3. Capture a screenshot of the player
4. Navigate back → open **Settings**
5. Click **Sign Out** → assert redirect to `/authenticator`

### `tests/rows/*.spec.ts` — `@regression`

19 atomic tests, one per home-page row. Each 2-line spec file calls `createRowTest(rowName)` which:
1. Navigates to `/home` (pre-authenticated via storageState)
2. Finds the named row — skips gracefully if the row isn't visible for this account
3. Clicks the first card
4. Measures TTFF — attaches it to the HTML report's **Attachments** tab
5. If DRM-blocked, skips with a descriptive message instead of failing
6. Records the full test on video (regression project has `video: 'on'`)
7. Captures a screenshot of the playing video

**To add a new row test**, create `tests/rows/myRow.spec.ts`:
```typescript
import { createRowTest } from '../../utils/createRowTest';
createRowTest('My Row Name');
```

---

## TTFF Measurement

**Time-to-first-frame (TTFF)** = milliseconds from when the card was clicked until the video element is actually playing.

Detection logic (`PlayerPage.waitForVideoToStart`):

```
VOD  → video.currentTime > 0  AND  video.readyState >= 3  (HAVE_FUTURE_DATA)
Live → !video.paused  AND  !video.ended  AND  video.readyState >= 2  (HAVE_CURRENT_DATA)
```

Polls every 500 ms. Also retries detail-page play buttons every 5 s in case the card opened a detail page instead of playing directly.

**Where to see TTFF in the report:**

1. Run `npx playwright show-report`
2. Click any `assetPlayback` or `liveNow` test
3. Open the **Attachments** tab → `time-to-first-frame`

---

## Videos & Screenshots

### Videos

- **Smoke tests** — `video: 'retain-on-failure'` (default): saved only when a test fails
- **`assetPlayback.spec.ts`** — `video: 'on'`: recorded for every test regardless of outcome
- **`liveNow.spec.ts`** — `video: 'on'`: recorded for every run

Videos are stored in `test-results/` (gitignored) and attached to the Playwright HTML report.

### Screenshots

Saved to `playwright/screenshots/` (gitignored). Filename format:

```
<label>-<timestamp-ms>.png
live-now-card0-1776638440424.png
```

The HTML report also captures screenshots automatically on failure (`screenshot: 'only-on-failure'`).

---

## GitHub Actions CI

Tests run automatically on every push to `main` and can be triggered manually from the **Actions** tab.

### Workflow file

`.github/workflows/playwright.yml`

```
push to main → auth.setup runs once → smoke + regression run in parallel (4 workers)
```

### Secrets required

Set these in **GitHub → Settings → Secrets → Actions**:

| Secret | Value |
|---|---|
| `FRNDLY_USERNAME` | Test account email |
| `FRNDLY_PASSWORD` | Test account password |
| `BASE_URL` | `https://try.frndlytv.com` |
| `WATCH_URL` | `https://watch.frndlytv.com` |

### Artifacts

After each run, two artifacts are uploaded:

| Artifact | Contents | Retention |
|---|---|---|
| `playwright-report` | Full HTML report with videos, screenshots, traces, TTFF | 30 days |
| `test-results` | Raw videos and traces (on failure) | 7 days |

Download from **Actions → [run] → Artifacts**.

---

## Page Objects Reference

All page objects extend `BasePage` and live in `playwright/pages/`.

### `BasePage`

| Method | Purpose |
|---|---|
| `typeAngular(locator, value)` | JS native setter — required for Angular reactive form fields (email/password) |
| `jsClick(locator)` | `HTMLElement.click()` — bypasses Playwright's visibility check for lazy-loaded cards while still triggering Angular router navigation |
| `takeScreenshot(name)` | Saves to `screenshots/<name>-<timestamp>.png` |
| `scrollPageToLoadAllRows()` | 600 px increments until scroll height stops growing |

### `FrndlyLoginPage`

Navigates directly to `/authenticator` (more reliable than clicking the landing page button). 3-attempt retry loop with `typeAngular()` for both fields. Waits up to 60 s for `/home` redirect.

### `DashboardPage`

| Method | Purpose |
|---|---|
| `findRowSection(rowName)` | Scroll-and-poll for `h3.ott_tray_title` textContent match — returns `.sec_slider` locator |
| `getCardCountInRow(rowName)` | Count `.sheet_poster, .roller_poster` elements in the row |
| `clickCardAtIndexInRow(rowName, index)` | Scroll card into view, jsClick, return `PlayerPage` |
| `clickFirstCardInRow(rowName)` | Shorthand for index 0 |
| `getRowNames()` | Full-page scroll then collect all `h3.ott_tray_title` text values |

### `PlayerPage`

| Method | Return | Purpose |
|---|---|---|
| `waitForVideoToStart(timeoutSeconds)` | ms / `-1` / `-2` | TTFF, or -1 on timeout, or -2 if DRM blocked |
| `captureScreenshot(name)` | path | Waits `VIDEO_PLAY_SECONDS`, then screenshots |
| `clickClose()` | `DashboardPage` | `page.goBack()` → waits for `/home` |
| `isVideoPlaying()` | boolean | Snapshot check — `!paused && currentTime > 0` |

**DRM / Widevine note:** VOD content on Frndly TV uses Widevine DRM. Playwright's Chromium does not include the Widevine CDM, and even with `channel: 'chrome'` a valid license server response may not be available in a CI environment. When DRM is detected (`DRM_NO_KEY_SYSTEM` in the page body), `waitForVideoToStart` returns `-2` and tests skip rather than fail.

---

## Adding New Tests

### New single-row regression test

Create `tests/rows/myRow.spec.ts` (2 lines):
```typescript
import { createRowTest } from '../../utils/createRowTest';
createRowTest('My Row Name');
```

The `regression` project already matches `tests/rows/**/*.spec.ts` — no config changes needed.

### New smoke row test (like `liveNow.spec.ts`)

1. Copy `tests/liveNow.spec.ts`
2. Change `ROW_NAME` to your target row
3. Add the filename to the `testMatch` in the `smoke` project in `playwright.config.ts`

### New page object

1. Create `pages/MyPage.ts` extending `BasePage`
2. Use `page.locator()` for element queries
3. Return the next page object from navigation methods

```typescript
import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class MyPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async clickMyButton(): Promise<void> {
    await this.jsClick(this.page.locator('button.my-btn'));
  }
}
```

### Finding the right locator

1. Open the page in Chrome (logged in)
2. Right-click the element → **Inspect**
3. In DevTools console, test your selector:
   ```javascript
   document.querySelectorAll('button[class*="watch"]')
   ```
4. Use `page.locator()` in your page object — prefer `aria-label`, `[class*='fragment']`, or `[data-*]` attributes over brittle XPath

### Angular-specific tips

- **Form fields** — use `typeAngular()` not `page.fill()` for login inputs (Angular reactive forms need the native setter to trigger validators)
- **Lazy-loaded cards** — use `jsClick()` not `locator.click()` — cards may be `display:none` until scrolled into viewport
- **Post-playback navigation** — always `navigateHome()` after a video plays; Angular can get stuck after VOD playback
