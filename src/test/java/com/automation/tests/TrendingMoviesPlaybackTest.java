package com.automation.tests;

import com.automation.base.BaseTest;
import com.automation.config.ConfigReader;
import com.automation.pages.DashboardPage;
import com.automation.pages.HomePage;
import com.automation.pages.PlayerPage;
import com.automation.utils.VideoRecorder;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openqa.selenium.JavascriptExecutor;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Picks a random content row on the Frndly TV dashboard and measures the
 * time-to-first-frame (TTFF) for its first asset.
 *
 * <h2>What this test does</h2>
 * <ol>
 *   <li>Logs in with the credentials in {@code config.properties}.</li>
 *   <li>Scrolls the full dashboard so Angular lazy-loads every row.</li>
 *   <li>Collects all row names ({@code h3.ott_tray_title} headings) and picks
 *       one at random.</li>
 *   <li>Scrolls to that row and clicks its first card, recording a millisecond-
 *       precision timer at the moment of the click.</li>
 *   <li>Polls the native {@code <video>} element every 500 ms until
 *       {@code readyState >= 3 && currentTime > 0} — the earliest reliable signal
 *       that frames are being decoded and displayed.</li>
 *   <li>Logs and asserts that the TTFF is within the {@link #MAX_TTFF_MS}
 *       threshold (default 30 seconds).</li>
 *   <li>Captures a screenshot of the playing video for visual confirmation.</li>
 * </ol>
 *
 * <h2>Video recording (LambdaTest)</h2>
 * When {@code lt.enabled=true} in {@code config.properties} (or passed as
 * {@code -Dlt.enabled=true}), LambdaTest records a full MP4 video of the entire
 * browser session. The recording is available on the
 * <a href="https://automation.lambdatest.com">LambdaTest automation dashboard</a>
 * under build <b>"Frndly TV Automation"</b>. The session name is set dynamically
 * to include the randomly selected row name.
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

    /**
     * Maximum acceptable time-to-first-frame in milliseconds.
     * 30 seconds is a conservative ceiling — healthy TTFF should be under 10 s.
     */
    private static final long MAX_TTFF_MS = 30_000;

    private static final Random RANDOM = new Random();

    private final VideoRecorder videoRecorder = new VideoRecorder();

    @BeforeMethod
    public void startRecording() {
        videoRecorder.start("random-row-ttff");
    }

    @AfterMethod
    public void stopRecording() {
        videoRecorder.stop();
    }

    /**
     * Rows whose cards do not lead to playable video content and should therefore
     * be excluded from random selection.
     * <ul>
     *   <li>"Browse By Genre" — genre navigation tiles, not video cards</li>
     *   <li>"Coming Soon - Set Your DVR" — scheduling UI, not playable</li>
     *   <li>"Featured Channels" — channel browse, not direct playback</li>
     *   <li>"Add-Ons" — subscription management cards</li>
     *   <li>"My Recordings" — DVR content, account/subscription dependent</li>
     *   <li>"My Favorites" — may be empty for test accounts</li>
     * </ul>
     */
    private static final Set<String> NON_CONTENT_ROWS = Set.of(
            "Browse By Genre",
            "Coming Soon - Set Your DVR",
            "Featured Channels",
            "Add-Ons",
            "My Recordings",
            "My Favorites"
    );

    // ── Test ──────────────────────────────────────────────────────────────────

    /**
     * Logs in, picks a random dashboard row, opens its first asset, and records
     * how long the video takes to start playing.
     *
     * <p><b>Assertions:</b>
     * <ul>
     *   <li>At least one content row is present on the dashboard.</li>
     *   <li>The randomly selected row has a clickable first card.</li>
     *   <li>The native {@code <video>} element begins playback within {@link #MAX_TTFF_MS}.</li>
     * </ul>
     */
    @Test(description = "Pick a random dashboard row and measure time-to-first-frame for its first asset")
    public void randomRow_firstAsset_measuresTimeToFirstFrame() {

        // ── Step 1: Login ─────────────────────────────────────────────────────
        log.info("=== Random Row TTFF Test ===");
        log.info("Step 1: Logging in");
        DashboardPage dashboard = new HomePage(driver)
                .clickLogin()
                .login(ConfigReader.getUsername(), ConfigReader.getPassword());

        // ── Step 2: Collect all row names, filter non-content rows ───────────
        log.info("Step 2: Scrolling dashboard to load all rows");
        List<String> allRows = dashboard.getRowNames();
        List<String> rowNames = allRows.stream()
                .filter(r -> !NON_CONTENT_ROWS.contains(r))
                .collect(Collectors.toList());

        log.info("Eligible rows for random selection ({}): {}", rowNames.size(), rowNames);
        Assert.assertFalse(rowNames.isEmpty(),
                "No eligible content rows found on the dashboard — check login or page load");

        // ── Step 3: Pick a random row ─────────────────────────────────────────
        String selectedRow = rowNames.get(RANDOM.nextInt(rowNames.size()));
        log.info("Step 3: Randomly selected row: '{}' (from {} available rows)", selectedRow, rowNames.size());

        // Label the LambdaTest session with the chosen row so the video is identifiable
        setLtTestName("TTFF — " + selectedRow);

        // ── Step 4: Click first card in the selected row ──────────────────────
        log.info("Step 4: Clicking first card in '{}'", selectedRow);
        PlayerPage player = dashboard.clickFirstCardInRow(selectedRow);

        if (player == null) {
            setLtStatus("failed");
            Assert.fail("First card in row '" + selectedRow + "' was not found. "
                    + "The row may require a subscription or have no playable content.");
        }

        // ── Step 5: Measure time-to-first-frame ───────────────────────────────
        log.info("Step 5: Waiting for video playback to start (timeout: 30s)");
        long ttffMs = player.waitForVideoToStart(30);

        // ── Step 6: Assert, log result, screenshot ────────────────────────────
        if (ttffMs < 0) {
            log.warn("Video did not start within 30s in row '{}' — capturing diagnostic screenshot", selectedRow);
            player.captureScreenshot("ttff-no-playback-" + selectedRow.replaceAll("\\s+", "-"));
            setLtStatus("failed");
            Assert.fail("Video did not start within 30 seconds for row '" + selectedRow + "'.");
        }

        log.info("=== RESULT: Row='{}' | TTFF={}ms ({} s) ===",
                selectedRow, ttffMs, String.format("%.2f", ttffMs / 1000.0));

        boolean stillPlaying = player.isVideoPlaying();
        log.info("Video still playing at screenshot time: {}", stillPlaying);
        player.captureScreenshot("ttff-playing-" + selectedRow.replaceAll("\\s+", "-"));

        setLtStatus("passed");

        Assert.assertTrue(ttffMs <= MAX_TTFF_MS,
                String.format("Row '%s': TTFF of %dms exceeds the %dms threshold",
                        selectedRow, ttffMs, MAX_TTFF_MS));

        log.info("Test passed — Row: '{}' | TTFF: {}ms", selectedRow, ttffMs);
    }

    // ── LambdaTest session helpers ────────────────────────────────────────────

    /**
     * Updates the session name shown on the LambdaTest automation dashboard.
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
