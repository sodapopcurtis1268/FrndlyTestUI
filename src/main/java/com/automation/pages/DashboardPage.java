package com.automation.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

import java.util.List;

/**
 * Page Object for the Frndly TV home / dashboard page ({@code watch.frndlytv.com/home}).
 *
 * <p>The dashboard renders content rows lazily: each row's heading ({@code <h3>}) appears
 * in the DOM when Angular bootstraps the section component, but the card elements inside
 * the row are only injected when the section enters the browser viewport (Angular's
 * intersection observer). This means:
 * <ul>
 *   <li>Searching the DOM for a row heading immediately after page load may succeed even
 *       though the row's cards have not yet been rendered.</li>
 *   <li>A full top-to-bottom scroll is required before all rows and cards are in the DOM.</li>
 * </ul>
 *
 * <p>Row cards live inside Angular carousel pages that may have {@code display:none}
 * applied by the slider library. Regular {@code WebElement.click()} is blocked by the
 * visibility restriction; {@link #jsClick(WebElement)} dispatches a {@code MouseEvent}
 * that still reaches Angular's {@code (click)} listener.
 */
public class DashboardPage extends BasePage {

    /**
     * First card ({@code div.sheet_poster}) in the "Continue Watching" tray.
     * The ancestor {@code sec_slider} XPath pattern is used consistently across all
     * row locators in this class.
     */
    @FindBy(xpath = "(//h3[normalize-space(text())='Continue Watching']"
            + "/ancestor::div[contains(@class,'sec_slider')]"
            + "//div[contains(@class,'sheet_poster')])[1]")
    private WebElement firstContinueWatchingCard;

    /**
     * Gear / settings icon in the top-right header.
     * Confirmed selector via DOM inspection on watch.frndlytv.com.
     */
    @FindBy(css = "div[routerlink='/settings'].ott-header-search")
    private WebElement settingsWheelButton;

    /**
     * Constructs the page and initialises {@code @FindBy} locators.
     *
     * @param driver the active WebDriver session
     */
    public DashboardPage(WebDriver driver) {
        super(driver);
    }

    /**
     * Scrolls the "Continue Watching" first card into view and JS-clicks it.
     *
     * <p>A JS click is required because the card lives inside an Angular carousel page
     * that has {@code display:none} applied by the slider — a standard Selenium click
     * would throw an {@code ElementNotInteractableException}.
     *
     * @return {@link PlayerPage} after the click triggers playback navigation
     */
    public PlayerPage clickFirstContinueWatchingAsset() {
        scrollIntoView(firstContinueWatchingCard);
        jsClick(firstContinueWatchingCard);
        return new PlayerPage(driver);
    }

    /**
     * Scrolls the entire home page from top to bottom in 600 px increments so that
     * Angular's intersection observer fires for every row and loads all cards into the DOM.
     *
     * <p>The page grows dynamically as new rows are appended, so {@code scrollHeight}
     * is re-queried after each step. After reaching the bottom the page is scrolled
     * back to the top.
     */
    public void scrollPageToLoadAllRows() {
        ((JavascriptExecutor) driver).executeScript("window.scrollTo(0, 0);");
        try {
            long pageHeight = (Long) ((JavascriptExecutor) driver)
                    .executeScript("return document.body.scrollHeight");
            for (long y = 0; y < pageHeight; y += 600) {
                ((JavascriptExecutor) driver).executeScript("window.scrollTo(0, " + y + ")");
                Thread.sleep(500);
                pageHeight = (Long) ((JavascriptExecutor) driver)
                        .executeScript("return document.body.scrollHeight");
            }
            ((JavascriptExecutor) driver).executeScript("window.scrollTo(0, 0);");
            Thread.sleep(500);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Scrolls the home page until the named content row is visible, then clicks its
     * first card and returns the resulting player page.
     *
     * <h3>Algorithm</h3>
     * <p><b>Phase 1 — find the section:</b> Starting from the top, the page is scrolled
     * in 600 px steps with a 600 ms pause each step (the cadence that reliably triggers
     * Angular's intersection observer). After each step the DOM is queried with JS
     * {@code textContent} matching (more robust than XPath {@code text()} for elements
     * that may contain nested nodes). Scrolling continues until the {@code .sec_slider}
     * ancestor of the matching {@code <h3>} is found, or the bottom of the page is reached.
     *
     * <p><b>Phase 2 — wait for cards:</b> Once the section element is found, it is
     * scrolled to the centre of the viewport ({@code scrollIntoView({block:'center'})})
     * so Angular's intersection observer fires and begins rendering cards. The method
     * then polls for a card element every 1 s for up to 6 s.
     *
     * <p><b>Card selectors:</b> different row types use different CSS classes —
     * {@code .sheet_poster} for standard grid rows and {@code .roller_poster} for
     * horizontal roller rows — so both are included in the querySelector.
     *
     * @param rowName the exact text of the row heading as it appears on the page
     *                (e.g. {@code "Recommended for You"}, {@code "Live Now"})
     * @return {@link PlayerPage} after clicking the first card, or {@code null} if the
     *         row does not exist on the page or has no renderable cards for this account
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

    /**
     * Clicks the settings gear wheel in the header and waits for the settings page URL.
     *
     * @return {@link SettingsPage} after the Angular router completes the transition
     */
    public SettingsPage clickSettingsWheel() {
        click(settingsWheelButton);
        waitForUrlContaining("settings");
        return new SettingsPage(driver);
    }
}
