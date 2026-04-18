package com.automation.pages;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.NoSuchElementException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

import java.util.List;
import java.util.stream.Collectors;

/**
 * Page Object for the Frndly TV channel guide ({@code watch.frndlytv.com/guide}).
 *
 * <p>The guide renders a time-based grid: channels are listed vertically on the left
 * and program tiles extend horizontally across time slots. Like the dashboard, the
 * grid is an Angular component — rows and tiles may be lazy-rendered as the user
 * scrolls horizontally or vertically.
 *
 * <h3>Grid structure</h3>
 * <ul>
 *   <li>Time-slot headers — a row of {@code .guide-time} (or equivalent) labels across
 *       the top showing 30-minute increments.</li>
 *   <li>Channel rows — each row contains a {@code .guide-channel-name} label on the left
 *       and a horizontal strip of {@code .guide-program} tiles to the right.</li>
 *   <li>Program tiles — each tile shows the program title and, on hover, a short
 *       description. Clicking a tile navigates to the player or a detail overlay.</li>
 * </ul>
 *
 * <h3>Navigation</h3>
 * <p>The guide can be paged forward and backward in 30-minute increments via arrow
 * buttons at the top of the grid. A "Now" / "Live" jump button re-centres the grid
 * on the current time.
 *
 * <p><b>Note:</b> Locators are based on common Frndly TV Angular class patterns and
 * should be verified against the live DOM at {@code watch.frndlytv.com/guide} if
 * any {@code @FindBy} lookups fail. Use browser DevTools and search for the class
 * names used in each {@code @FindBy} annotation below.
 */
public class GuidePage extends BasePage {

    private static final Logger log = LogManager.getLogger(GuidePage.class);

    /** URL of the guide page — used by {@link #navigateTo()} and URL assertions. */
    public static final String URL = "https://watch.frndlytv.com/guide";

    // ── Navigation controls ───────────────────────────────────────────────────

    /**
     * Button that pages the guide backward (earlier in time).
     * Typically a left-arrow icon in the guide header.
     */
    @FindBy(css = "button.guide-prev, button[aria-label='Previous'], [class*='guide'][class*='prev']")
    private WebElement prevButton;

    /**
     * Button that pages the guide forward (later in time).
     * Typically a right-arrow icon in the guide header.
     */
    @FindBy(css = "button.guide-next, button[aria-label='Next'], [class*='guide'][class*='next']")
    private WebElement nextButton;

    /**
     * "Now" / "Live" jump button that re-centres the grid on the current time.
     */
    @FindBy(css = "button.guide-now, button[aria-label='Now'], [class*='guide-now'], [class*='guide_now']")
    private WebElement nowButton;

    // ── Guide grid ────────────────────────────────────────────────────────────

    /**
     * The outermost guide grid container. Used to scope sub-queries and as an
     * anchor for JS scroll operations.
     */
    @FindBy(css = "[class*='guide-container'], [class*='guide_container'], .epg-container, [class*='epg']")
    private WebElement guideContainer;

    /**
     * All time-slot label elements across the top header row.
     * Used to read which 30-minute windows are currently visible.
     */
    @FindBy(css = "[class*='guide-time'], [class*='guide_time'], [class*='time-slot'], [class*='timeslot']")
    private List<WebElement> timeSlotLabels;

    /**
     * All channel-name / channel-logo elements in the left-hand channel column.
     * One element per visible channel row.
     */
    @FindBy(css = "[class*='guide-channel'], [class*='channel-name'], [class*='channel_name']")
    private List<WebElement> channelElements;

    /**
     * All program tiles currently rendered in the guide grid.
     * Each tile represents one show in one channel's time band.
     */
    @FindBy(css = "[class*='guide-program'], [class*='program-cell'], [class*='program_cell'], [class*='epg-program']")
    private List<WebElement> programTiles;

    /**
     * The highlighted "current program" tile — the one airing right now.
     * Frndly TV typically applies an {@code active}, {@code current}, or {@code live}
     * modifier class to distinguish it.
     */
    @FindBy(css = "[class*='guide-program'][class*='active'], [class*='guide-program'][class*='current'], "
            + "[class*='guide-program'][class*='live'], [class*='program'][class*='now']")
    private WebElement currentProgramTile;

    // ── Search / filter ───────────────────────────────────────────────────────

