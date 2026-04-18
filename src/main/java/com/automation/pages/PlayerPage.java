package com.automation.pages;

import org.openqa.selenium.WebDriver;

public class PlayerPage extends BasePage {

    public PlayerPage(WebDriver driver) {
        super(driver);
    }

    /**
     * Waits briefly for the player/content to render, then saves a screenshot.
     * The Continue Watching player may be an inline overlay or a new page —
     * we capture whatever is currently visible.
     */
    public void captureScreenshot(String name) {
        try {
            Thread.sleep(3000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        takeScreenshot(name);
    }

    public void captureScreenshot() {
        captureScreenshot("player-page");
    }

    /**
     * Closes the player and returns to the dashboard.
     * Frndly TV uses browser history-based navigation: pressing Back
     * from a player context returns to the home/dashboard view.
     */
    public DashboardPage clickClose() {
        driver.navigate().back();
        waitForUrlContaining("home");
        return new DashboardPage(driver);
    }
}
