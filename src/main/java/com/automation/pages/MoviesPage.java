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
 * Page Object for the Frndly TV Movies browse page
 * ({@code watch.frndlytv.com/movies}).
 *
 * <p>The Movies page presents content in one or more horizontal tray rows
 * (identical structure to {@link DashboardPage}) — each row has an
 * {@code <h3 class="ott_tray_title">} heading and a strip of
 * {@code .sheet_poster} or {@code .roller_poster} cards beneath it. Cards
 * are lazy-rendered by Angular's intersection observer as the user scrolls,
 * so the same scroll-and-poll strategy used in {@link DashboardPage} is
 * applied here.
 *
 * <p>A genre/category filter bar at the top of the page lets users narrow
 * the content displayed. Filter tabs are standard {@code <button>} elements
 * inside a nav or filter container.
 *
 * <p><b>Locator note:</b> verify CSS class names against the live DOM at
 * {@code watch.frndlytv.com/movies} if any {@code @FindBy} lookups fail.
 */
public class MoviesPage extends BasePage {

    private static final Logger log = LogManager.getLogger(MoviesPage.class);

    /** URL of this page — used by {@link #navigateTo()} and URL assertions. */
    public static final String URL = "https://watch.frndlytv.com/movies";

    // ── Genre / category filter bar ───────────────────────────────────────────

    /**
     * All genre/category filter buttons at the top of the movies page
     * (e.g. "All", "Action", "Comedy", "Drama").
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
     * All row-section containers on the page. Each {@code .sec_slider} wraps
     * one tray heading and its card strip — identical to the dashboard structure.
     */
    @FindBy(css = "div.sec_slider, [class*='sec_slider']")
    private List<WebElement> rowSections;

    /**
     * All movie poster cards currently rendered across every row.
     * Frndly TV uses {@code .sheet_poster} for grid-style rows and
     * {@code .roller_poster} for horizontal rollers.
     */
    @FindBy(css = ".sheet_poster, .roller_poster")
    private List<WebElement> movieCards;

    /**
     * All row heading elements ({@code <h3 class="ott_tray_title">}).
     * One per visible tray row.
     */
    @FindBy(css = "h3.ott_tray_title")
    private List<WebElement> rowHeadings;

    // ── Sort control ──────────────────────────────────────────────────────────

    /**
     * Sort dropdown or button group (e.g. "A–Z", "Recently Added", "Popular").
     * Not all pages expose a sort control — check {@link #hasSortControl()} first.
     */
    @FindBy(css = "[class*='sort'] select, [class*='sort'] button, "
            + "[aria-label*='sort'], [aria-label*='Sort']")
    private WebElement sortControl;

    // ── Empty state ───────────────────────────────────────────────────────────

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
    public MoviesPage(WebDriver driver) {
        super(driver);
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    /**
     * Navigates to {@value #URL} and waits for at least one content row to load.
     *
     * @return this {@link MoviesPage} for method chaining
     */
    public MoviesPage navigateTo() {
        log.info("Navigating to Movies page");
        driver.navigate().to(URL);
        waitForUrlContaining("movies");
        waitForContent();
        return this;
    }

    // ── Filter ────────────────────────────────────────────────────────────────

    /**
     * Returns the labels of all genre/category filter buttons.
     *
     * @return list of filter label strings (empty if no filters are rendered)
     */
    public List<String> getFilterNames() {
        List<String> names = filterButtons.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.info("Movie filters available: {}", names);
        return names;
    }

    /**
     * Clicks the filter button whose label exactly matches {@code filterName}
     * (case-insensitive) and waits for the page to re-render.
     *
     * @param filterName the filter label (e.g. {@code "Action"}, {@code "All"})
     * @return this {@link MoviesPage} for method chaining
     */
    public MoviesPage clickFilter(String filterName) {
        log.info("Clicking movie filter: '{}'", filterName);
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
        try {
            return activeFilter.getText().trim();
        } catch (Exception e) {
            return "unknown";
        }
    }

    // ── Content ───────────────────────────────────────────────────────────────

    /**
     * Returns the number of movie cards currently rendered on the page.
     *
     * @return card count
     */
    public int getMovieCardCount() {
        int count = movieCards.size();
        log.info("Movie cards rendered: {}", count);
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
        log.info("Movie page rows: {}", headings);
        return headings;
    }

    /**
     * Clicks the movie card at the given 0-based index and returns the player page.
     *
     * @param index 0-based card index in render order
     * @return {@link PlayerPage} after clicking, or {@code null} if out of range
     */
    public PlayerPage clickMovieAtIndex(int index) {
        if (index >= movieCards.size()) {
            log.warn("Movie card index {} out of range ({} cards rendered)", index, movieCards.size());
            return null;
        }
        WebElement card = movieCards.get(index);
        log.info("Clicking movie card [{}]", index);
        scrollIntoView(card);
        jsClick(card);
        return new PlayerPage(driver);
    }

    /**
     * Clicks the first card in the named tray row, using the same scroll-and-poll
     * strategy as {@link DashboardPage} to handle Angular lazy-loading.
     *
     * @param rowName the exact text of the row heading
     * @return {@link PlayerPage}, or {@code null} if the row or card is not found
     */
    public PlayerPage clickFirstCardInRow(String rowName) {
        log.info("Clicking first card in Movies row: '{}'", rowName);
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
        if (card == null) {
            log.warn("No cards found in row: '{}'", rowName);
            return null;
        }
        js.executeScript("arguments[0].scrollIntoView({block:'center'});", card);
        jsClick(card);
        return new PlayerPage(driver);
    }

    // ── Sort ──────────────────────────────────────────────────────────────────

    /**
     * Returns whether a sort control is present on this page.
     *
     * @return {@code true} if a sort dropdown or button is rendered
     */
    public boolean hasSortControl() {
        try { return sortControl.isDisplayed(); } catch (Exception e) { return false; }
    }

    // ── Empty state ───────────────────────────────────────────────────────────

    /**
     * Returns whether the empty-state message is visible (no results for the
     * selected filter).
     *
     * @return {@code true} if no results are displayed
     */
    public boolean isEmptyState() {
        return isDisplayed(emptyStateMessage);
    }

    /**
     * Captures a screenshot of the movies page.
     *
     * @param name label prepended to the filename
     */
    public void captureScreenshot(String name) {
        takeScreenshot("movies-" + name);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Scrolls and polls to find the {@code .sec_slider} container for the named row,
     * using JS {@code textContent.trim()} matching — same approach as
     * {@link DashboardPage#findRowSection}.
     */
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

    /**
     * Waits up to 15 seconds for at least one content card to appear after navigation
     * or a filter change.
     */
    private void waitForContent() {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        for (int i = 0; i < 15; i++) {
            Long n = (Long) js.executeScript(
                    "return document.querySelectorAll('.sheet_poster,.roller_poster,"
                    + "h3.ott_tray_title').length;");
            if (n != null && n > 0) { log.debug("Movies content loaded after {}s", i); return; }
            try { Thread.sleep(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
        }
        log.warn("Movies content did not load within 15s");
    }
}
