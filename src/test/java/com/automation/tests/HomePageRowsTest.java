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

public class HomePageRowsTest extends BaseTest {

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
