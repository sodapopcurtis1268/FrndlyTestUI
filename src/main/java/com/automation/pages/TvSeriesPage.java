package com.automation.pages;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Page Object for the Frndly TV TV Series browse page
 * ({@code watch.frndlytv.com/tv_tv_series}).
 *
 * <p>Structurally identical to {@link MoviesPage}: content is presented in
 * horizontal tray rows ({@code .sec_slider}) with {@code h3.ott_tray_title}
 * headings and {@code .sheet_poster} / {@code .roller_poster} cards rendered
 * lazily by Angular's intersection observer. A genre/category filter bar
 * narrows displayed shows.
 *
 * <p>Clicking a series card typically navigates to a series detail page
 * listing episodes rather than going directly to a player.
 *
 * <p><b>Locator note:</b> verify CSS class names against the live DOM at
 * {@code watch.frndlytv.com/tv_tv_series} if any {@code @FindBy} lookups fail.
 */
public class TvSeriesPage extends BasePage {

    private static final Logger log = LogManager.getLogger(TvSeriesPage.class);

    /** URL of this page — used by {@link #navigateTo()} and URL assertions. */
    public static final String URL = "https://watch.frndlytv.com/tv_tv_series";

    // ── Genre / category filter bar ───────────────────────────────────────────

    /**
     * All genre/category filter buttons at the top of the TV series page
     * (e.g. "All", "Drama", "Comedy", "Reality").
     */
    @FindBy(css = "[class*='filter'] button, [class*='category'] button, "
            + "[class*='genre'] button, nav[class*='filter'] a")
    private List<WebElement> filterButtons;

    /**
     * The currently active/selected filter button.
     */
    @FindBy(css = "[class*='filter'] button[class*='active'], "
            + "[class*='filter'] button[class*='selected'], "
            + "[class*='filter'] button[class*='current']")
    private WebElement activeFilter;

    // ── Content rows ──────────────────────────────────────────────────────────

    /**
     * All row-section containers. Each {@code .sec_slider} wraps one tray heading
     * and its card strip.
     */
    @FindBy(css = "div.sec_slider, [class*='sec_slider']")
    private List<WebElement> rowSections;

    /**
     * All series poster cards currently rendered across every row.
     */
    @FindBy(css = ".sheet_poster, .roller_poster")
    private List<WebElement> seriesCards;

    /**
     * All row heading elements ({@code <h3 class="ott_tray_title">}).
     */
    @FindBy(css = "h3.ott_tray_title")
    private List<WebElement> rowHeadings;

    // ── Series detail elements ────────────────────────────────────────────────

