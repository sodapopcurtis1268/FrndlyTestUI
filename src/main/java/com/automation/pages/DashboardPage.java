package com.automation.pages;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
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
 *
 * <p>Two card CSS classes are used depending on the row type:
 * <ul>
 *   <li>{@code .sheet_poster} — standard grid-style rows (e.g. Live Now, Frndly Featured)</li>
 *   <li>{@code .roller_poster} — horizontal roller rows (e.g. Recommended for You)</li>
 * </ul>
 */
public class  DashboardPage extends BasePage {

    private static final Logger log = LogManager.getLogger(DashboardPage.class);

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
     * Scrolls the full page to trigger Angular lazy-loading, then returns the text of
     * every {@code <h3 class="ott_tray_title">} heading found in the DOM.
     *
     * <p>Call this after navigating to {@code /home} to get the complete list of row
     * names available for the authenticated account. The list can then be used to pick
     * a row (e.g. at random) before calling {@link #clickFirstCardInRow(String)}.
     *
     * @return ordered list of row heading strings (never {@code null}, may be empty)
     */
    @SuppressWarnings("unchecked")
    public List<String> getRowNames() {
        scrollPageToLoadAllRows();
        List<String> names = (List<String>) ((JavascriptExecutor) driver).executeScript(
                "return Array.from(document.querySelectorAll('h3.ott_tray_title'))"
                + "  .map(function(h){ return h.textContent.trim(); })"
                + "  .filter(function(t){ return t.length > 0; });");
        log.info("Dashboard rows found ({}): {}", names.size(), names);
        return names;
    }

    // ── Row-scanning helpers ──────────────────────────────────────────────────────

    /**
     * Scrolls the page from the top in 600 px steps until the {@code sec_slider}
     * container for the named row heading appears in the DOM, then returns it.
     *
     * <p>Uses JS {@code textContent.trim()} matching rather than XPath {@code text()}
     * so that headings whose text is split across nested child elements still match.
     * {@code pageHeight} is re-read after every step so the loop continues as Angular
     * appends new rows while scrolling.
     *
     * @param rowName the exact heading text (e.g. {@code "Live Now"})
     * @return the {@code .sec_slider} {@link WebElement} for the row, or {@code null}
     *         if the row does not appear on the page for this account
     */
    private WebElement findRowSection(String rowName) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript("window.scrollTo(0, 0);");
        WebElement section = null;
        long scrollY = 0;
        try {
            // If the page body is still at roughly viewport height (i.e. Angular has
            // not yet rendered any row content), wait up to 30 s for it to grow.
            // This handles the case where navigateHome() returned before the SPA
            // finished bootstrapping after a player session.
            long pageHeight = (Long) js.executeScript("return document.body.scrollHeight");
            int loadWait = 0;
            while (pageHeight < 1200 && loadWait < 30) {
                Thread.sleep(1000);
                loadWait++;
                pageHeight = (Long) js.executeScript("return document.body.scrollHeight");
            }
            log.debug("findRowSection('{}') — pageHeight={}px after {}s content-ready wait", rowName, pageHeight, loadWait);

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
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if (section != null) {
            log.info("Row found: '{}'", rowName);
        } else {
            log.warn("Row not found on page: '{}'", rowName);
        }
        return section;
    }

    /**
     * Returns the number of renderable cards in the named row.
     *
     * <p>Scrolls the page to find the row section, then scrolls the section into the
     * viewport so Angular's intersection observer fires and cards are rendered. Polls
     * for up to 6 seconds waiting for at least one card to appear.
     *
     * @param rowName the exact heading text of the row
     * @return the card count, or {@code 0} if the row is absent or has no cards
     */
    public int getCardCountInRow(String rowName) {
        WebElement section = findRowSection(rowName);
        if (section == null) return 0;
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript("arguments[0].scrollIntoView({block:'center'});", section);
        long count = 0;
        for (int i = 0; i < 6 && count == 0; i++) {
            try { Thread.sleep(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            count = (Long) js.executeScript(
                    "return arguments[0].querySelectorAll('.sheet_poster,.roller_poster').length;",
                    section);
        }
        return (int) count;
    }

    /**
     * Clicks the card at the given 0-based index in the named row and returns the
     * resulting player page.
     *
     * <p>Uses the same two-phase scroll strategy as {@link #clickFirstCardInRow}:
     * find the section, scroll into view so cards render, then click by index.
     * The card is scrolled into the centre of the viewport before clicking so it is
     * not obscured by a sticky header.
     *
     * @param rowName the exact heading text of the row
     * @param index   0-based card index within the row
     * @return {@link PlayerPage} after clicking, or {@code null} if the row/card is
     *         unavailable
     */
    public PlayerPage clickCardAtIndexInRow(String rowName, int index) {
        WebElement section = findRowSection(rowName);
        if (section == null) return null;
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript("arguments[0].scrollIntoView({block:'center'});", section);

        WebElement card = null;
        for (int i = 0; i < 6 && card == null; i++) {
            try { Thread.sleep(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            card = (WebElement) js.executeScript(
                    "var cards = arguments[0].querySelectorAll('.sheet_poster,.roller_poster');"
                    + "return (cards.length > arguments[1]) ? cards[arguments[1]] : null;",
                    section, index);
        }
        if (card == null) return null;

        js.executeScript("arguments[0].scrollIntoView({block:'center'});", card);
        jsClick(card);
        try { Thread.sleep(2000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        return new PlayerPage(driver);
    }

    /**
     * Scrolls to the first card in the named row and clicks it.
     *
     * <p>Convenience wrapper around {@link #clickCardAtIndexInRow(String, int)} with
     * {@code index = 0}.
     *
     * @param rowName the exact heading text of the row
     * @return {@link PlayerPage}, or {@code null} if the row/cards are unavailable
     */
    public PlayerPage clickFirstCardInRow(String rowName) {
        return clickCardAtIndexInRow(rowName, 0);
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
