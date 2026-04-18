package com.automation.tests;

import com.automation.base.BaseTest;
import com.automation.config.ConfigReader;
import com.automation.pages.DashboardPage;
import com.automation.pages.FrndlyLoginPage;
import com.automation.pages.HomePage;
import com.automation.pages.PlayerPage;
import com.automation.pages.SettingsPage;
import org.testng.Assert;
import org.testng.annotations.Test;

public class FrndlyTVTest extends BaseTest {

    @Test
    public void frndlyTVEndToEndTest() {

        // ── 1. try.frndlytv.com → click Log In ──────────────────────────────────
        HomePage homePage = new HomePage(driver);
        FrndlyLoginPage loginPage = homePage.clickLogin();

        // ── 2. Enter credentials (JS native setter required for Angular forms) ──
        DashboardPage dashboard = loginPage.login(
                ConfigReader.getUsername(),
                ConfigReader.getPassword()
        );

        // ── 3. Open first asset in Continue Watching row ─────────────────────────
        // Cards live inside an Angular carousel page that has display:none;
        // jsClick() dispatches a MouseEvent that still reaches Angular's (click).
        PlayerPage playerPage = dashboard.clickFirstContinueWatchingAsset();

        // ── 4. Screenshot the player / content ──────────────────────────────────
        playerPage.captureScreenshot();

        // ── 5. Close the player (navigate back to dashboard) ────────────────────
        dashboard = playerPage.clickClose();

        // ── 6. Click the settings gear wheel (top right) ────────────────────────
        // Navigates to watch.frndlytv.com/settings via Angular router
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
}