    /**
     * Empty-state message shown when a genre filter returns no results.
     */
    @FindBy(css = "[class*='empty'], [class*='no-results'], [class*='no_results']")
    private WebElement emptyStateMessage;

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * Constructs the page and initialises all {@code @FindBy} locators.
     *
     * @param driver the active WebDriver session
     */
    public TvSeriesPage(WebDriver driver) {
        super(driver);
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    /**
     * Navigates to {@value #URL} and waits for at least one content row to load.
     *
     * @return this {@link TvSeriesPage} for method chaining
     */
    public TvSeriesPage navigateTo() {
        log.info("Navigating to TV Series page");
        driver.navigate().to(URL);
        waitForUrlContaining("tv_tv_series");
        waitForContent();
        return this;
    }

    // ── Filter ────────────────────────────────────────────────────────────────

    /**
     * Returns the labels of all genre/category filter buttons.
     *
     * @return list of filter label strings
     */
    public List<String> getFilterNames() {
        List<String> names = filterButtons.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.info("TV Series filters available: {}", names);
        return names;
    }

    /**
     * Clicks the filter button whose label matches {@code filterName}
     * (case-insensitive) and waits for the page to re-render.
     *
     * @param filterName the filter label (e.g. {@code "Drama"}, {@code "All"})
     * @return this {@link TvSeriesPage} for method chaining
     */
    public TvSeriesPage clickFilter(String filterName) {
        log.info("Clicking TV Series filter: '{}'", filterName);
        filterButtons.stream()
                .filter(b -> b.getText().trim().equalsIgnoreCase(filterName))
                .findFirst()
                .ifPresentOrElse(
                        b -> { click(b); waitForContent(); },
                        () -> log.warn("Filter not found: '{}'", filterName));
        return this;
    }

    /**
     * Returns the label of the currently active filter button.
     *
     * @return active filter label, or {@code "unknown"} if none is highlighted
     */
    public String getActiveFilter() {
        try { return activeFilter.getText().trim(); } catch (Exception e) { return "unknown"; }
    }

    // ── Content ───────────────────────────────────────────────────────────────

    /**
     * Returns the number of series cards currently rendered on the page.
     *
     * @return card count
     */
    public int getSeriesCardCount() {
        int count = seriesCards.size();
        log.info("TV Series cards rendered: {}", count);
        return count;
    }

    /**
     * Returns the headings of all tray rows currently visible on the page.
     *
     * @return list of row heading strings
     */
    public List<String> getRowHeadings() {
        List<String> headings = rowHeadings.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.info("TV Series page rows: {}", headings);
        return headings;
    }

    /**
     * Clicks the series card at the given 0-based index. Series cards typically
     * navigate to a detail/episode-list page rather than a player directly.
     *
     * @param index 0-based card index in render order
     * @return {@link PlayerPage} after clicking, or {@code null} if out of range
     */
    public PlayerPage clickSeriesAtIndex(int index) {
        if (index >= seriesCards.size()) {
            log.warn("Series card index {} out of range ({} cards rendered)", index, seriesCards.size());
            return null;
        }
        WebElement card = seriesCards.get(index);
        log.info("Clicking TV series card [{}]", index);
        scrollIntoView(card);
        jsClick(card);
        return new PlayerPage(driver);
    }

    /**
     * Clicks the first card in the named tray row using the scroll-and-poll
     * strategy (same as {@link DashboardPage}).
     *
     * @param rowName the exact text of the row heading
     * @return {@link PlayerPage}, or {@code null} if the row or card is not found
     */
    public PlayerPage clickFirstCardInRow(String rowName) {
        log.info("Clicking first card in TV Series row: '{}'", rowName);
        JavascriptExecutor js = (JavascriptExecutor) driver;
        WebElement section = findRowSection(rowName);
        if (section == null) return null;
        js.executeScript("arguments[0].scrollIntoView({block:'center'});", section);
        WebElement card = null;
        for (int i = 0; i < 6 && card == null; i++) {
            try { Thread.sleep(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            card = (WebElement) js.executeScript(
                    "var cards = arguments[0].querySelectorAll('.sheet_poster,.roller_poster');"
                    + "return cards.length > 0 ? cards[0] : null;", section);
        }
        if (card == null) { log.warn("No cards found in row: '{}'", rowName); return null; }
        js.executeScript("arguments[0].scrollIntoView({block:'center'});", card);
        jsClick(card);
        return new PlayerPage(driver);
    }

    // ── Empty state ───────────────────────────────────────────────────────────

    /**
     * Returns whether the empty-state message is visible.
     *
     * @return {@code true} if no results are displayed for the selected filter
     */
    public boolean isEmptyState() {
        return isDisplayed(emptyStateMessage);
    }

    /**
     * Captures a screenshot of the TV series page.
     *
     * @param name label prepended to the filename
     */
    public void captureScreenshot(String name) {
        takeScreenshot("tv-series-" + name);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private WebElement findRowSection(String rowName) {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        js.executeScript("window.scrollTo(0, 0);");
        WebElement section = null;
        long scrollY = 0;
        try {
            long pageHeight = (Long) js.executeScript("return document.body.scrollHeight");
            while (section == null && scrollY <= pageHeight) {
                scrollY += 600;
                js.executeScript("window.scrollTo(0, " + scrollY + ")");
                Thread.sleep(600);
                pageHeight = (Long) js.executeScript("return document.body.scrollHeight");
                section = (WebElement) js.executeScript(
                        "var t = arguments[0];"
                        + "var h3 = Array.from(document.querySelectorAll('h3.ott_tray_title'))"
                        + "  .find(function(h){ return h.textContent.trim() === t; });"
                        + "return h3 ? h3.closest('.sec_slider') : null;", rowName);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if (section != null) log.info("Row found: '{}'", rowName);
        else log.warn("Row not found: '{}'", rowName);
        return section;
    }

    private void waitForContent() {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        for (int i = 0; i < 15; i++) {
            Long n = (Long) js.executeScript(
                    "return document.querySelectorAll('.sheet_poster,.roller_poster,"
                    + "h3.ott_tray_title').length;");
            if (n != null && n > 0) { log.debug("TV Series content loaded after {}s", i); return; }
            try { Thread.sleep(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
        }
        log.warn("TV Series content did not load within 15s");
    }
}
