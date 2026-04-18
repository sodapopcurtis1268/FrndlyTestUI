package com.automation.tests;

import com.automation.base.BaseTest;
import com.automation.config.ConfigReader;
import com.automation.pages.DashboardPage;
import com.automation.pages.HomePage;
import com.automation.pages.PlayerPage;
import com.automation.pages.SettingsPage;
import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * End-to-end smoke test for the core Frndly TV user journey.
 *
 * <p>Covers the full authenticated session flow in a single browser session:
 * <ol>
 *   <li>Navigate to the landing page and click Log In.</li>
 *   <li>Submit credentials via Angular-compatible form fill.</li>
 *   <li>Open the first asset in the "Continue Watching" row.</li>
 *   <li>Capture a player screenshot.</li>
 *   <li>Return to the dashboard and navigate to Settings.</li>
 *   <li>Sign Out and assert the redirect to the authenticator page.</li>
 * </ol>
 *
 * <p>This test is registered in {@code testng.xml} under the "Frndly TV E2E" group.
 */
public class FrndlyTVTest extends BaseTest {

    /**
     * Full end-to-end journey: login → play content → settings → sign out.
     *
     * <p>Asserts that after signing out the browser URL contains
     * {@code watch.frndlytv.com/authenticator}, confirming the session has been
     * terminated and the user has been redirected correctly.
     */
    @Test
    public void frndlyTVEndToEndTest() {

        // ── 1 & 2. Navigate to landing page, click Log In, submit credentials ───
        DashboardPage dashboard = login();

        // ── 3. Open first asset in Continue Watching row ─────────────────────────
        // Cards live inside an Angular carousel page that has display:none;
        // jsClick() dispatches a MouseEvent that still reaches Angular's (click).
        PlayerPage playerPage = dashboard.clickFirstContinueWatchingAsset();

        // ── 4. Screenshot the player / content ──────────────────────────────────
        playerPage.captureScreenshot();

        // ── 5. Close the player (navigate back to dashboard) ────────────────────
        dashboard = playerPage.clickClose();

        // ── 6. Click the settings gear wheel (top right) ────────────────────────
        SettingsPage settingsPage = dashboard.clickSettingsWheel();

        // ── 7. Scroll to Sign Out and click it ───────────────────────────────────
        settingsPage.scrollToAndClickSignOut();

        // ── 8. Validate redirect to the authenticator page ───────────────────────
        String currentUrl = driver.getCurrentUrl();
        Assert.assertTrue(
                currentUrl.contains("watch.frndlytv.com/authenticator"),
                "Expected authenticator URL but got: " + currentUrl
        );
    }

    /**
     * Navigates to the landing page, clicks Log In, and submits credentials.
     *
     * @return {@link DashboardPage} after successful authentication
     */
    private DashboardPage login() {
        return new HomePage(driver)
                .clickLogin()
                .login(ConfigReader.getUsername(), ConfigReader.getPassword());
    }
}
