# FrndlyTestUI — Selenium + TestNG Automation Framework

End-to-end UI test automation for [watch.frndlytv.com](https://watch.frndlytv.com), built with Java 17, Selenium 4, and TestNG. Tests run locally against Chrome/Firefox/Edge or remotely on **LambdaTest's Selenium Grid** with a single config flag.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Prerequisites](#prerequisites)
4. [Setup](#setup)
5. [Configuration](#configuration)
6. [Running Tests Locally](#running-tests-locally)
7. [Running Tests on LambdaTest](#running-tests-on-lambdatest)
8. [Test Suite Overview](#test-suite-overview)
9. [Framework Architecture](#framework-architecture)
10. [Logging](#logging)
11. [Screenshots](#screenshots)
12. [Adding New Tests](#adding-new-tests)

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Java | 17 | Language |
| Selenium WebDriver | 4.18.1 | Browser automation |
| TestNG | 7.9.0 | Test runner & assertions |
| WebDriverManager | 5.7.0 | Auto browser driver management |
| Log4j 2 | 2.23.1 | Structured logging |
| Extent Reports | 5.1.1 | HTML test reports |
| Maven | 3.9+ | Build & dependency management |

---

## Project Structure

```
Claude-test-automation/
├── src/
│   ├── main/
│   │   ├── java/com/automation/
│   │   │   ├── config/
│   │   │   │   └── ConfigReader.java        # Reads config.properties; all typed accessors
│   │   │   ├── pages/
│   │   │   │   ├── BasePage.java            # Abstract base: click, type, screenshot helpers
│   │   │   │   ├── HomePage.java            # try.frndlytv.com marketing landing page
│   │   │   │   ├── FrndlyLoginPage.java     # Angular-aware login form
│   │   │   │   ├── DashboardPage.java       # watch.frndlytv.com/home — row & card navigation
│   │   │   │   ├── PlayerPage.java          # Video player page
│   │   │   │   ├── GuidePage.java           # /guide — channel grid, prev/next/now navigation
│   │   │   │   ├── MoviesPage.java          # /movies — genre filter + card grid
│   │   │   │   ├── TvSeriesPage.java        # /tv_tv_series — genre filter + series cards
│   │   │   │   ├── MyRecordingsPage.java    # /my_recording — DVR recordings list
│   │   │   │   ├── AddOnsPage.java          # /add-ons — optional channel packages
│   │   │   │   ├── SettingsPage.java        # /settings — full account/subscription/device mgmt
│   │   │   │   └── LoginPage.java           # Generic login page (non-Angular)
│   │   │   └── utils/
│   │   │       ├── DriverFactory.java       # ThreadLocal WebDriver; local + LambdaTest remote
│   │   │       └── WaitUtils.java           # Explicit wait helpers
│   │   └── resources/
│   │       ├── config.properties            # ← gitignored; copy from .template and fill in
│   │       ├── config.properties.template   # Safe-to-commit template with placeholder values
│   │       └── log4j2.xml                   # Logging config (console + rolling file)
│   └── test/
│       ├── java/com/automation/
│       │   ├── base/
│       │   │   └── BaseTest.java            # @BeforeMethod/@AfterMethod driver lifecycle
│       │   └── tests/
│       │       ├── LoginTest.java           # Positive/negative login validation
│       │       ├── FrndlyTVTest.java        # Full E2E: login → play → settings → sign out
│       │       ├── HomePageRowsTest.java    # Clicks first card in each of 20 home-page rows
│       │       ├── AssetPlaybackTest.java   # First 3 + last 3 cards per row, 5 s playback
│       │       └── DiagnosticTest.java      # DOM inspection / debug utilities
│       └── resources/
│           └── testng.xml                   # Suite definition & parallel execution config
├── logs/                                    # Created at runtime — Log4j rolling log files
├── screenshots/                             # Created at runtime — PNG captures per test
└── pom.xml
```

---

## Prerequisites

- **Java 17** — install via Homebrew: `brew install openjdk@17`
- **Maven 3.9+** — install via Homebrew: `brew install maven`
- **Chrome** (or Firefox/Edge) for local runs
- A **LambdaTest account** for remote grid runs (free tier works)

### macOS — make Java 17 visible system-wide

After installing via Homebrew, symlink it so IntelliJ and `/usr/libexec/java_home` can find it:

```bash
sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk \
    /Library/Java/JavaVirtualMachines/openjdk-17.jdk
```

Verify:
```bash
/usr/libexec/java_home -V
# Should list: 17.0.x (arm64) "Homebrew" - "OpenJDK 17.x"
```

---

## Setup

```bash
git clone https://github.com/sodapopcurtis1268/FrndlyTestUI.git
cd FrndlyTestUI

# Create your local config (gitignored — never committed)
cp src/main/resources/config.properties.template \
   src/main/resources/config.properties
```

Then edit `config.properties` and fill in your values (see [Configuration](#configuration) below).

---

## Configuration

All runtime settings live in `src/main/resources/config.properties`.

```properties
# ── Local browser ─────────────────────────────────────────────────────────────
browser=chrome          # chrome | firefox | edge
headless=false          # true = no visible window

# ── Application ───────────────────────────────────────────────────────────────
base.url=https://try.frndlytv.com

# ── Timeouts (seconds) ────────────────────────────────────────────────────────
implicit.wait=10
explicit.wait=20

# ── Test account credentials ──────────────────────────────────────────────────
username=your_email@example.com
password=your_password

# ── LambdaTest (leave lt.enabled=false for local runs) ───────────────────────
lt.enabled=false
lt.username=YOUR_LT_USERNAME
lt.accesskey=YOUR_LT_ACCESS_KEY
lt.browser.version=latest
lt.platform=Windows 10
lt.build=Frndly TV Automation
```

Any key can also be overridden on the Maven command line with `-Dkey=value`:

```bash
mvn test -Dbrowser=firefox -Dheadless=true
mvn test -Dlt.enabled=true -Dlt.username=myuser -Dlt.accesskey=mykey
```

---

## Running Tests Locally

```bash
# Full suite (all 4 test groups)
mvn test

# Single test class
mvn test -Dtest=AssetPlaybackTest

# Headless Chrome
mvn test -Dheadless=true

# Firefox instead of Chrome
mvn test -Dbrowser=firefox
```

Test results are written to `target/surefire-reports/` and logs to `logs/automation.log`.

---

## Running Tests on LambdaTest

LambdaTest is a cloud Selenium Grid — your tests run on real browsers hosted remotely. No local browser install needed.

### 1. Get your credentials

Log in at [lambdatest.com](https://lambdatest.com) → click your profile → **Profile & Settings**.  
Copy your **Username** and **Access Key**.

### 2. Add credentials to config.properties

```properties
lt.enabled=true
lt.username=your_lt_username
lt.accesskey=your_lt_access_key
```

### 3. (Optional) Customize the target browser/OS

```properties
lt.browser=chrome            # uses the existing browser= key
lt.browser.version=latest    # or a specific version e.g. 120.0
lt.platform=Windows 10       # or macOS Ventura, macOS Sonoma, etc.
lt.build=Frndly TV Automation
```

### 4. Run

```bash
# Single test (recommended for your first LambdaTest run)
mvn test -Dtest=LoginTest -Dlt.enabled=true

# Full suite on LambdaTest
mvn test -Dlt.enabled=true

# Override credentials without editing config.properties
mvn test -Dlt.enabled=true -Dlt.username=myuser -Dlt.accesskey=mykey
```

### 5. View results on the dashboard

Go to [automation.lambdatest.com](https://automation.lambdatest.com) — your session(s) will appear under the build name **"Frndly TV Automation"** with video recordings, screenshots, and logs.

### How it works

When `lt.enabled=true`, `DriverFactory` skips local browser setup and creates a `RemoteWebDriver` that connects to:

```
https://hub.lambdatest.com/wd/hub
```

Capabilities are sent via the W3C `LT:Options` extension, telling LambdaTest which browser, version, and OS to provision.

---

## Test Suite Overview

### `LoginTest`
Basic credential validation against a generic login page. Tests both successful login and error messaging on bad credentials.

### `FrndlyTVTest` — Full E2E Smoke Test
Covers the core authenticated user journey in one browser session:
1. Navigate to `try.frndlytv.com` → click **Log In**
2. Submit credentials via Angular-compatible form fill
3. Click the first asset in **Continue Watching**
4. Capture a player screenshot
5. Close the player → navigate to **Settings**
6. Click **Sign Out** → assert redirect to `/authenticator`

### `HomePageRowsTest`
Iterates all 20 named content rows on the home page, clicks the first card in each, captures a screenshot, and returns to `/home` before moving to the next row. Uses `SoftAssert` so a failure on one row doesn't abort the rest.

### `AssetPlaybackTest` _(most comprehensive)_
For each of 20 home-page rows, tests the **first 3 and last 3 cards**:
- Navigates to `/home` fresh before each card
- Records start time, clicks the card, waits 5 seconds of playback
- Captures a screenshot (filename embeds row name, card index, start timestamp)
- Navigates back to `/home` to stop playback
- Validates the screenshot was saved and is non-empty

Uses `@DataProvider` so each row appears as a separate entry in the TestNG report. Rows not available for the test account (e.g. "My Recordings") are gracefully skipped.

### `DiagnosticTest`
Developer utility tests for DOM inspection — not part of the standard suite. Useful for debugging locators, login flow issues, and Angular rendering behaviour.

---

## Page Objects Reference

Every page extends `BasePage` and is located in `src/main/java/com/automation/pages/`.

| Page Object | URL | Key Capabilities |
|---|---|---|
| `HomePage` | `try.frndlytv.com` | Click Log In button |
| `FrndlyLoginPage` | `/authenticator` | Angular-compatible login form fill |
| `DashboardPage` | `/home` | 20-row tray navigation, scroll-and-poll card clicks |
| `PlayerPage` | `/watch/*` | Playback state, screenshot capture |
| `GuidePage` | `/guide` | Channel grid, prev/next/now buttons, program tiles, filter tabs |
| `MoviesPage` | `/movies` | Genre filter bar, card grid, row-level navigation |
| `TvSeriesPage` | `/tv_tv_series` | Genre filter bar, series cards, row-level navigation |
| `MyRecordingsPage` | `/my_recording` | Recording list, play by index/title, delete with confirmation |
| `AddOnsPage` | `/add-ons` | Package cards, prices, subscribe/manage buttons |
| `SettingsPage` | `/settings` | Account info, plan/billing, payment, notifications, parental controls, video quality, device management, sign out |

### `GuidePage`

The Guide page displays a live TV channel grid with time slots. Key methods:

```java
GuidePage guide = new GuidePage(driver).navigateTo();
guide.clickPrevious();                     // scroll guide backward in time
guide.clickNext();                         // scroll guide forward in time
guide.clickNow();                          // jump back to current time
guide.getChannelCount();                   // number of channel rows visible
guide.getChannelNames();                   // List<String> of channel names
guide.clickChannel("Hallmark");            // click channel by name fragment
guide.getProgramTitles();                  // List<String> of all visible program tiles
guide.clickProgramByTitle("Movie Night");  // click a program tile by title fragment
guide.getCurrentProgramTitle();            // title of the currently airing program tile
guide.clickFilter("Sports");              // click a genre filter tab if available
```

### `MoviesPage` / `TvSeriesPage`

Both pages share identical structure — horizontal tray rows with a genre filter bar at the top.

```java
MoviesPage movies = new MoviesPage(driver).navigateTo();
movies.getFilterNames();                   // ["All", "Action", "Comedy", ...]
movies.clickFilter("Drama");              // filter and wait for re-render
movies.getActiveFilter();                 // currently selected filter label
movies.getMovieCardCount();               // total cards rendered (lazy-loaded so far)
movies.getRowHeadings();                  // ["New Releases", "Popular", ...]
movies.clickMovieAtIndex(0);              // click first card → returns PlayerPage
movies.clickFirstCardInRow("Popular");    // scroll to row, click its first card
```

`TvSeriesPage` is identical — replace `clickMovieAtIndex` with `clickSeriesAtIndex` and `getMovieCardCount` with `getSeriesCardCount`.

### `MyRecordingsPage`

```java
MyRecordingsPage rec = new MyRecordingsPage(driver).navigateTo();
if (rec.hasRecordings()) {
    rec.getRecordingTitles();              // List<String> of saved recording names
    rec.playRecordingAtIndex(0);           // click first recording → PlayerPage
    rec.playRecordingByTitle("News");      // find and play by title fragment
    rec.deleteRecordingAtIndex(0);         // click delete + confirm dialog
    rec.cancelDeletion();                  // click cancel in confirm dialog
}
String msg = rec.getEmptyStateText();     // null if recordings exist
```

### `AddOnsPage`

```java
AddOnsPage addOns = new AddOnsPage(driver).navigateTo();
addOns.getAddOnCount();                    // number of package cards
addOns.getAddOnNames();                    // ["Sports Plus", "DVR Upgrade", ...]
addOns.getAddOnPrices();                   // ["$4.99/mo", "$9.99/mo", ...]
addOns.isSubscribed("Sports");             // true if that package is active
addOns.getSubscribedCount();              // how many are currently subscribed
addOns.clickManageForAddOn(0);            // open manage/cancel flow (already subscribed)
// Note: clickAddOnCard() on an unsubscribed card may initiate a real purchase
```

### `SettingsPage`

```java
SettingsPage settings = new SettingsPage(driver).navigateTo();

// Account
settings.getAccountName();                 // display name string
settings.getEmail();                       // email address string
settings.clickChangePassword();            // navigate to password change flow
settings.clickEditProfile();              // open profile edit form

// Subscription
settings.getCurrentPlan();                 // "Basic Plan", "Premium", etc.
settings.getRenewalDate();                 // next billing date string

// Payment
settings.getPaymentMethod();              // "Visa ending in 4242", etc.
settings.clickUpdatePayment();            // open payment update flow

// Notifications
settings.getNotificationLabels();         // ["Email Newsletters", "Push Alerts", ...]
settings.clickNotificationToggle(0);      // toggle the first notification switch

// Devices
settings.getDeviceCount();                // number of registered devices
settings.getDeviceNames();                // List<String> of device names
settings.removeDeviceAtIndex(0);          // click remove on first device

// Sign Out
settings.scrollToAndClickSignOut();       // end session → redirects to /authenticator
```

---

## Framework Architecture

### Page Object Model (POM)

Every screen is represented by a Java class in `src/main/java/com/automation/pages/`. Each class:
- Extends `BasePage`
- Declares locators with `@FindBy` annotations
- Exposes public methods for user actions (never raw Selenium calls in tests)

```
Test class
    └── Page Object (e.g. DashboardPage)
            └── BasePage (click, type, screenshot helpers)
                    └── WebDriver (Selenium)
```

### `BasePage` helpers

| Method | Purpose |
|---|---|
| `click(element)` | Wait for clickable, then click |
| `type(element, text)` | Wait for visible, clear, sendKeys |
| `typeAngular(element, text)` | JS native setter for Angular reactive forms |
| `jsClick(element)` | MouseEvent dispatch — bypasses `display:none` |
| `scrollIntoView(element)` | Centres element in viewport |
| `takeScreenshot(name)` | Saves to `screenshots/<name>-<timestamp>.png` |
| `waitForUrlContaining(fragment)` | Blocks until URL contains fragment |

### `DriverFactory`

Thread-safe via `ThreadLocal<WebDriver>` — each test thread gets its own isolated browser session. Supports two execution modes:

| Mode | Trigger | Driver created |
|---|---|---|
| Local | `lt.enabled=false` (default) | `ChromeDriver` / `FirefoxDriver` / `EdgeDriver` via WebDriverManager |
| Remote | `lt.enabled=true` | `RemoteWebDriver` → LambdaTest hub |

### Angular SPA Handling

`watch.frndlytv.com` is an Angular single-page application with several quirks the framework handles automatically:

- **Reactive form fields** — `typeAngular()` uses the JS native value setter + dispatches `input`/`change` events so Angular's `FormControl` registers the value
- **Lazy-loaded rows** — Angular's intersection observer only renders cards when rows scroll into the viewport; `DashboardPage.findRowSection()` scrolls incrementally and polls
- **Post-playback load delay** — after a live stream, Angular takes 30+ seconds to re-render the home page; the framework polls for `h3.ott_tray_title` elements rather than using fixed sleeps
- **`display:none` carousel cards** — `jsClick()` dispatches a `MouseEvent` directly so it reaches Angular's `(click)` listener without Selenium's visibility check blocking it
- **Page load strategy** — Chrome is set to `EAGER` so Selenium returns control once the DOM is ready, without waiting for analytics scripts that never complete on SPAs

---

## Logging

Log4j 2 is configured in `src/main/resources/log4j2.xml`:

- **Console** — timestamped, level-prefixed output during test runs
- **File** — `logs/automation.log`, daily rolling, 7-day retention

Log levels used:
- `INFO` — driver init/quit, row found, card playback summary, screenshot saved
- `WARN` — row/card not found (skipped), session expiry detected
- `DEBUG` — DOM inspection details in `DiagnosticTest`
- `ERROR` — screenshot save failures, unexpected exceptions

Sample output:
```
03:15:22.123 [INFO ] DriverFactory      - Initialising chrome driver (headless=false)
03:15:24.456 [INFO ] DriverFactory      - chrome driver ready
03:15:30.789 [INFO ] AssetPlaybackTest  - === Row: Live Now ===
03:15:31.001 [INFO ] DashboardPage      - Row found: 'Live Now'
03:15:31.234 [INFO ] AssetPlaybackTest  - Row 'Live Now' — 24 cards found
03:15:42.567 [INFO ] AssetPlaybackTest  - Row 'Live Now' card 0 — started: 2026-04-18 03:15:37.001 | screenshot: Live-Now-card0-1776502537001
03:15:42.890 [INFO ] BasePage           - Screenshot saved: /path/to/screenshots/Live-Now-card0-...png
```

---

## Screenshots

All screenshots are saved to the `screenshots/` directory (created automatically).

Filename format: `<label>-<timestamp-millis>.png`

Examples:
```
screenshots/
├── Live-Now-card0-1776502537001-1776502542345.png
├── Live-Now-card1-1776502543000-1776502548123.png
└── row-Continue-Watching-1776502600000.png
```

---

## Adding New Tests

### New page object

1. Create `src/main/java/com/automation/pages/MyPage.java` extending `BasePage`
2. Add `@FindBy` fields for locators
3. Add public methods for interactions — return the next page object when navigation occurs

```java
public class MyPage extends BasePage {
    @FindBy(css = ".my-button")
    private WebElement myButton;

    public MyPage(WebDriver driver) { super(driver); }

    public NextPage clickMyButton() {
        click(myButton);
        return new NextPage(driver);
    }
}
```

### Finding the right locator for a button

Every `@FindBy` needs a CSS selector (or XPath) that uniquely targets the element in the live DOM.

**Steps:**
1. Open the page in Chrome (logged in)
2. Right-click the button → **Inspect**
3. In DevTools, note the element's `class`, `id`, and `aria-label` attributes
4. Build a CSS selector — prefer `aria-label` for buttons, class fragments for containers

```html
<!-- Example element found in DevTools -->
<button class="settings-btn change-password-btn" aria-label="Change Password">Change</button>
```

```java
// Resulting @FindBy — multiple fallback selectors for resilience
@FindBy(css = "button.change-password-btn, button[aria-label*='Change Password' i]")
private WebElement changePasswordButton;

public SettingsPage clickChangePassword() {
    log.info("Clicking Change Password");
    click(changePasswordButton);
    return this;
}
```

**CSS selector tips:**
- `[class*='foo']` — matches any element whose class contains "foo" (resilient to class changes)
- `[aria-label*='text' i]` — case-insensitive aria-label contains match (most stable)
- `button[class*='cta']` — narrows to only `<button>` elements with "cta" in class
- Comma-separate multiple selectors as fallbacks: `"selector1, selector2, selector3"`

### New test class

1. Create `src/test/java/com/automation/tests/MyTest.java` extending `BaseTest`
2. Add `@Test` methods — `driver` is available from `BaseTest`
3. Register in `src/test/resources/testng.xml`:

```xml
<test name="My Tests">
    <classes>
        <class name="com.automation.tests.MyTest"/>
    </classes>
</test>
```

### Long-running tests (shared session)

For tests that need a single login across many steps (like `AssetPlaybackTest`), don't extend `BaseTest`. Instead manage the driver directly:

```java
public class MyLongTest {
    private WebDriver driver;

    @BeforeClass
    public void setUp() {
        driver = DriverFactory.getDriver();
        // login once here
    }

    @AfterClass
    public void tearDown() {
        DriverFactory.quitDriver();
    }
}
```
