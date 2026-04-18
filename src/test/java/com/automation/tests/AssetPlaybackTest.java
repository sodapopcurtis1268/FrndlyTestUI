package com.automation.tests;

import com.automation.config.ConfigReader;
import com.automation.pages.DashboardPage;
import com.automation.pages.HomePage;
import com.automation.pages.PlayerPage;
import com.automation.utils.DriverFactory;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.AfterClass;
import org.testng.annotations.BeforeClass;
import org.testng.annotations.DataProvider;
import org.testng.annotations.Test;
import org.testng.asserts.SoftAssert;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.SimpleDateFormat;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

/**
 * Tests the first 3 and last 3 assets in each of the 20 home-page content rows.
 *
 * <p>Each row is a separate test entry produced by {@link #rows()} via
 * {@code @DataProvider}, giving one test result per row in the TestNG report.
 *
 * <h3>Session lifecycle</h3>
 * <p>This class does <em>not</em> extend {@link com.automation.base.BaseTest} so that
 * a single browser session can be shared across all 20 row-tests (one login instead
 * of twenty). {@code @BeforeClass} creates the driver and logs in; {@code @AfterClass}
 * quits the browser.
 *
 * <h3>Per-card flow</h3>
 * <ol>
 *   <li>Navigate to {@code /home} to get a clean page state.</li>
 *   <li>Record {@code startTime} immediately before clicking the card.</li>
 *   <li>Click the card and wait 5 seconds (let the asset play).</li>
 *   <li>Capture a screenshot — filename embeds row name, card index, and start timestamp.</li>
 *   <li>Navigate back to {@code /home} to stop playback.</li>
 *   <li>Validate the screenshot file exists and is non-empty.</li>
 *   <li>Log a single summary line to stdout.</li>
 * </ol>
 *
 * <h3>Card selection</h3>
 * <p>For a row with {@code N} cards, the indices tested are:
 * first 3 ({@code 0, 1, 2}) + last 3 ({@code N-3, N-2, N-1}), de-duplicated.
 * Rows with fewer than 6 cards have all their cards covered without duplication.
 *
 * <h3>Failure handling</h3>
 * <p>A {@link SoftAssert} is used per row so that a failure on one card does not
 * abort the remaining cards in the same row. All failures for a row are reported
 * together at the end via {@code softAssert.assertAll()}.
 */
public class AssetPlaybackTest {

    private static final String HOME_URL  = "https://watch.frndlytv.com/home";
    private static final SimpleDateFormat TS = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS");

    private WebDriver    driver;
    private DashboardPage dashboard;

    // ── Lifecycle ────────────────────────────────────────────────────────────────

    /**
     * Creates the browser and establishes an authenticated session for the entire
     * class. All 20 row-tests share this single session.
     *
     * <p>As an optimisation the method first navigates directly to {@code /home}.
     * If a valid session cookie already exists (e.g. from a recent prior run) the
     * Angular router stays on {@code /home} and content loads immediately — no
     * login round-trip required. If the router redirects to {@code /authenticator}
     * instead, the method falls back to a full login via the marketing landing page.
     */
    @BeforeClass
    public void setUp() {
        driver = DriverFactory.getDriver();
        // Navigate directly to /home. If the session token from a previous run is
        // still valid this lands on the dashboard immediately; if not, the Angular
        // router redirects to /authenticator and we fall into the login branch.
        driver.navigate().to(HOME_URL);
        try {
            new WebDriverWait(driver, Duration.ofSeconds(10))
                    .until(d -> d.getCurrentUrl().startsWith(HOME_URL));
            // Already logged in — just wait for content to load
            new WebDriverWait(driver, Duration.ofSeconds(20))
                    .until(d -> {
                        Long n = (Long) ((JavascriptExecutor) d).executeScript(
                                "return document.querySelectorAll('h3.ott_tray_title').length;");
                        return n != null && n > 0;
                    });
            dashboard = new DashboardPage(driver);
        } catch (Exception ignored) {
            // Not yet logged in — perform a full login from the base URL.
            driver.get(ConfigReader.getBaseUrl());
            dashboard = new HomePage(driver)
                    .clickLogin()
                    .login(ConfigReader.getUsername(), ConfigReader.getPassword());
        }
    }

    /**
     * Quits the browser after all row-tests have run.
     */
    @AfterClass
    public void tearDown() {
        DriverFactory.quitDriver();
    }

    // ── Data provider ────────────────────────────────────────────────────────────

