package com.automation.pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

/**
 * Page Object for the Frndly TV marketing / landing page ({@code try.frndlytv.com}).
 *
 * <p>This is the entry point for unauthenticated users. Its sole responsibility in
 * this framework is to locate the "Log In" / "Sign In" call-to-action and navigate
 * to the authentication page.
 */
public class HomePage extends BasePage {

    /**
     * "Log In" or "Sign In" element in the top navigation.
     * The XPath handles both link ({@code <a>}) and button ({@code <button>}) variants
     * as well as both label strings, so it remains valid if the site A/B-tests the copy.
     */
    @FindBy(xpath = "//a[normalize-space(text())='Log In' or normalize-space(text())='Sign In']"
            + " | //button[normalize-space(text())='Log In' or normalize-space(text())='Sign In']")
    private WebElement loginButton;

    /**
     * Constructs the page and initialises {@code @FindBy} locators.
     *
     * @param driver the active WebDriver session
     */
    public HomePage(WebDriver driver) {
        super(driver);
    }

    /**
     * Clicks the "Log In" / "Sign In" button and returns the resulting login page.
     *
     * @return {@link FrndlyLoginPage} representing the authenticator page
     */
    public FrndlyLoginPage clickLogin() {
        click(loginButton);
        return new FrndlyLoginPage(driver);
    }
}
