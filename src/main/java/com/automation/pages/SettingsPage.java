package com.automation.pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

/**
 * Page Object for the Frndly TV settings page ({@code watch.frndlytv.com/settings}).
 *
 * <p>The settings page is reached by clicking the gear wheel icon in the dashboard
 * header. It contains account-management controls including the Sign Out button.
 */
public class SettingsPage extends BasePage {

    /**
     * "Sign Out" button. Located by exact button text, confirmed via DOM inspection on
     * watch.frndlytv.com/settings.
     */
    @FindBy(xpath = "//button[normalize-space(text())='Sign Out']")
    private WebElement signOutButton;

    /**
     * Constructs the page and initialises {@code @FindBy} locators.
     *
     * @param driver the active WebDriver session
     */
    public SettingsPage(WebDriver driver) {
        super(driver);
    }

    /**
     * Scrolls the "Sign Out" button into view, clicks it, and waits for the resulting
     * redirect to the authenticator page.
     *
     * <p>Sign Out triggers an Angular router transition to {@code /authenticator};
     * the method blocks until the URL change is confirmed, ensuring the caller can
     * safely assert on the final URL.
     */
    public void scrollToAndClickSignOut() {
        scrollIntoView(signOutButton);
        click(signOutButton);
        // Sign Out redirects to /authenticator via Angular router; wait for the URL change.
        waitForUrlContaining("authenticator");
    }
}
