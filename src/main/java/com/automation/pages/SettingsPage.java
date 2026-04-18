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
 * Page Object for the Frndly TV settings page ({@code watch.frndlytv.com/settings}).
 *
 * <p>The settings page is a single scrollable page divided into several sections:
 * <ul>
 *   <li><b>Account</b> — display name, email address, password change</li>
 *   <li><b>Subscription / Plan</b> — current plan name, billing cycle, upgrade/downgrade</li>
 *   <li><b>Payment</b> — payment method on file, update card</li>
 *   <li><b>Notifications</b> — email and push notification toggles</li>
 *   <li><b>Parental Controls</b> — PIN setup, content rating restrictions</li>
 *   <li><b>Video Quality</b> — streaming quality selector</li>
 *   <li><b>Devices</b> — list of registered/logged-in devices, remove device</li>
 *   <li><b>Sign Out</b> — ends the session and redirects to {@code /authenticator}</li>
 * </ul>
 *
 * <p>The page is reached by clicking the gear icon in the dashboard header
 * ({@link DashboardPage#clickSettingsWheel()}).
 *
 * <p><b>Locator note:</b> verify CSS class names against the live DOM at
 * {@code watch.frndlytv.com/settings} if any {@code @FindBy} lookups fail.
 */
public class SettingsPage extends BasePage {

    private static final Logger log = LogManager.getLogger(SettingsPage.class);

    /** URL of this page — used by {@link #navigateTo()} and URL assertions. */
    public static final String URL = "https://watch.frndlytv.com/settings";

    // ── Account section ───────────────────────────────────────────────────────

    /**
     * Displayed account name / profile name label.
     */
    @FindBy(css = "[class*='account-name'], [class*='profile-name'], "
            + "[class*='user-name'], [class*='display-name']")
    private WebElement accountNameLabel;

    /**
     * Displayed email address label.
     */
    @FindBy(css = "[class*='account-email'], [class*='user-email'], "
            + "[class*='email-address'], input[type='email'][disabled]")
    private WebElement emailLabel;

    /**
     * "Change Password" / "Edit Password" button or link.
     */
    @FindBy(css = "button[class*='change-password'], a[class*='change-password'], "
            + "button[aria-label*='password' i], [class*='password'] button, "
            + "[class*='password'] a")
    private WebElement changePasswordButton;

    /**
     * "Edit" / "Update" button for the account name or profile.
     */
    @FindBy(css = "button[class*='edit-profile'], button[class*='edit-account'], "
            + "[class*='account'] button[class*='edit'], "
            + "button[aria-label*='edit profile' i]")
    private WebElement editProfileButton;

    // ── Subscription / Plan section ───────────────────────────────────────────

    /**
     * Current plan name label (e.g. "Basic Plan", "Premium").
     */
    @FindBy(css = "[class*='plan-name'], [class*='subscription-name'], "
            + "[class*='current-plan'], [class*='plan'] [class*='name']")
    private WebElement currentPlanLabel;

    /**
     * Billing cycle / renewal date label (e.g. "Renews on May 1, 2026").
     */
    @FindBy(css = "[class*='renewal'], [class*='billing-date'], [class*='next-billing'], "
            + "[class*='plan'] [class*='date'], [class*='subscription'] [class*='date']")
    private WebElement renewalDateLabel;

    /**
     * "Upgrade Plan" / "Change Plan" button.
     */
    @FindBy(css = "button[class*='upgrade'], button[class*='change-plan'], "
            + "a[class*='upgrade'], a[class*='change-plan'], "
            + "button[aria-label*='upgrade' i], button[aria-label*='change plan' i]")
    private WebElement upgradePlanButton;

    /**
     * "Cancel Subscription" button or link.
     * <b>Caution:</b> clicking this on a real account will initiate cancellation.
     */
    @FindBy(css = "button[class*='cancel-subscription'], a[class*='cancel-subscription'], "
            + "button[aria-label*='cancel subscription' i], [class*='subscription'] [class*='cancel']")
    private WebElement cancelSubscriptionButton;

    // ── Payment section ───────────────────────────────────────────────────────

    /**
     * Payment method summary label (e.g. "Visa ending in 4242").
     */
    @FindBy(css = "[class*='payment-method'], [class*='card-info'], "
            + "[class*='billing'] [class*='card'], [class*='payment'] [class*='info']")
    private WebElement paymentMethodLabel;

    /**
     * "Update Payment" / "Change Card" button.
     */
    @FindBy(css = "button[class*='update-payment'], button[class*='update-card'], "
            + "button[aria-label*='update payment' i], button[aria-label*='change card' i], "
            + "[class*='payment'] button[class*='edit']")
    private WebElement updatePaymentButton;

    // ── Notification section ──────────────────────────────────────────────────

    /**
     * All notification toggle switches on the page (email, push, marketing, etc.).
     */
    @FindBy(css = "[class*='notification'] input[type='checkbox'], "
            + "[class*='notification'] [role='switch'], "
            + "[class*='toggle'][class*='notification']")
    private List<WebElement> notificationToggles;

    /**
     * Labels for notification toggle switches.
     */
    @FindBy(css = "[class*='notification'] label, [class*='notification'] [class*='label']")
    private List<WebElement> notificationLabels;

    // ── Parental Controls section ─────────────────────────────────────────────

    /**
     * "Set PIN" / "Change PIN" button for parental controls.
     */
    @FindBy(css = "button[class*='parental'], button[class*='set-pin'], "
            + "button[class*='change-pin'], button[aria-label*='parental' i], "
            + "[class*='parental'] button")
    private WebElement parentalControlButton;

    /**
     * Content rating / maturity restriction selector (e.g. dropdown or radio buttons).
     */
    @FindBy(css = "[class*='content-rating'], [class*='maturity'], "
            + "[class*='parental'] select, [class*='rating'] select")
    private WebElement contentRatingSelector;

    // ── Video Quality section ─────────────────────────────────────────────────

    /**
     * Video / streaming quality selector (e.g. "Auto", "HD", "SD").
     */
    @FindBy(css = "[class*='video-quality'] select, [class*='streaming-quality'] select, "
            + "[class*='quality'] select, select[aria-label*='quality' i]")
    private WebElement videoQualitySelector;

    /**
     * Currently selected video quality label.
     */
    @FindBy(css = "[class*='video-quality'] [class*='selected'], "
            + "[class*='quality'] [class*='current'], [class*='quality'] [class*='active']")
    private WebElement selectedQualityLabel;

    // ── Devices section ───────────────────────────────────────────────────────

    /**
     * All registered/logged-in device entries.
     */
    @FindBy(css = "[class*='device-item'], [class*='device-card'], "
            + "[class*='registered-device'], [class*='logged-device']")
    private List<WebElement> deviceItems;

    /**
     * "Remove" / "Sign Out" buttons — one per device entry.
     */
    @FindBy(css = "[class*='device-item'] button[class*='remove'], "
            + "[class*='device-item'] button[class*='sign-out'], "
            + "[class*='device-card'] button[class*='remove'], "
            + "[class*='device'] button[aria-label*='remove' i]")
    private List<WebElement> removeDeviceButtons;

    // ── Sign Out ──────────────────────────────────────────────────────────────

    /**
     * "Sign Out" button. Located by exact button text, confirmed via DOM inspection.
     */
    @FindBy(xpath = "//button[normalize-space(text())='Sign Out']")
    private WebElement signOutButton;

    // ── Section headings (for navigation / verification) ──────────────────────

    /**
     * All section heading elements on the settings page. Used to verify that
     * expected sections are present.
     */
    @FindBy(css = "[class*='settings'] h2, [class*='settings'] h3, "
            + "[class*='section-title'], [class*='section-header']")
    private List<WebElement> sectionHeadings;

    // ── Constructor ───────────────────────────────────────────────────────────

    /**
     * Constructs the page and initialises all {@code @FindBy} locators.
     *
     * @param driver the active WebDriver session
     */
    public SettingsPage(WebDriver driver) {
        super(driver);
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    /**
     * Navigates directly to {@value #URL} and waits for the page to load.
     *
     * @return this {@link SettingsPage} for method chaining
     */
    public SettingsPage navigateTo() {
        log.info("Navigating to Settings page");
        driver.navigate().to(URL);
        waitForUrlContaining("settings");
        waitForPageToSettle();
        return this;
    }

    // ── Account ───────────────────────────────────────────────────────────────

    /**
     * Returns the displayed account / profile name.
     *
     * @return account name string, or {@code ""} if not found
     */
    public String getAccountName() {
        try {
            String name = accountNameLabel.getText().trim();
            log.info("Account name: '{}'", name);
            return name;
        } catch (Exception e) {
            log.warn("Account name label not found");
            return "";
        }
    }

    /**
     * Returns the email address shown in the account section.
     *
     * @return email string, or {@code ""} if not found
     */
    public String getEmail() {
        try {
            // Email may be an input[disabled] — use value attribute as fallback
            String text = emailLabel.getText().trim();
            if (text.isEmpty()) text = emailLabel.getAttribute("value");
            log.info("Account email: '{}'", text);
            return text != null ? text.trim() : "";
        } catch (Exception e) {
            log.warn("Email label not found");
            return "";
        }
    }

    /**
     * Clicks the "Change Password" button to open the password-update flow.
     *
     * @return this {@link SettingsPage} for method chaining
     */
    public SettingsPage clickChangePassword() {
        log.info("Clicking Change Password");
        scrollIntoView(changePasswordButton);
        click(changePasswordButton);
        return this;
    }

    /**
     * Clicks the "Edit Profile" / "Edit Account" button.
     *
     * @return this {@link SettingsPage} for method chaining
     */
    public SettingsPage clickEditProfile() {
        log.info("Clicking Edit Profile");
        scrollIntoView(editProfileButton);
        click(editProfileButton);
        return this;
    }

    // ── Subscription / Plan ───────────────────────────────────────────────────

    /**
     * Returns the name of the current subscription plan.
     *
     * @return plan name string, or {@code ""} if not found
     */
    public String getCurrentPlan() {
        try {
            String plan = currentPlanLabel.getText().trim();
            log.info("Current plan: '{}'", plan);
            return plan;
        } catch (Exception e) {
            log.warn("Current plan label not found");
            return "";
        }
    }

    /**
     * Returns the renewal / next-billing date text.
     *
     * @return renewal date string, or {@code ""} if not found
     */
    public String getRenewalDate() {
        try {
            String date = renewalDateLabel.getText().trim();
            log.info("Renewal date: '{}'", date);
            return date;
        } catch (Exception e) {
            log.warn("Renewal date label not found");
            return "";
        }
    }

    /**
     * Clicks the "Upgrade Plan" / "Change Plan" button.
     *
     * @return this {@link SettingsPage} for method chaining
     */
    public SettingsPage clickUpgradePlan() {
        log.info("Clicking Upgrade Plan");
        scrollIntoView(upgradePlanButton);
        click(upgradePlanButton);
        return this;
    }

    // ── Payment ───────────────────────────────────────────────────────────────

    /**
     * Returns the payment method summary text (e.g. "Visa ending in 4242").
     *
     * @return payment method string, or {@code ""} if not found
     */
    public String getPaymentMethod() {
        try {
            String method = paymentMethodLabel.getText().trim();
            log.info("Payment method: '{}'", method);
            return method;
        } catch (Exception e) {
            log.warn("Payment method label not found");
            return "";
        }
    }

    /**
     * Clicks the "Update Payment" / "Change Card" button.
     *
     * @return this {@link SettingsPage} for method chaining
     */
    public SettingsPage clickUpdatePayment() {
        log.info("Clicking Update Payment");
        scrollIntoView(updatePaymentButton);
        click(updatePaymentButton);
        return this;
    }

    // ── Notifications ─────────────────────────────────────────────────────────

    /**
     * Returns the labels of all notification toggles on the page.
     *
     * @return list of notification label strings
     */
    public List<String> getNotificationLabels() {
        List<String> labels = notificationLabels.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.info("Notification toggles: {}", labels);
        return labels;
    }

    /**
     * Returns the number of notification toggle switches on the page.
     *
     * @return toggle count
     */
    public int getNotificationToggleCount() {
        return notificationToggles.size();
    }

    /**
     * Clicks the notification toggle at the given 0-based index.
     *
     * @param index 0-based toggle index
     * @return this {@link SettingsPage} for method chaining
     */
    public SettingsPage clickNotificationToggle(int index) {
        if (index >= notificationToggles.size()) {
            log.warn("Notification toggle index {} out of range ({} toggles)", index, notificationToggles.size());
            return this;
        }
        log.info("Clicking notification toggle [{}]", index);
        jsClick(notificationToggles.get(index));
        return this;
    }

    // ── Parental Controls ─────────────────────────────────────────────────────

    /**
     * Clicks the "Set PIN" / "Change PIN" parental controls button.
     *
     * @return this {@link SettingsPage} for method chaining
     */
    public SettingsPage clickParentalControls() {
        log.info("Clicking Parental Controls");
        scrollIntoView(parentalControlButton);
        click(parentalControlButton);
        return this;
    }

    // ── Video Quality ─────────────────────────────────────────────────────────

    /**
     * Returns the currently selected video quality label, if visible.
     *
     * @return quality string (e.g. {@code "Auto"}, {@code "HD"}), or {@code ""} if absent
     */
    public String getSelectedVideoQuality() {
        try {
            String quality = selectedQualityLabel.getText().trim();
            log.info("Selected video quality: '{}'", quality);
            return quality;
        } catch (Exception e) {
            log.warn("Video quality label not found");
            return "";
        }
    }

    // ── Devices ───────────────────────────────────────────────────────────────

    /**
     * Returns the number of devices currently registered / logged in.
     *
     * @return device count
     */
    public int getDeviceCount() {
        int count = deviceItems.size();
        log.info("Registered devices: {}", count);
        return count;
    }

    /**
     * Returns the text of all device entries (device name, type, last active).
     *
     * @return list of device summary strings
     */
    public List<String> getDeviceNames() {
        List<String> names = deviceItems.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.info("Devices: {}", names);
        return names;
    }

    /**
     * Clicks the "Remove" button for the device at the given 0-based index.
     *
     * @param index 0-based device index
     * @return this {@link SettingsPage} for method chaining
     */
    public SettingsPage removeDeviceAtIndex(int index) {
        if (index >= removeDeviceButtons.size()) {
            log.warn("Remove device button index {} out of range ({} buttons)", index, removeDeviceButtons.size());
            return this;
        }
        log.info("Removing device [{}]", index);
        click(removeDeviceButtons.get(index));
        return this;
    }

    // ── Section headings ──────────────────────────────────────────────────────

    /**
     * Returns the text of all section headings on the settings page.
     * Useful for verifying expected sections are present.
     *
     * @return list of section heading strings
     */
    public List<String> getSectionHeadings() {
        List<String> headings = sectionHeadings.stream()
                .map(WebElement::getText)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
        log.info("Settings sections: {}", headings);
        return headings;
    }

    // ── Sign Out ──────────────────────────────────────────────────────────────

    /**
     * Scrolls the "Sign Out" button into view, clicks it, and waits for the
     * resulting redirect to {@code /authenticator}.
     *
     * <p>Sign Out triggers an Angular router transition; this method blocks until
     * the URL change is confirmed so callers can safely assert on the final URL.
     */
    public void scrollToAndClickSignOut() {
        log.info("Clicking Sign Out");
        scrollIntoView(signOutButton);
        click(signOutButton);
        waitForUrlContaining("authenticator");
        log.info("Signed out — redirected to authenticator");
    }

    /**
     * Captures a screenshot of the settings page.
     *
     * @param name label prepended to the filename
     */
    public void captureScreenshot(String name) {
        takeScreenshot("settings-" + name);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Waits up to 10 seconds for the settings page content to appear.
     */
    private void waitForPageToSettle() {
        JavascriptExecutor js = (JavascriptExecutor) driver;
        for (int i = 0; i < 10; i++) {
            Long n = (Long) js.executeScript(
                    "return document.querySelectorAll("
                    + "  '//button[normalize-space(text())=\"Sign Out\"], "
                    + "  [class*=\"settings\"], [class*=\"account\"]').length;");
            // Also accept if Sign Out button is in DOM via XPath check
            try {
                if (signOutButton.isDisplayed()) {
                    log.debug("Settings page settled after {}s", i);
                    return;
                }
            } catch (Exception ignored) {}
            try { Thread.sleep(1000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
        }
        log.warn("Settings page did not settle within 10s");
    }
}
