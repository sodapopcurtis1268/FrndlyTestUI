package com.automation.pages;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;

/**
 * Page Object for the Frndly TV content player.
 *
 * <p>The player can appear in two forms depending on context:
 * <ul>
 *   <li><b>Inline overlay</b> — the player renders as an overlay on the dashboard page
 *       without a URL change (common for "Continue Watching" assets).</li>
 *   <li><b>Full player page</b> — the Angular router navigates to a distinct route
 *       (e.g. {@code /watch/...}) and the player occupies the full viewport.</li>
 * </ul>
 *
 * <p>Because the URL may or may not change, this page object does not assert on the URL
 * in its constructor. Instead it records the construction timestamp (≈ card click time)
 * and exposes {@link #waitForVideoToStart(int)} to measure the time-to-first-frame (TTFF)
 * — the elapsed milliseconds from click to when the native {@code <video>} element begins
 * advancing its {@code currentTime}.
 *
 * <p>Frndly TV uses JWPlayer, which renders a native {@code <video>} element directly in
 * the document (no shadow DOM, no cross-origin iframe). The JS playback-detection queries
 * target this element.
 */
public class PlayerPage extends BasePage {

    private static final Logger log = LogManager.getLogger(PlayerPage.class);

    /**
     * Epoch-millisecond timestamp captured at construction, which occurs immediately
     * after the card click. Used as the start time for TTFF calculations.
     */
    private final long constructedAtMs = System.currentTimeMillis();

    /**
     * Constructs the page object. No element initialisation is needed as the player
     * renders in many different DOM structures depending on content type.
     *
     * @param driver the active WebDriver session
     */
    public PlayerPage(WebDriver driver) {
        super(driver);
    }

    // ── Playback detection ────────────────────────────────────────────────────

    /**
     * Polls every 500 ms until the native {@code <video>} element reports that
     * playback has started ({@code readyState >= 3} and {@code currentTime > 0}),
     * or until {@code timeoutSeconds} elapses.
     *
     * <p>The returned value is the elapsed milliseconds from object construction
     * (≈ card click) to the moment playback was detected — i.e., the
     * <b>time-to-first-frame (TTFF)</b>.
     *
     * @param timeoutSeconds how long to wait before giving up
     * @return TTFF in milliseconds, or {@code -1} if the video did not start in time
     */
    public long waitForVideoToStart(int timeoutSeconds) {
        log.info("Waiting up to {}s for video playback to begin", timeoutSeconds);
        JavascriptExecutor js = (JavascriptExecutor) driver;
        long deadline = System.currentTimeMillis() + (timeoutSeconds * 1000L);
        long nextPlayClickAtMs = constructedAtMs + 5_000; // first attempt at 5s, then every 5s

        while (System.currentTimeMillis() < deadline) {
            try {
                // VOD: currentTime advances. Live HLS: currentTime may stay 0 but
                // !paused + readyState >= 2 (HAVE_CURRENT_DATA) means frames are flowing.
                Object result = js.executeScript(
                        "var v = document.querySelector('video');"
                        + "if (!v) return 0;"
                        + "var vod  = v.currentTime > 0 && v.readyState >= 3;"
                        + "var live = !v.paused && !v.ended && v.readyState >= 2;"
                        + "return (vod || live) ? 1 : 0;");

                if (result instanceof Long && (Long) result == 1L) {
                    long ttff = System.currentTimeMillis() - constructedAtMs;
                    log.info("Video playback detected — TTFF: {}ms", ttff);
                    return ttff;
                }

                // Retry clicking the detail-page play button every 5s until video starts.
                // This handles slow-rendering detail pages and cases where the first click
                // fires before the button is in the DOM.
                if (System.currentTimeMillis() >= nextPlayClickAtMs) {
                    nextPlayClickAtMs += 5_000;
                    tryClickDetailPagePlayButton(js);
                }

                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return -1;
            } catch (Exception e) {
                log.debug("JS poll error (retrying): {}", e.getMessage());
            }
        }

        log.warn("Video did not start within {}s", timeoutSeconds);
        return -1;
    }