    /**
     * Category filter tabs at the top of the guide (e.g. "All", "News", "Movies").
     * Not all accounts see filter tabs — check {@link #hasFilters()} before use.
     */
    @FindBy(css = "[class*='guide-filter'], [class*='guide-category'], [class*='filter-tab']")
    private List<WebElement> filterTabs;

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * Constructs the page and initialises all {@code @FindBy} locators.
     *
     * @param driver the active WebDriver session
     */
    public GuidePage(WebDriver driver) {
        super(driver);
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    /**
     * Navigates the browser to {@value #URL} and waits for the guide grid to load.
     *
     * @return this {@link GuidePage} for method chaining
     */
    public GuidePage navigateTo() {
        log.info("Navigating to guide page");
        driver.navigate().to(URL);
        waitForGuideToLoad();
        return this;
    }

    /**
     * Clicks the previous-time-slot arrow to page the guide backward by one
     * 30-minute increment.
     *
     * @return this {@link GuidePage} for method chaining
     */
    public GuidePage clickPrevious() {
        log.info("Clicking guide Previous button");
        click(prevButton);
        return this;
    }

    /**
     * Clicks the next-time-slot arrow to page the guide forward by one
     * 30-minute increment.
     *
     * @return this {@link GuidePage} for method chaining
     */
    public GuidePage clickNext() {
        log.info("Clicking guide Next button");
        click(nextButton);
        return this;
    }

    /**
     * Clicks the "Now" / "Live" button to re-centre the guide on the current time.
     *
     * @return this {@link GuidePage} for method chaining
     */
    public GuidePage clickNow() {
        log.info("Clicking guide Now/Live button");
        click(nowButton);
        return this;
    }

    // ── Channel queries ───────────────────────────────────────────────────────

    /**
     * Returns the number of channel rows currently visible in the guide grid.
     *
     * @return visible channel count
     */
    public int getChannelCount() {
        int count = channelElements.size();
        log.info("Guide channel count: {}", count);
        return count;
    }

    /**
     * Returns the display names of all channels currently visible in the guide.
     *
     * @return list of channel name strings (empty if none are loaded)
     */
    public List<String> getChannelNames() {
        List<String> names = channelElements.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.info("Guide channels visible: {}", names);
        return names;
    }

    /**
     * Clicks the channel row whose display name exactly matches {@code channelName}
     * and returns the resulting player page.
     *
     * <p>Uses JS {@code textContent.trim()} matching so names split across child
     * elements still match, consistent with the approach in {@link DashboardPage}.
     *
     * @param channelName the exact channel name as displayed in the guide
     * @return {@link PlayerPage} after clicking, or {@code null} if the channel
     *         is not found in the currently visible grid
     */
    public PlayerPage clickChannel(String channelName) {
        log.info("Clicking channel: '{}'", channelName);
        JavascriptExecutor js = (JavascriptExecutor) driver;
        WebElement channel = (WebElement) js.executeScript(
                "var name = arguments[0];"
                + "var els = document.querySelectorAll("
                + "  '[class*=\"guide-channel\"],[class*=\"channel-name\"],[class*=\"channel_name\"]');"
                + "return Array.from(els).find(function(e){"
                + "  return e.textContent.trim() === name; }) || null;",
                channelName);
        if (channel == null) {
            log.warn("Channel not found in guide: '{}'", channelName);
            return null;
        }
        jsClick(channel);
        return new PlayerPage(driver);
    }

    // ── Program queries ───────────────────────────────────────────────────────

    /**
     * Returns the number of program tiles currently rendered in the guide grid.
     *
     * @return program tile count
     */
    public int getProgramCount() {
        int count = programTiles.size();
        log.info("Guide program tile count: {}", count);
        return count;
    }

    /**
     * Returns the titles of all program tiles currently visible in the guide.
     *
     * @return list of program title strings
     */
    public List<String> getProgramTitles() {
        List<String> titles = programTiles.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.debug("Visible program titles: {}", titles);
        return titles;
    }

    /**
     * Clicks the program tile at the given 0-based index in the guide grid and
     * returns the resulting player page.
     *
     * @param index 0-based tile index (left-to-right, top-to-bottom render order)
     * @return {@link PlayerPage} after clicking, or {@code null} if the index is
     *         out of range
     */
    public PlayerPage clickProgramAtIndex(int index) {
        if (index >= programTiles.size()) {
            log.warn("Program index {} out of range (only {} tiles visible)", index, programTiles.size());
            return null;
        }
        WebElement tile = programTiles.get(index);
        log.info("Clicking program tile [{}]: '{}'", index, tile.getText().trim());
        scrollIntoView(tile);
        jsClick(tile);
        return new PlayerPage(driver);
    }

    /**
     * Clicks the first program tile in the guide that contains {@code titleFragment}
     * (case-insensitive substring match) and returns the resulting player page.
     *
     * @param titleFragment a substring of the program title to search for
     * @return {@link PlayerPage} after clicking, or {@code null} if no match is found
     */
    public PlayerPage clickProgramByTitle(String titleFragment) {
        log.info("Searching for program containing: '{}'", titleFragment);
        String lower = titleFragment.toLowerCase();
        WebElement match = programTiles.stream()
                .filter(t -> t.getText().toLowerCase().contains(lower))
                .findFirst()
                .orElse(null);
        if (match == null) {
            log.warn("No program found matching: '{}'", titleFragment);
            return null;
        }
        log.info("Found program: '{}'", match.getText().trim());
        scrollIntoView(match);
        jsClick(match);
        return new PlayerPage(driver);
    }

    /**
     * Returns the text of the currently-airing (highlighted) program tile,
     * or {@code null} if no current-program tile is visible.
     *
     * @return current program title string, or {@code null}
     */
    public String getCurrentProgramTitle() {
        try {
            String title = currentProgramTile.getText().trim();
            log.info("Current program: '{}'", title);
            return title;
        } catch (NoSuchElementException e) {
            log.warn("No current-program tile found on guide");
            return null;
        }
    }

    // ── Time slots ────────────────────────────────────────────────────────────

    /**
     * Returns the time-slot labels currently shown in the guide header
     * (e.g. {@code ["6:00 PM", "6:30 PM", "7:00 PM", ...]}).
     *
     * @return list of time-slot label strings
     */
    public List<String> getVisibleTimeSlots() {
        List<String> slots = timeSlotLabels.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.debug("Visible time slots: {}", slots);
        return slots;
    }

    // ── Filters ───────────────────────────────────────────────────────────────

    /**
     * Returns whether category filter tabs are present on this guide page.
     * Filter tabs are not shown for all account types.
     *
     * @return {@code true} if at least one filter tab is rendered
     */
    public boolean hasFilters() {
        return !filterTabs.isEmpty();
    }

    /**
     * Clicks the filter tab whose label text exactly matches {@code filterName}
     * (e.g. {@code "All"}, {@code "News"}, {@code "Movies"}).
     *
     * @param filterName the exact tab label
     * @return this {@link GuidePage} for method chaining
     */
    public GuidePage clickFilter(String filterName) {
        log.info("Clicking guide filter: '{}'", filterName);
        filterTabs.stream()
                .filter(t -> t.getText().trim().equalsIgnoreCase(filterName))
                .findFirst()
                .ifPresentOrElse(
                        tab -> { scrollIntoView(tab); click(tab); },
                        () -> log.warn("Filter tab not found: '{}'", filterName));
        return this;
    }

    // ── State queries ─────────────────────────────────────────────────────────

    /**
     * Returns whether the guide grid is visible and has loaded at least one channel row.
     *
     * @return {@code true} if the grid is loaded with content
     */
    public boolean isLoaded() {
        boolean loaded = !channelElements.isEmpty();
        log.debug("Guide loaded: {} ({} channels)", loaded, channelElements.size());
        return loaded;
    }

    /**
     * Captures a full-page screenshot of the guide.
     *
     * @param name label prepended to the screenshot filename
     */
    public void captureScreenshot(String name) {
        takeScreenshot("guide-" + name);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Waits up to 20 seconds for the guide grid to render at least one channel row.
     * The guide is an Angular component that requires the router to complete and the
     * EPG data request to resolve before any rows appear.
     */
    private void waitForGuideToLoad() {
        log.debug("Waiting for guide grid to load");
        waitForUrlContaining("guide");
        JavascriptExecutor js = (JavascriptExecutor) driver;
        for (int i = 0; i < 20; i++) {
            Long count = (Long) js.executeScript(
                    "return document.querySelectorAll("
                    + "  '[class*=\"guide-channel\"],[class*=\"channel-name\"],"
                    + "  [class*=\"channel_name\"],[class*=\"guide-program\"]').length;");
            if (count != null && count > 0) {
                log.info("Guide loaded — {} elements found after {}s", count, i);
                return;
            }
            try { Thread.sleep(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
        }
        log.warn("Guide grid did not load within 20s — proceeding anyway");
    }
}
