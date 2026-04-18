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
 * Page Object for the Frndly TV Add-Ons page
 * ({@code watch.frndlytv.com/add-ons}).
 *
 * <p>The Add-Ons page presents optional channel packages that subscribers can
 * add to their base plan (e.g. extra sports, premium channels, DVR upgrades).
 * Each add-on card displays:
 * <ul>
 *   <li>Package name and description</li>
 *   <li>Monthly price</li>
 *   <li>A subscribe / add button (or a "Manage" / "Cancel" button if already subscribed)</li>
 * </ul>
 *
 * <p>Cards are standard static elements — no intersection-observer lazy-loading
 * is expected since the add-on catalogue is a small, finite list fetched in a
 * single API call.
 *
 * <p><b>Locator note:</b> verify CSS class names against the live DOM at
 * {@code watch.frndlytv.com/add-ons} if any {@code @FindBy} lookups fail.
 * <br><b>Caution:</b> clicking Subscribe / Add initiates a real billing action —
 * use with care in automated tests and always verify against a test account.
 */
public class AddOnsPage extends BasePage {

    private static final Logger log = LogManager.getLogger(AddOnsPage.class);

    /** URL of this page — used by {@link #navigateTo()} and URL assertions. */
    public static final String URL = "https://watch.frndlytv.com/add-ons";

    // ── Add-on cards ──────────────────────────────────────────────────────────

    /**
     * All add-on package cards currently rendered on the page.
     * One card per available add-on package.
     */
    @FindBy(css = "[class*='addon-card'], [class*='addon_card'], "
            + "[class*='add-on-card'], [class*='package-card'], "
            + "[class*='package_card'], [class*='plan-card']")
    private List<WebElement> addOnCards;

    /**
     * Package name / title element inside each add-on card.
     */
    @FindBy(css = "[class*='addon-card'] [class*='title'], [class*='addon_card'] [class*='title'], "
            + "[class*='package-card'] [class*='title'], [class*='package-card'] h2, "
            + "[class*='package-card'] h3, [class*='plan-card'] [class*='name']")
    private List<WebElement> addOnTitles;

    /**
     * Price elements — one per add-on card, showing the monthly cost.
     */
    @FindBy(css = "[class*='addon-card'] [class*='price'], [class*='package-card'] [class*='price'], "
            + "[class*='plan-card'] [class*='price'], [class*='addon'] [class*='amount']")
    private List<WebElement> addOnPrices;

    /**
     * Description / detail text elements — one per add-on card.
     */
    @FindBy(css = "[class*='addon-card'] [class*='description'], "
            + "[class*='package-card'] [class*='description'], "
            + "[class*='addon-card'] p, [class*='package-card'] p")
    private List<WebElement> addOnDescriptions;

    // ── Action buttons ────────────────────────────────────────────────────────

    /**
     * All "Subscribe", "Add", or "Get" buttons — one per unsubscribed add-on card.
     *
     * <p><b>Billing warning:</b> clicking these buttons initiates a real purchase
     * on the authenticated account.
     */
    @FindBy(css = "button[class*='subscribe'], button[class*='add-on'], "
            + "button[aria-label*='subscribe' i], button[aria-label*='add' i], "
            + "[class*='addon-card'] button[class*='cta'], "
            + "[class*='package-card'] button[class*='cta']")
    private List<WebElement> subscribeButtons;

    /**
     * All "Manage" or "Cancel" buttons for add-ons that are already subscribed.
     */
    @FindBy(css = "button[class*='manage'], button[class*='cancel-addon'], "
            + "button[aria-label*='manage' i], "
            + "[class*='addon-card'] button[class*='manage'], "
            + "[class*='package-card'] button[class*='manage']")
    private List<WebElement> manageButtons;

    /**
     * "Currently Subscribed" / "Active" badge elements on subscribed add-on cards.
     */
    @FindBy(css = "[class*='subscribed'], [class*='active-plan'], "
            + "[class*='current-plan'], [class*='addon'][class*='active']")
    private List<WebElement> subscribedBadges;

    // ── Page header / description ─────────────────────────────────────────────

    /**
     * Page heading (e.g. "Add-Ons", "Premium Channels").
     */
    @FindBy(css = "h1[class*='addon'], h1[class*='add-on'], "
            + "[class*='page-title'], [class*='page_title']")
    private WebElement pageHeading;

    // ── Empty / loading state ─────────────────────────────────────────────────

