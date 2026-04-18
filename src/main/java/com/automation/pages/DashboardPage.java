package com.automation.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

import java.util.List;

public class DashboardPage extends BasePage {

    // First card (div.sheet_poster) in the "Continue Watching" tray.
    // Note: the Angular carousel renders these inside a cards_section that has
    // display:none while off-screen.  We use jsClick() (dispatchEvent) instead
    // of a regular click() so the Angular (click) binding still fires.
    @FindBy(xpath = "(//h3[normalize-space(text())='Continue Watching']"
            + "/ancestor::div[contains(@class,'sec_slider')]"
            + "//div[contains(@class,'sheet_poster')])[1]")
    private WebElement firstContinueWatchingCard;

    // Gear/settings icon in the top-right header — confirmed class & routerlink.
    @FindBy(css = "div[routerlink='/settings'].ott-header-search")
    private WebElement settingsWheelButton;

    public DashboardPage(WebDriver driver) {
        super(driver);
    }

    public PlayerPage clickFirstContinueWatchingAsset() {
        scrollIntoView(firstContinueWatchingCard);
        // dispatchEvent bypasses the display:none restriction on the carousel page
        jsClick(firstContinueWatchingCard);
        return new PlayerPage(driver);
    }

    /**
     * Scrolls to the named home-page row, waits for Angular's intersection observer
     * to render the cards, then JS-clicks the first card (bypasses display:none).
     *
     * @return PlayerPage, or null if the row is not present / has no cards for this account.
     */
    public PlayerPage clickFirstCardInRow(String rowName) {
        List<WebElement> sections = driver.findElements(By.xpath(
                "//h3[normalize-space(text())='" + rowName + "']"
                + "/ancestor::div[contains(@class,'sec_slider')]"));
        if (sections.isEmpty()) return null;

        WebElement section = sections.get(0);
        scrollIntoView(section);

        // Wait for Angular's intersection observer to render the carousel cards.
        try { Thread.sleep(2000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }

        WebElement card = (WebElement) ((JavascriptExecutor) driver).executeScript(
                "return arguments[0].querySelector('.sheet_poster');", section);
        if (card == null) return null;

        jsClick(card);
        try { Thread.sleep(2000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        return new PlayerPage(driver);
    }

    public SettingsPage clickSettingsWheel() {
        click(settingsWheelButton);
        // Angular SPA client-side route change — wait for /settings URL
        waitForUrlContaining("settings");
        return new SettingsPage(driver);
    }
}
