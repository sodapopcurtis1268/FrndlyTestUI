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
     * Scrolls from top to bottom of the home page in small steps so Angular's
     * intersection observer loads every row into the DOM before we search by name.
     * Without this, rows below the fold don't exist in the DOM yet.
     */
    public void scrollPageToLoadAllRows() {
        ((JavascriptExecutor) driver).executeScript("window.scrollTo(0, 0);");
        try {
            long pageHeight = (Long) ((JavascriptExecutor) driver)
                    .executeScript("return document.body.scrollHeight");
            for (long y = 0; y < pageHeight; y += 600) {
                ((JavascriptExecutor) driver).executeScript("window.scrollTo(0, " + y + ")");
                Thread.sleep(500);
                // Page grows as new rows are added
                pageHeight = (Long) ((JavascriptExecutor) driver)
                        .executeScript("return document.body.scrollHeight");
            }
            // Scroll back to top so the first row is in view
            ((JavascriptExecutor) driver).executeScript("window.scrollTo(0, 0);");
            Thread.sleep(500);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Scrolls from the top of the page in 600 px steps (same cadence that triggers
     * Angular's intersection observer in practice) until both the named row heading
     * AND at least one card inside it appear in the DOM, then JS-clicks that card.
     *
     * Scrolling past the section heading is required because Angular renders cards
     * lazily only when the carousel enters the viewport — finding the heading node
     * alone is not sufficient.
     *
     * @return PlayerPage, or null if the row/cards are not available for this account.
     */
    public PlayerPage clickFirstCardInRow(String rowName) {
        JavascriptExecutor js = (JavascriptExecutor) driver;

        // Always reset to the top so the intersection observer fires in order.
        js.executeScript("window.scrollTo(0, 0);");

        WebElement section = null;
        long scrollY = 0;

        try {
            long pageHeight = (Long) js.executeScript("return document.body.scrollHeight");

            // Phase 1: scroll until the section heading appears in the DOM.
            // Use JS textContent (same as DiagnosticTest) rather than XPath text()
            // so that headings with nested elements still match.
            while (section == null && scrollY <= pageHeight) {
                scrollY += 600;
                js.executeScript("window.scrollTo(0, " + scrollY + ")");
                Thread.sleep(600);
                pageHeight = (Long) js.executeScript("return document.body.scrollHeight");

                section = (WebElement) js.executeScript(
                        "var target = arguments[0];"
                        + "var h3 = Array.from(document.querySelectorAll('h3.ott_tray_title'))"
                        + "  .find(function(h){ return h.textContent.trim() === target; });"
                        + "if (!h3) return null;"
                        + "return h3.closest('.sec_slider');",
                        rowName);
            }

            if (section == null) return null;

            // Phase 2: scroll the section into the centre of the viewport so Angular's
            // intersection observer fires and renders the cards, then poll for a card.
            js.executeScript("arguments[0].scrollIntoView({block:'center'});", section);

            WebElement card = null;
            for (int i = 0; i < 6 && card == null; i++) {
                Thread.sleep(1000);
                card = (WebElement) js.executeScript(
                        "return arguments[0].querySelector('.sheet_poster, .roller_poster');", section);
            }

            if (card == null) return null;

            jsClick(card);
            Thread.sleep(2000);
            return new PlayerPage(driver);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    public SettingsPage clickSettingsWheel() {
        click(settingsWheelButton);
        // Angular SPA client-side route change — wait for /settings URL
        waitForUrlContaining("settings");
        return new SettingsPage(driver);
    }
}
