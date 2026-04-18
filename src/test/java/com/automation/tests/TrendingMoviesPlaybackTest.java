package com.automation.tests;

import com.automation.base.BaseTest;
import com.automation.config.ConfigReader;
import com.automation.pages.DashboardPage;
import com.automation.pages.HomePage;
import com.automation.pages.PlayerPage;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openqa.selenium.JavascriptExecutor;
import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Measures the time-to-first-frame (TTFF) for the first asset in the
 * "Trending Movies" content row on the Frndly TV dashboard.
 *
 * <h2>What this test does</h2>
 * <ol>
 *   <li>Logs in with the credentials in {@code config.properties}.</li>
 *   <li>Scrolls to the "Trending Movies" tray row on the home dashboard.</li>
 *   <li>Clicks the first card in that row and starts a millisecond-precision
 *       timer at the moment of the click.</li>
 *   <li>Polls the native {@code <video>} element every 500 ms until
 *       {@code readyState >= 3} and {@code currentTime > 0} — the earliest
 *       reliable signal that frames are being decoded and displayed.</li>
 *   <li>Logs and asserts that the TTFF is within the {@link #MAX_TTFF_MS}
 *       threshold (default 30 seconds).</li>
 *   <li>Captures a screenshot of the playing video for visual confirmation.</li>
 * </ol>
 *
 * <h2>Video recording (LambdaTest)</h2>
 * When {@code lt.enabled=true} in {@code config.properties} (or passed as
 * {@code -Dlt.enabled=true}), LambdaTest records a full MP4 video of the
 * entire browser session. The recording is available on the
 * <a href="https://automation.lambdatest.com">LambdaTest automation dashboard</a>
 * under build <b>"Frndly TV Automation"</b> with the test named
 * <b>"Trending Movies — Time to First Frame"</b>.
 *
 * <p>To run on LambdaTest:
 * <pre>
 *   mvn test -Dtest=TrendingMoviesPlaybackTest -Dlt.enabled=true
 * </pre>
 *
 * <p>To run locally:
 * <pre>
 *   mvn test -Dtest=TrendingMoviesPlaybackTest
 * </pre>
 */
public class TrendingMoviesPlaybackTest extends BaseTest {

    private static final Logger log = LogManager.getLogger(TrendingMoviesPlaybackTest.class);

    /** Tray row heading as it appears on the dashboard. Adjust if the label changes. */
    private static final String ROW_NAME = "Trending Movies";

    /**
     * Maximum acceptable time-to-first-frame in milliseconds.
     * 30 seconds is a conservative ceiling — healthy TTFF should be under 10 s.
     */
    private static final long MAX_TTFF_MS = 30_000;

    // ── Test ──────────────────────────────────────────────────────────────────

    /**
     * Logs in, opens the first asset in the "Trending Movies" row, and records
     * how long the video takes to start playing.
     *
     * <p><b>Assertions:</b>
     * <ul>
     *   <li>The "Trending Movies" row and its first card are found on the dashboard.</li>
     *   <li>The native {@code <video>} element begins playback within {@link #MAX_TTFF_MS}.</li>
     * </ul>
     */
    @Test(description = "Measure time-to-first-frame for the first asset in Trending Movies")
    public void trendingMovies_firstAsset_measuresTimeToFirstFrame() {

        // Label this session on LambdaTest so it's easy to find in the dashboard
        setLtTestName("Trending Movies — Time to First Frame");

        // ── Step 1: Login ─────────────────────────────────────────────────────
        log.info("=== Trending Movies TTFF Test ===");
        log.info("Step 1: Logging in");
        DashboardPage dashboard = new HomePage(driver)
                .clickLogin()
                .login(ConfigReader.getUsername(), ConfigReader.getPassword());

        // ── Step 2: Find row and click first card ─────────────────────────────
        log.info("Step 2: Locating '{}' row and clicking first card", ROW_NAME);
        PlayerPage player = dashboard.clickFirstCardInRow(ROW_NAME);

        if (player == null) {
            setLtStatus("failed");
            Assert.fail("'" + ROW_NAME + "' row or its first card was not found on the dashboard. "
                    + "Verify the row name matches the live page heading exactly.");
        }

        // ── Step 3: Measure time-to-first-frame ───────────────────────────────
        log.info("Step 3: Waiting for video playback to start (timeout: 30s)");
        long ttffMs = player.waitForVideoToStart(30);

        // ── Step 4: Assert, log result, screenshot ────────────────────────────
        if (ttffMs < 0) {
            log.warn("Video did not start within 30s — capturing diagnostic screenshot");
            player.captureScreenshot("trending-movies-no-playback");
            setLtStatus("failed");
            Assert.fail("Video did not start within 30 seconds. "
                    + "Check network connectivity or whether the content requires an add-on subscription.");
        }

        // Log the measured value
        log.info("=== RESULT: Time to first frame: {}ms ({} s) ===",
                ttffMs, String.format("%.2f", ttffMs / 1000.0));

        // Confirm video is still playing and capture screenshot as evidence
        boolean stillPlaying = player.isVideoPlaying();
        log.info("Video still playing at screenshot time: {}", stillPlaying);
        player.captureScreenshot("trending-movies-playing");

        // Mark LambdaTest session passed before the assertion (assertion failure
        // would skip lines below it, so set status first)
        setLtStatus("passed");

        Assert.assertTrue(ttffMs <= MAX_TTFF_MS,
                String.format("TTFF of %dms exceeds the %dms threshold", ttffMs, MAX_TTFF_MS));

        log.info("Test passed — TTFF: {}ms", ttffMs);
    }

    // ── LambdaTest session helpers ────────────────────────────────────────────

    /**
     * Updates the session name shown in the LambdaTest automation dashboard.
     * No-op when running locally ({@code lt.enabled=false}).
     *
     * @param name human-readable test name
     */
    private void setLtTestName(String name) {
        if (ConfigReader.isLtEnabled()) {
            try {
                ((JavascriptExecutor) driver).executeScript("lambda-name=" + name);
                log.info("LambdaTest session name set to: '{}'", name);
            } catch (Exception e) {
                log.warn("Could not set LambdaTest session name: {}", e.getMessage());
            }
        }
    }

    /**
     * Marks the LambdaTest session as passed or failed on the dashboard.
     * No-op when running locally.
     *
     * @param status {@code "passed"} or {@code "failed"}
     */
    private void setLtStatus(String status) {
        if (ConfigReader.isLtEnabled()) {
            try {
                ((JavascriptExecutor) driver).executeScript("lambda-status=" + status);
                log.info("LambdaTest session status set to: {}", status);
            } catch (Exception e) {
                log.warn("Could not set LambdaTest session status: {}", e.getMessage());
            }
        }
    }
}