    /**
     * Supplies the 20 home-page row names to {@link #testRowAssets(String)}.
     * TestNG creates one test instance per row, yielding 20 separate entries in the
     * test report.
     *
     * @return 20-element array, each inner array containing one row-name string
     */
    @DataProvider(name = "rows")
    public Object[][] rows() {
        return new Object[][] {
            {"Live Now"},
            {"Recommended for You"},
            {"Blockbuster Boulevard"},
            {"New Episodes"},
            {"Just Added Movies"},
            {"Watch Again"},
            {"Frndly Featured"},
            {"Trending Now"},
            {"72-Hour Look Back"},
            {"Coming Soon - Set Your DVR"},
            {"Timeless Classics"},
            {"Frndly TV Fan Favorites"},
            {"Hallmark Holidays"},
            {"History or Mystery"},
            {"Rom-Com"},
            {"My Recordings"},
            {"My Favorites"},
            {"Most Watched"},
            {"Leaving This Month"},
            {"Frndly TV Staff Picks"},
        };
    }

    // ── Test method ──────────────────────────────────────────────────────────────

    /**
     * Tests the first 3 and last 3 assets in the named content row.
     *
     * <p>For each card index: navigates to {@code /home}, clicks the card, waits
     * 5 seconds, captures a screenshot, navigates back to stop playback, then
     * validates the screenshot was saved.
     *
     * <p>If the row is not present on the page for this account (e.g. "My Recordings"
     * with no DVR history), the test is skipped gracefully with a log message.
     *
     * @param rowName the exact text of the row heading (supplied by {@link #rows()})
     */
    @Test(dataProvider = "rows")
    public void testRowAssets(String rowName) {
        System.out.println("\n=== Row: " + rowName + " ===");

        // Navigate to /home and get card count for this row
        navigateHome();
        dashboard = new DashboardPage(driver);
        int cardCount = dashboard.getCardCountInRow(rowName);

        if (cardCount == 0) {
            System.out.println("  SKIP: row not found or has no cards");
            return;
        }
        System.out.println("  Cards found: " + cardCount);

        List<Integer> indices = getTestIndices(cardCount);
        SoftAssert softAssert = new SoftAssert();

        for (int index : indices) {
            testCard(rowName, index, softAssert);
        }

        softAssert.assertAll();
    }

    // ── Private helpers ──────────────────────────────────────────────────────────

