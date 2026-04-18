package com.automation.tests;

import com.automation.base.BaseTest;
import com.automation.config.ConfigReader;
import com.automation.pages.DashboardPage;
import com.automation.pages.HomePage;
import com.automation.pages.PlayerPage;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.Test;
import org.testng.asserts.SoftAssert;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;

/**
 * Verifies that the first content card in each of the 20 named home-page rows is
 * clickable and renders a player or content detail view.
 *
 * <p>All rows are tested in a single browser session (login once) to avoid the
 * overhead of repeated logins. A {@link SoftAssert} accumulates failures so that a
 * problem in one row does not abort the remaining rows — all 20 results are reported
 * together at the end of the test.
 *
 * <h3>Row discovery</h3>
 * <p>The home page renders rows lazily via Angular's intersection observer. Rows are
 * not in the DOM until they are scrolled into view, and their cards are not rendered
 * until the row section enters the viewport. {@link DashboardPage#clickFirstCardInRow}
 * handles this with a two-phase scroll + poll strategy.
 *
 * <h3>Navigation between rows</h3>
 * <p>After each row's card is clicked and a screenshot captured, the test navigates
 * directly to {@code https://watch.frndlytv.com/home} rather than using the browser
 * back button. Browser-back can restore a bfcache snapshot in which row headings exist
 * in the DOM but cards have not yet been rendered, causing subsequent rows to be skipped.
 *
 * <h3>Row availability</h3>
 * <p>Not all rows are guaranteed to appear for every account (e.g. "My Recordings"
 * requires a DVR subscription). A row that cannot be found or has no cards is logged
 * as SKIP rather than a failure.
 */
public class HomePageRowsTest extends BaseTest {

    /**
     * The 20 home-page row names to test, in the order they typically appear on the page.
     * Names must match the exact {@code textContent} of the {@code <h3 class="ott_tray_title">}
     * element as rendered in the browser (case-sensitive, no extra whitespace).
     */
    private static final List<String> ROWS = Arrays.asList(
            "Live Now",
            "Recommended for You",
            "Blockbuster Boulevard",
            "New Episodes",
            "Just Added Movies",
            "Watch Again",
            "Frndly Featured",
            "Trending Now",
            "72-Hour Look Back",
            "Coming Soon - Set Your DVR",
            "Timeless Classics",
            "Frndly TV Fan Favorites",
            "Hallmark Holidays",
            "History or Mystery",
            "Rom-Com",
            "My Recordings",
            "My Favorites",
            "Most Watched",
            "Leaving This Month",
            "Frndly TV Staff Picks"
    );

    /**
     * Iterates over all 20 rows, clicks the first card in each, captures a screenshot,
     * and returns to the home page before moving to the next row.
     *
     * <p>Screenshots are saved to {@code screenshots/row-<sanitised-name>-<timestamp>.png}.
     *
     * <p>A row is silently skipped (SKIP logged to stdout) if:
     * <ul>
     *   <li>The row heading is not found on the page after a full scroll.</li>
     *   <li>The row section contains no renderable cards for this account.</li>
     * </ul>
     *
     * <p>A row records a soft failure if an unexpected exception is thrown during
     * interaction. The test recovers by navigating back to {@code /home} so remaining
     * rows can still run. All accumulated failures are reported together by
     * {@link SoftAssert#assertAll()} at the end.
     */
    @Test
    public void testFirstAssetInEachRow() {
        // Login once — all rows tested in a single browser session
        DashboardPage dashboard = new HomePage(driver)
                .clickLogin()
                .login(ConfigReader.getUsername(), ConfigReader.getPassword());

        SoftAssert softAssert = new SoftAssert();

        for (String rowName : ROWS) {
            System.out.println("Testing row: " + rowName);
            try {
                PlayerPage player = dashboard.clickFirstCardInRow(rowName);

                if (player == null) {
                    System.out.println("  SKIP: row not found or has no cards");
                    continue;
                }

                String screenshotName = "row-" + rowName.replaceAll("[^a-zA-Z0-9]+", "-");
                player.captureScreenshot(screenshotName);

                // Navigate directly to /home instead of browser-back so Angular
                // fully re-renders the home component with fresh intersection observers.
                // browser-back can restore a bfcache snapshot where rows exist in the
                // DOM but cards haven't loaded yet, causing subsequent rows to be skipped.
                driver.navigate().to("https://watch.frndlytv.com/home");
                new WebDriverWait(driver, Duration.ofSeconds(15))
                        .until(ExpectedConditions.urlContains("home"));
                Thread.sleep(2000);
                dashboard = new DashboardPage(driver);

            } catch (Exception e) {
                System.out.println("  FAIL: " + e.getMessage());
                softAssert.fail("Row '" + rowName + "' threw: " + e.getMessage());

                // Recover so remaining rows can still run
                try {
                    driver.navigate().to("https://watch.frndlytv.com/home");
                    Thread.sleep(2000);
                } catch (Exception ignored) {}
                dashboard = new DashboardPage(driver);
            }
        }

        softAssert.assertAll();
    }
}