    /**
     * Empty or error state shown if no add-ons are available for this account's region.
     */
    @FindBy(css = "[class*='empty'], [class*='no-addons'], [class*='no_addons'], "
            + "[class*='unavailable']")
    private WebElement emptyState;

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * Constructs the page and initialises all {@code @FindBy} locators.
     *
     * @param driver the active WebDriver session
     */
    public AddOnsPage(WebDriver driver) {
        super(driver);
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    /**
     * Navigates to {@value #URL} and waits for the add-on cards to load.
     *
     * @return this {@link AddOnsPage} for method chaining
     */
    public AddOnsPage navigateTo() {
        log.info("Navigating to Add-Ons page");
        driver.navigate().to(URL);
        waitForUrlContaining("add-ons");
        waitForPageToSettle();
        return this;
    }

    // ── State queries ─────────────────────────────────────────────────────────

    /**
     * Returns whether the page has loaded at least one add-on card.
     *
     * @return {@code true} if add-on cards are present
     */
    public boolean isLoaded() {
        boolean loaded = !addOnCards.isEmpty();
        log.info("Add-Ons page loaded: {} ({} cards)", loaded, addOnCards.size());
        return loaded;
    }

    /**
     * Returns the total number of add-on cards rendered on the page.
     *
     * @return add-on card count
     */
    public int getAddOnCount() {
        int count = addOnCards.size();
        log.info("Add-on packages available: {}", count);
        return count;
    }

    /**
     * Returns the names of all add-on packages currently displayed.
     *
     * @return list of package name strings
     */
    public List<String> getAddOnNames() {
        List<String> names = addOnTitles.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.info("Add-on package names: {}", names);
        return names;
    }

    /**
     * Returns the price text for each add-on card in render order
     * (e.g. {@code ["$4.99/mo", "$9.99/mo"]}).
     *
     * @return list of price strings
     */
    public List<String> getAddOnPrices() {
        List<String> prices = addOnPrices.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.info("Add-on prices: {}", prices);
        return prices;
    }

    /**
     * Returns how many add-ons are already subscribed (have an active/subscribed badge).
     *
     * @return subscribed add-on count
     */
    public int getSubscribedCount() {
        int count = subscribedBadges.size();
        log.info("Already subscribed add-ons: {}", count);
        return count;
    }

    /**
     * Returns whether the add-on package whose name contains {@code nameFragment}
     * (case-insensitive) is currently subscribed.
     *
     * @param nameFragment substring of the package name
     * @return {@code true} if a matching subscribed badge is found
     */
    public boolean isSubscribed(String nameFragment) {
        String lower = nameFragment.toLowerCase();
        boolean subscribed = addOnCards.stream()
                .filter(c -> c.getText().toLowerCase().contains(lower))
                .anyMatch(c -> c.getText().toLowerCase().contains("subscribed")
                        || c.getText().toLowerCase().contains("active")
                        || c.findElements(
                                org.openqa.selenium.By.cssSelector(
                                        "[class*='subscribed'],[class*='active']"))
                                .size() > 0);
        log.info("Add-on '{}' subscribed: {}", nameFragment, subscribed);
        return subscribed;
    }

    // ── Package detail ────────────────────────────────────────────────────────

    /**
     * Returns the description text for the add-on card at the given 0-based index.
     *
     * @param index 0-based card index
     * @return description string, or {@code ""} if out of range or text is absent
     */
    public String getAddOnDescription(int index) {
        if (index >= addOnDescriptions.size()) return "";
        return addOnDescriptions.get(index).getText().trim();
    }

    /**
     * Clicks the add-on card at the given 0-based index to open its detail view
     * or subscription flow.
     *
     * <p><b>Billing warning:</b> if this card's CTA is a Subscribe button, clicking
     * it may initiate a real purchase. Prefer {@link #clickManageForAddOn(int)} for
     * already-subscribed packages.
     *
     * @param index 0-based add-on card index
     * @return this {@link AddOnsPage} for method chaining
     */
    public AddOnsPage clickAddOnCard(int index) {
        if (index >= addOnCards.size()) {
            log.warn("Add-on card index {} out of range ({} cards)", index, addOnCards.size());
            return this;
        }
        log.info("Clicking add-on card [{}]: '{}'",
                index, addOnTitles.size() > index ? addOnTitles.get(index).getText().trim() : "?");
        scrollIntoView(addOnCards.get(index));
        jsClick(addOnCards.get(index));
        return this;
    }

    /**
     * Clicks the "Manage" button for the add-on at the given 0-based index.
     * Use this to access cancellation or modification options for an existing
     * subscription.
     *
     * @param index 0-based manage-button index
     * @return this {@link AddOnsPage} for method chaining
     */
    public AddOnsPage clickManageForAddOn(int index) {
        if (index >= manageButtons.size()) {
            log.warn("Manage button index {} out of range ({} buttons)", index, manageButtons.size());
            return this;
        }
        log.info("Clicking Manage for add-on [{}]", index);
        click(manageButtons.get(index));
        return this;
    }

    /**
     * Returns the page heading text (e.g. "Add-Ons").
     *
     * @return heading string, or {@code ""} if absent
     */
    public String getPageHeading() {
        try { return pageHeading.getText().trim(); } catch (Exception e) { return ""; }
    }

    /**
     * Returns whether the empty/unavailable state is displayed.
     *
     * @return {@code true} if no add-ons are available for this account
     */
    public boolean isEmptyState() {
        return isDisplayed(emptyState);
    }

    /**
     * Captures a screenshot of the Add-Ons page.
     *
     * @param name label prepended to the filename
     */
    public void captureScreenshot(String name) {
        takeScreenshot("add-ons-" + name);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Waits up to 10 seconds for add-on cards or the empty-state element to appear.
     */
    private void waitForPageToSettle() {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        for (int i = 0; i < 10; i++) {
            Long n = (Long) js.executeScript(
                    "return document.querySelectorAll("
                    + "  '[class*=\"addon-card\"],[class*=\"package-card\"],"
                    + "  [class*=\"plan-card\"],[class*=\"empty\"]').length;");
            if (n != null && n > 0) { log.debug("Add-Ons page settled after {}s", i); return; }
            try { Thread.sleep(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
        }
        log.warn("Add-Ons page did not settle within 10s");
    }
}
