package com.automation.tests;

import com.automation.base.BaseTest;
import com.automation.config.ConfigReader;
import com.automation.pages.DashboardPage;
import com.automation.pages.HomePage;
import com.automation.pages.PlayerPage;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.BeforeMethod;
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
 * <p>Extends {@link BaseTest} so that each data-provider row gets its own browser
 * session (login → test up to 6 cards → quit). This keeps each individual session
 * well within LambdaTest's per-session duration limits.
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
public class AssetPlaybackTest extends BaseTest {

    private static final Logger log = LogManager.getLogger(AssetPlaybackTest.class);
    private static final String HOME_URL  = "https://watch.frndlytv.com/home";
    private static final SimpleDateFormat TS = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS");

    private DashboardPage dashboard;

    // ── Lifecycle ────────────────────────────────────────────────────────────────

    /**
     * Creates a fresh browser session and logs in before each data-provider row.
     * Each row gets its own session so no single session runs longer than a few
     * minutes, staying within LambdaTest's per-session duration limits.
     */
    @BeforeMethod
    @Override
    public void setUp() {
        super.setUp(); // creates driver, navigates to ConfigReader.getBaseUrl()
        dashboard = new HomePage(driver)
                .clickLogin()
                .login(ConfigReader.getUsername(), ConfigReader.getPassword());
    }

    // tearDown() is inherited from BaseTest (@AfterMethod → DriverFactory.quitDriver())

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
        log.info("=== Row: {} ===", rowName);

        // Navigate to /home and get card count for this row
        navigateHome();
        dashboard = new DashboardPage(driver);
        int cardCount = dashboard.getCardCountInRow(rowName);

        if (cardCount == 0) {
            log.warn("SKIP: row '{}' not found or has no cards", rowName);
            return;
        }
        log.info("Row '{}' — {} cards found", rowName, cardCount);

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
            log.warn("Row '{}' card {} — not found, skipping", rowName, index);
            softAssert.fail("Row '" + rowName + "' card[" + index + "]: not found after scrolling");
            return;
        }

        // Capture screenshot — captureScreenshot() already waits video.play.seconds internally
        String screenshotName = sanitise(rowName) + "-card" + index + "-" + startTimeMillis;
        player.captureScreenshot(screenshotName);

        // Stop playing: navigate back to /home.  VOD content can leave Angular in a
        // state where the home page never fully re-bootstraps; if navigateHome() gives
        // up after its retries, record the failure and skip screenshot validation for
        // this card so subsequent cards in the row can still run.
        try {
            navigateHome();
        } catch (RuntimeException e) {
            log.warn("Row '{}' card {} — home page failed to reload after playback: {}",
                    rowName, index, e.getMessage());
            softAssert.fail("Row '" + rowName + "' card[" + index
                    + "]: home page failed to reload after playback — " + e.getMessage());
            return;
        }
        dashboard = new DashboardPage(driver);

        // Validate screenshot was saved and is non-empty
        validateScreenshot(screenshotName, softAssert);

        log.info("Row '{}' card {} — started: {} | screenshot: {}", rowName, index, startTimeFormatted, screenshotName);
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
     * <h4>Content check with refresh retry</h4>
     * <p>After a VOD player session Angular can fail to re-bootstrap the home page
     * entirely.  To avoid hanging indefinitely (which exhausts the LambdaTest session
     * budget), the method uses a two-attempt strategy:
     * <ol>
     *   <li>Navigate to {@code /home} and poll up to 30 s for row headings.</li>
     *   <li>If that times out <em>and</em> the URL is still {@code /home}, issue a
     *       hard {@code driver.navigate().refresh()} and poll for another 30 s.</li>
     *   <li>If the refresh also times out, throw {@link RuntimeException} so the
     *       calling card fails fast (via soft-assert in {@link #testCard}) rather
     *       than stalling the entire LambdaTest session.</li>
     * </ol>
     *
     * <h4>Session-expiry fallback</h4>
     * <p>If either attempt ends at a non-{@code /home} URL (redirect to
     * {@code /authenticator}), the session truly expired and a full re-login is
     * performed.
     */
    private void navigateHome() {
        driver.navigate().to(HOME_URL);
        try {
            // Confirm the URL is actually /home (not /authenticator?returnUrl=/home).
            new WebDriverWait(driver, Duration.ofSeconds(10))
                    .until(d -> d.getCurrentUrl().startsWith(HOME_URL));

            // First attempt: poll up to 30 s for at least one row heading.
            new WebDriverWait(driver, Duration.ofSeconds(30))
                    .until(d -> {
                        Long n = (Long) ((JavascriptExecutor) d).executeScript(
                                "return document.querySelectorAll('h3.ott_tray_title').length;");
                        return n != null && n > 0;
                    });
            return; // content loaded — done
        } catch (Exception firstTimeout) {
            String currentUrl = driver.getCurrentUrl();
            if (!currentUrl.startsWith(HOME_URL)) {
                // Redirected away — session expired; re-login and return.
                log.warn("Session expired (url={}), re-logging in", currentUrl);
                driver.get(ConfigReader.getBaseUrl());
                dashboard = new HomePage(driver)
                        .clickLogin()
                        .login(ConfigReader.getUsername(), ConfigReader.getPassword());
                try { Thread.sleep(2000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                return;
            }
            // Still at /home but content hasn't appeared — Angular may be stuck after
            // VOD playback.  Try a hard refresh before giving up.
            log.info("Home page content not loaded after 30 s; retrying with page refresh");
            driver.navigate().refresh();
        }

        // Second attempt after refresh: poll another 30 s.
        try {
            new WebDriverWait(driver, Duration.ofSeconds(30))
                    .until(d -> {
                        Long n = (Long) ((JavascriptExecutor) d).executeScript(
                                "return document.querySelectorAll('h3.ott_tray_title').length;");
                        return n != null && n > 0;
                    });
            log.info("Home page loaded after refresh");
        } catch (Exception secondTimeout) {
            String currentUrl = driver.getCurrentUrl();
            if (!currentUrl.startsWith(HOME_URL)) {
                // Redirected after refresh — session expired; re-login.
                log.warn("Session expired after refresh (url={}), re-logging in", currentUrl);
                driver.get(ConfigReader.getBaseUrl());
                dashboard = new HomePage(driver)
                        .clickLogin()
                        .login(ConfigReader.getUsername(), ConfigReader.getPassword());
                try { Thread.sleep(2000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            } else {
                // Angular is completely stuck — fail fast so the LT session is not
                // consumed by an indefinite wait in findRowSection's scroll loop.
                throw new RuntimeException(
                        "Home page failed to display row content after navigate + refresh (60 s total)");
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
