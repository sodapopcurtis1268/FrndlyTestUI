package com.automation.pages;

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
 * in its constructor. Instead it provides a {@link #captureScreenshot(String)} method
 * that waits briefly and captures whatever is visible, and a {@link #clickClose()} method
 * that navigates back via browser history.
 */
public class PlayerPage extends BasePage {

    /**
     * Constructs the page object. No element initialisation is needed as the player
     * renders in many different DOM structures depending on content type.
     *
     * @param driver the active WebDriver session
     */
    public PlayerPage(WebDriver driver) {
        super(driver);
    }

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
        try {
            Thread.sleep(3000);
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