    /**
     * Runs the full play-capture-validate cycle for a single card.
     *
     * @param rowName    the row heading
     * @param index      0-based card index within the row
     * @param softAssert accumulates failures without aborting the row
     */
    private void testCard(String rowName, int index, SoftAssert softAssert) {
        // Fresh /home page before each card so intersection observers reset
        navigateHome();
        dashboard = new DashboardPage(driver);

        // Record start time before interaction
        long startTimeMillis = System.currentTimeMillis();
        String startTimeFormatted = TS.format(new Date(startTimeMillis));

        PlayerPage player = dashboard.clickCardAtIndexInRow(rowName, index);

        if (player == null) {
            System.out.printf("  [card %d] SKIP: card not found%n", index);
            softAssert.fail("Row '" + rowName + "' card[" + index + "]: not found after scrolling");
            return;
        }

        // Play for 5 seconds
        try { Thread.sleep(5000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }

        // Capture screenshot — embeds start timestamp in filename
        String screenshotName = sanitise(rowName) + "-card" + index + "-" + startTimeMillis;
        player.captureScreenshot(screenshotName);

        // Stop playing: navigate to /home
        navigateHome();
        dashboard = new DashboardPage(driver);

        // Validate screenshot was saved and is non-empty
        validateScreenshot(screenshotName, softAssert);

        System.out.printf("  [card %d] started: %s | screenshot: %s%n",
                index, startTimeFormatted, screenshotName);
    }

    /**
     * Builds the de-duplicated list of card indices to test: first 3 + last 3.
     *
     * <p>Examples:
     * <ul>
     *   <li>total=10 → [0, 1, 2, 7, 8, 9]</li>
     *   <li>total=4  → [0, 1, 2, 3]  (no duplication)</li>
     *   <li>total=2  → [0, 1]</li>
     * </ul>
     *
     * @param total the total number of cards in the row
     * @return ordered, de-duplicated list of indices to test
     */
    private List<Integer> getTestIndices(int total) {
        LinkedHashSet<Integer> idx = new LinkedHashSet<>();
        for (int i = 0; i < Math.min(3, total); i++) idx.add(i);          // first 3
        for (int i = Math.max(0, total - 3); i < total; i++) idx.add(i);  // last 3
        return new ArrayList<>(idx);
    }

    /**
     * Validates that a screenshot file whose name starts with {@code prefix} exists in
     * {@code screenshots/} and has a non-zero file size. Adds soft failures if either
     * check fails.
     *
     * @param prefix     the screenshot name prefix (without the timestamp suffix or extension)
     * @param softAssert the accumulator for this row's failures
     */
    private void validateScreenshot(String prefix, SoftAssert softAssert) {
        Path dir = Path.of("screenshots");
        try (var stream = Files.list(dir)) {
            Optional<Path> file = stream
                    .filter(p -> p.getFileName().toString().startsWith(prefix))
                    .findFirst();
            softAssert.assertTrue(file.isPresent(),
                    "Screenshot not saved for prefix: " + prefix);
            if (file.isPresent()) {
                softAssert.assertTrue(Files.size(file.get()) > 0,
                        "Screenshot file is empty: " + file.get().getFileName());
            }
        } catch (IOException e) {
            softAssert.fail("Could not list screenshots directory: " + e.getMessage());
        }
    }

    /**
     * Navigates to the home page and waits until the browser is both at the home
     * URL <em>and</em> has rendered at least one row heading.
     *
     * <h4>URL check</h4>
     * <p>Uses {@code startsWith(HOME_URL)} rather than {@code urlContains("home")}
     * because an expired session redirects to
     * {@code /authenticator?returnUrl=/home} whose decoded form contains the
     * substring {@code "/home"} as a query parameter.
     * {@code startsWith("https://watch.frndlytv.com/home")} never matches the
     * authenticator URL.
     *
     * <h4>Content check</h4>
     * <p>After a live-channel player session the Angular app can take over 20 s to
     * bootstrap the home page.  The method polls for up to 30 s for at least one
     * {@code h3.ott_tray_title} to appear.
     *
     * <h4>Timeout fallback</h4>
     * <p>If the content check times out, the action depends on the current URL:
     * <ul>
     *   <li><b>Still at {@code /home}</b> — Angular is just slow (common after a
     *       live stream). Proceed immediately; {@link DashboardPage#findRowSection}
     *       has its own polling loop that handles lazy content.</li>
     *   <li><b>Redirected to {@code /authenticator}</b> — the session truly expired.
     *       Navigate to the marketing landing page and perform a full re-login.</li>
     * </ul>
     */
    private void navigateHome() {
        driver.navigate().to(HOME_URL);
        try {
            // Confirm the URL is actually /home (not /authenticator?returnUrl=/home).
            // startsWith(HOME_URL) is reliable because the authenticator URL never
            // begins with "https://watch.frndlytv.com/home".
            new WebDriverWait(driver, Duration.ofSeconds(10))
                    .until(d -> d.getCurrentUrl().startsWith(HOME_URL));

            // After a player session the Angular app can take several seconds to
            // bootstrap the home page.  Poll for up to 30 s for at least one row
            // heading to appear before returning.
            new WebDriverWait(driver, Duration.ofSeconds(30))
                    .until(d -> {
                        Long n = (Long) ((JavascriptExecutor) d).executeScript(
                                "return document.querySelectorAll('h3.ott_tray_title').length;");
                        return n != null && n > 0;
                    });
        } catch (Exception e) {
            String currentUrl = driver.getCurrentUrl();
            if (currentUrl.startsWith(HOME_URL)) {
                // Still at /home — Angular is bootstrapping slowly (e.g. after a live
                // stream). findRowSection has its own polling loop and will wait for
                // content while scrolling, so just proceed.
                System.out.println("  [info] Home page loading slowly, proceeding to scroll");
            } else {
                // Redirected to /authenticator — session actually expired. Navigate to
                // the marketing landing page first so clickLogin() can find the button.
                System.out.println("  [warn] Session expired (url=" + currentUrl + "), re-logging in");
                driver.get(ConfigReader.getBaseUrl());
                dashboard = new HomePage(driver)
                        .clickLogin()
                        .login(ConfigReader.getUsername(), ConfigReader.getPassword());
                try { Thread.sleep(2000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            }
        }
    }

    /**
     * Replaces any character that is not a letter or digit with a hyphen so the result
     * can safely be used as a filename prefix.
     *
     * @param rowName the raw row heading (e.g. {@code "72-Hour Look Back"})
     * @return sanitised string (e.g. {@code "72-Hour-Look-Back"})
     */
    private String sanitise(String rowName) {
        return rowName.replaceAll("[^a-zA-Z0-9]+", "-");
    }
}
