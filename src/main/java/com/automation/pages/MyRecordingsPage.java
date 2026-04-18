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
 * Page Object for the Frndly TV My Recordings page
 * ({@code watch.frndlytv.com/my_recording}).
 *
 * <p>My Recordings shows a list or grid of programs the authenticated user has
 * recorded via the DVR feature. Each recording card displays the show title,
 * channel, and recorded date. Cards support two primary actions:
 * <ul>
 *   <li><b>Play</b> — click the card (or an explicit play button) to watch the recording.</li>
 *   <li><b>Delete</b> — click a trash/delete icon to remove the recording.</li>
 * </ul>
 *
 * <p>If the account has no DVR subscription or no recordings saved, an empty-state
 * element is displayed instead of the card grid. Always check {@link #hasRecordings()}
 * before interacting with recording cards.
 *
 * <p><b>Locator note:</b> verify CSS class names against the live DOM at
 * {@code watch.frndlytv.com/my_recording} if any {@code @FindBy} lookups fail.
 */
public class MyRecordingsPage extends BasePage {

    private static final Logger log = LogManager.getLogger(MyRecordingsPage.class);

    /** URL of this page — used by {@link #navigateTo()} and URL assertions. */
    public static final String URL = "https://watch.frndlytv.com/my_recording";

    // ── Recording cards ───────────────────────────────────────────────────────

    /**
     * All recording cards currently rendered on the page. Each card represents
     * one saved recording.
     */
    @FindBy(css = "[class*='recording-card'], [class*='recording_card'], "
            + "[class*='dvr-card'], [class*='dvr_card'], "
            + ".sheet_poster, .roller_poster")
    private List<WebElement> recordingCards;

    /**
     * The title element inside each recording card.
     * Used to read program names without clicking.
     */
    @FindBy(css = "[class*='recording-card'] [class*='title'], "
            + "[class*='recording_card'] [class*='title'], "
            + "[class*='dvr-card'] [class*='title'], "
            + "[class*='dvr_card'] [class*='title']")
    private List<WebElement> recordingTitles;

    /**
     * Delete / trash buttons — one per recording card.
     * These are typically icon buttons positioned in the card corner.
     */
    @FindBy(css = "[class*='delete'], [class*='remove'], "
            + "button[aria-label*='delete' i], button[aria-label*='remove' i], "
            + "[class*='trash']")
    private List<WebElement> deleteButtons;

    /**
     * Play buttons rendered inside recording cards (if distinct from clicking the card).
     */
    @FindBy(css = "[class*='recording-card'] [class*='play'], "
            + "[class*='dvr-card'] [class*='play'], "
            + "[class*='recording-card'] button[aria-label*='play' i]")
    private List<WebElement> playButtons;

    // ── Filter / sort ─────────────────────────────────────────────────────────

    /**
     * Filter tabs for recording status (e.g. "All", "New", "Watched").
     * Not guaranteed to exist on all account types.
     */
    @FindBy(css = "[class*='filter'] button, [class*='tab'][class*='recording'], "
            + "[class*='recording'][class*='tab']")
    private List<WebElement> filterTabs;

    /**
     * Sort control (e.g. "Newest First", "A–Z").
     */
    @FindBy(css = "[class*='sort'] select, [class*='sort'] button, "
            + "[aria-label*='sort' i]")
    private WebElement sortControl;

    // ── Empty state ───────────────────────────────────────────────────────────

    /**
     * Empty-state element shown when no recordings exist for this account,
     * or when the account has no DVR subscription.
     */
    @FindBy(css = "[class*='empty'], [class*='no-recording'], [class*='no_recording'], "
            + "[class*='no-results'], [class*='no_results']")
    private WebElement emptyState;

    // ── Confirmation dialog ───────────────────────────────────────────────────

    /**
     * Confirm button inside the delete-confirmation dialog.
     * Present only after clicking a delete button.
     */
    @FindBy(css = "[class*='confirm'] button, dialog button[class*='confirm'], "
            + "button[aria-label*='confirm' i], [class*='modal'] button[class*='delete']")
    private WebElement confirmDeleteButton;

    /**
     * Cancel button inside the delete-confirmation dialog.
     */
    @FindBy(css = "[class*='cancel'] button, dialog button[class*='cancel'], "
            + "button[aria-label*='cancel' i], [class*='modal'] button[class*='cancel']")
    private WebElement cancelDeleteButton;

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * Constructs the page and initialises all {@code @FindBy} locators.
     *
     * @param driver the active WebDriver session
     */
    public MyRecordingsPage(WebDriver driver) {
        super(driver);
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    /**
     * Navigates to {@value #URL} and waits for the page to settle.
     *
     * @return this {@link MyRecordingsPage} for method chaining
     */
    public MyRecordingsPage navigateTo() {
        log.info("Navigating to My Recordings page");
        driver.navigate().to(URL);
        waitForUrlContaining("my_recording");
        waitForPageToSettle();
        return this;
    }

    // ── State queries ─────────────────────────────────────────────────────────

    /**
     * Returns whether the account has any recordings (i.e. at least one card is
     * rendered and the empty-state element is absent).
     *
     * @return {@code true} if recordings are present
     */
    public boolean hasRecordings() {
        boolean has = !recordingCards.isEmpty() && !isDisplayed(emptyState);
        log.info("Has recordings: {} ({} cards)", has, recordingCards.size());
        return has;
    }

    /**
     * Returns the number of recording cards currently rendered.
     *
     * @return recording card count
     */
    public int getRecordingCount() {
        int count = recordingCards.size();
        log.info("Recording count: {}", count);
        return count;
    }

    /**
     * Returns the titles of all recordings currently visible on the page.
     *
     * @return list of recording title strings
     */
    public List<String> getRecordingTitles() {
        List<String> titles = recordingTitles.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.info("Recording titles: {}", titles);
        return titles;
    }

    /**
     * Returns the text of the empty-state element, or {@code null} if recordings
     * are present.
     *
     * @return empty-state message text, or {@code null}
     */
    public String getEmptyStateText() {
        if (!isDisplayed(emptyState)) return null;
        return emptyState.getText().trim();
    }

    // ── Playback ──────────────────────────────────────────────────────────────

    /**
     * Clicks the recording card at the given 0-based index to start playback.
     *
     * @param index 0-based recording index
     * @return {@link PlayerPage} after clicking, or {@code null} if out of range
     */
    public PlayerPage playRecordingAtIndex(int index) {
        if (index >= recordingCards.size()) {
            log.warn("Recording index {} out of range ({} recordings)", index, recordingCards.size());
            return null;
        }
        WebElement card = recordingCards.get(index);
        log.info("Playing recording [{}]", index);
        scrollIntoView(card);
        jsClick(card);
        return new PlayerPage(driver);
    }

    /**
     * Clicks the first recording whose title contains {@code titleFragment}
     * (case-insensitive) to start playback.
     *
     * @param titleFragment substring of the recording title
     * @return {@link PlayerPage} after clicking, or {@code null} if not found
     */
    public PlayerPage playRecordingByTitle(String titleFragment) {
        log.info("Searching for recording containing: '{}'", titleFragment);
        String lower = titleFragment.toLowerCase();
        JavascriptExecutor js = (JavascriptExecutor) driver;
        WebElement card = (WebElement) js.executeScript(
                "var frag = arguments[0].toLowerCase();"
                + "var cards = document.querySelectorAll("
                + "  '[class*=\"recording-card\"],[class*=\"dvr-card\"],.sheet_poster,.roller_poster');"
                + "return Array.from(cards).find(function(c){"
                + "  return c.textContent.toLowerCase().includes(frag); }) || null;",
                lower);
        if (card == null) {
            log.warn("No recording found matching: '{}'", titleFragment);
            return null;
        }
        log.info("Found recording, clicking");
        scrollIntoView(card);
        jsClick(card);
        return new PlayerPage(driver);
    }

    // ── Deletion ──────────────────────────────────────────────────────────────

    /**
     * Clicks the delete button for the recording at the given 0-based index,
     * then confirms the deletion in the confirmation dialog.
     *
     * @param index 0-based recording index
     * @return this {@link MyRecordingsPage} for method chaining
     */
    public MyRecordingsPage deleteRecordingAtIndex(int index) {
        if (index >= deleteButtons.size()) {
            log.warn("Delete button index {} out of range ({} buttons)", index, deleteButtons.size());
            return this;
        }
        log.info("Deleting recording [{}]", index);
        click(deleteButtons.get(index));
        confirmDeletion();
        return this;
    }

    /**
     * Clicks the confirm button in the delete-confirmation dialog.
     */
    private void confirmDeletion() {
        try {
            click(confirmDeleteButton);
            log.info("Deletion confirmed");
        } catch (Exception e) {
            log.warn("Confirmation dialog not found — deletion may have completed without prompt");
        }
    }

    /**
     * Clicks the cancel button in the delete-confirmation dialog to abort
     * a deletion that has been initiated but not yet confirmed.
     *
     * @return this {@link MyRecordingsPage} for method chaining
     */
    public MyRecordingsPage cancelDeletion() {
        log.info("Cancelling deletion");
        click(cancelDeleteButton);
        return this;
    }

    // ── Filter / sort ─────────────────────────────────────────────────────────

    /**
     * Clicks the filter tab whose label matches {@code tabName} (case-insensitive).
     *
     * @param tabName the tab label (e.g. {@code "All"}, {@code "New"})
     * @return this {@link MyRecordingsPage} for method chaining
     */
    public MyRecordingsPage clickFilterTab(String tabName) {
        log.info("Clicking recordings filter: '{}'", tabName);
        filterTabs.stream()
                .filter(t -> t.getText().trim().equalsIgnoreCase(tabName))
                .findFirst()
                .ifPresentOrElse(
                        t -> click(t),
                        () -> log.warn("Filter tab not found: '{}'", tabName));
        return this;
    }

    /**
     * Captures a screenshot of the My Recordings page.
     *
     * @param name label prepended to the filename
     */
    public void captureScreenshot(String name) {
        takeScreenshot("my-recordings-" + name);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Waits up to 10 seconds for either recording cards or the empty-state element
     * to appear after navigation.
     */
    private void waitForPageToSettle() {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        for (int i = 0; i < 10; i++) {
            Long n = (Long) js.executeScript(
                    "return document.querySelectorAll("
                    + "  '[class*=\"recording-card\"],[class*=\"dvr-card\"],"
                    + "  .sheet_poster,.roller_poster,[class*=\"empty\"]').length;");
            if (n != null && n > 0) { log.debug("My Recordings page settled after {}s", i); return; }
            try { Thread.sleep(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
        }
        log.warn("My Recordings page did not settle within 10s");
    }
}