    /**
     * Attempts to click a "Watch Now" / "Play" CTA on a content detail page.
     * Called automatically by {@link #waitForVideoToStart} when no video element
     * appears within 5 seconds of the card click — indicating the card navigated to
     * a detail/info page rather than starting playback directly.
     *
     * <p>The JS is a no-op if no matching button is found, so this is safe to call
     * unconditionally.
     */
    private void tryClickDetailPagePlayButton(JavascriptExecutor js) {
        try {
            Object found = js.executeScript(
                    "var selectors = ["
                    + "  'button[class*=\"watch\"]',"
                    + "  'button[class*=\"play\"]',"
                    + "  'a[class*=\"watch\"]',"
                    + "  '[class*=\"watch-now\"]',"
                    + "  '[class*=\"play-now\"]',"
                    + "  '[class*=\"cta\"][class*=\"watch\"]',"
                    + "  'button[aria-label*=\"watch\" i]',"
                    + "  'button[aria-label*=\"play\" i]',"
                    + "  '[class*=\"ott-play\"]',"
                    + "  '[class*=\"play-btn\"]',"
                    + "  '[class*=\"ott-watch\"]',"
                    + "  '[routerLink*=\"/watch\"]',"
                    + "  '[class*=\"primary\"] button',"
                    + "  '[class*=\"hero\"] button'"
                    + "];"
                    + "for (var i = 0; i < selectors.length; i++) {"
                    + "  var el = document.querySelector(selectors[i]);"
                    + "  if (el && el.offsetParent !== null) { el.click(); return selectors[i]; }"
                    + "}"
                    + "return null;");
            if (found != null) {
                log.info("Detail page play button clicked — selector: {}", found);
            } else {
                log.info("No detail page play button found yet — will retry in 5s");
            }
        } catch (Exception e) {
            log.warn("Error attempting detail page play click: {}", e.getMessage());
        }
    }

    /**
     * Returns whether the native {@code <video>} element is currently playing
     * (not paused, not ended, and {@code currentTime > 0}).
     *
     * @return {@code true} if playback is active
     */
    public boolean isVideoPlaying() {
        try {
            Object result = ((JavascriptExecutor) driver).executeScript(
                    "var v = document.querySelector('video');"
                    + "return v != null && !v.paused && !v.ended && v.currentTime > 0;");
            return Boolean.TRUE.equals(result);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Returns the current {@code currentTime} of the native {@code <video>} element
     * in seconds, or {@code -1.0} if no video element is found.
     *
     * @return video position in seconds
     */
    public double getVideoCurrentTime() {
        try {
            Object result = ((JavascriptExecutor) driver).executeScript(
                    "var v = document.querySelector('video'); return v ? v.currentTime : -1;");
            if (result instanceof Double) return (Double) result;
            if (result instanceof Long)   return ((Long) result).doubleValue();
            return -1.0;
        } catch (Exception e) {
            return -1.0;
        }
    }

    // ── Screenshot / close ────────────────────────────────────────────────────

    /**
     * Waits 3 seconds for the player or content overlay to render, then saves a
     * screenshot to {@code screenshots/<name>-<timestamp>.png}.
     *
     * <p>The 3-second pause is intentional: the player initialises asynchronously
     * (video element, JWPlayer, thumbnails) and a screenshot taken immediately after
     * navigation would capture a loading spinner rather than content.
     *
     * @param name a label used as the filename prefix (e.g. {@code "row-Live-Now"})
     */
    public void captureScreenshot(String name) {
        int playSeconds = com.automation.config.ConfigReader.getVideoPlaySeconds();
        log.info("Letting video play for {}s before screenshot", playSeconds);
        try {
            Thread.sleep(playSeconds * 1000L);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        takeScreenshot(name);
    }

    /**
     * Captures a screenshot with the default filename prefix {@code "player-page"}.
     *
     * @see #captureScreenshot(String)
     */
    public void captureScreenshot() {
        captureScreenshot("player-page");
    }

    /**
     * Navigates back to the dashboard by pressing the browser back button.
     *
     * <p>Frndly TV uses pushState-based routing, so {@code navigate().back()} returns
     * to the previous Angular route. After the navigation this method waits for the
     * URL to contain {@code "home"} before returning the dashboard page object.
     *
     * @return {@link DashboardPage} once the browser has returned to the home route
     */
    public DashboardPage clickClose() {
        driver.navigate().back();
        waitForUrlContaining("home");
        return new DashboardPage(driver);
    }
}
