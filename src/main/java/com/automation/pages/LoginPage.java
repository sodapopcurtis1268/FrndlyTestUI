package com.automation.pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

/**
 * Page Object for a generic login page with standard username/password/button elements.
 *
 * <p>This is a general-purpose page object used by {@link com.automation.tests.LoginTest}
 * for positive and negative credential validation. Unlike {@link FrndlyLoginPage}, it
 * uses standard {@code sendKeys()} because it is not tied to an Angular reactive form.
 *
 * <p>Update the locators ({@code id="username"}, etc.) if the target application uses
 * different attributes.
 */
public class LoginPage extends BasePage {

    /** Username / email input field, located by {@code id="username"}. */
    @FindBy(id = "username")
    private WebElement usernameField;

    /** Password input field, located by {@code id="password"}. */
    @FindBy(id = "password")
    private WebElement passwordField;

    /** Submit / login button, located by {@code id="login-button"}. */
    @FindBy(id = "login-button")
    private WebElement loginButton;

    /** Inline error message shown after a failed login attempt. */
    @FindBy(css = ".error-message")
    private WebElement errorMessage;

    /**
     * Constructs the page and initialises {@code @FindBy} locators.
     *
     * @param driver the active WebDriver session
     */
    public LoginPage(WebDriver driver) {
        super(driver);
    }

    /**
     * Clears and types the given username into the username field.
     *
     * @param username the username or email to enter
     */
    public void enterUsername(String username) {
        type(usernameField, username);
    }

    /**
     * Clears and types the given password into the password field.
     *
     * @param password the password to enter
     */
    public void enterPassword(String password) {
        type(passwordField, password);
    }

    /**
     * Clicks the login / submit button.
     */
    public void clickLogin() {
        click(loginButton);
    }

    /**
     * Convenience method that fills both fields and clicks the login button.
     *
     * @param username the username or email
     * @param password the password
     */
    public void login(String username, String password) {
        enterUsername(username);
        enterPassword(password);
        clickLogin();
    }

    /**
     * Returns the text content of the inline error message element.
     *
     * @return error message text
     */
    public String getErrorMessage() {
        return getText(errorMessage);
    }

    /**
     * Returns whether the inline error message is currently displayed.
     *
     * @return {@code true} if the error element is visible
     */
    public boolean isErrorDisplayed() {
        return isDisplayed(errorMessage);
    }
}
