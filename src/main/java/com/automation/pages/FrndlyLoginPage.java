package com.automation.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

/**
 * Page Object for the Frndly TV authenticator page
 * ({@code watch.frndlytv.com/authenticator}).
 *
 * <p>This page uses an Angular reactive form. Several non-obvious interactions are
 * required to log in successfully:
 * <ol>
 *   <li><b>Wait for the email field</b> — the Angular template renders asynchronously
 *       after the SPA router transition; the field may not exist immediately.</li>
 *   <li><b>Sleep 2 s after field appears</b> — the Angular auth-service fires
 *       background HTTP requests (CSRF token, config fetch) after DOMContentLoaded.
 *       Submitting the form before those requests complete causes a silent server-side
 *       rejection with no visible error. Confirmed via DiagnosticTest: login fails at
 *       0 ms, succeeds at 2 000 ms.</li>
 *   <li><b>Use {@code typeAngular()}</b> — plain {@code sendKeys()} bypasses the native
 *       HTMLInputElement setter, so Angular's FormControl does not register the value
 *       and the submit button stays disabled.</li>
 *   <li><b>Fresh element lookup for submit</b> — the PageFactory proxy for
 *       {@code signInButton} can go stale after the reactive-form updates the DOM;
 *       a fresh {@code driver.findElement()} avoids a StaleElementReferenceException.</li>
 * </ol>
 */
public class FrndlyLoginPage extends BasePage {

    /** Email address input field bound to Angular's reactive form. */
    @FindBy(css = "input[type='email']")
    private WebElement emailField;

    /** Password input field bound to Angular's reactive form. */
    @FindBy(css = "input[type='password']")
    private WebElement passwordField;

    /**
     * Submit button. Starts disabled (Angular form validation) and becomes enabled
     * only after both fields contain valid values via the native setter.
     * A fresh lookup is used at click time to avoid stale proxy issues.
     */
    @FindBy(css = "button[type='submit']")
    private WebElement signInButton;

    /**
     * Constructs the page and initialises {@code @FindBy} locators.
     *
     * @param driver the active WebDriver session
     */
    public FrndlyLoginPage(WebDriver driver) {
        super(driver);
    }

    /**
     * Fills the login form and submits it, waiting for the dashboard URL on success.
     *
     * @param email    the account email address
     * @param password the account password
     * @return {@link DashboardPage} once the browser has navigated to {@code /home}
     */
    public DashboardPage login(String email, String password) {
        wait.waitForVisible(emailField);

        // Allow Angular's auth-service bootstrap requests to complete before submitting.
        try { Thread.sleep(2000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }

        typeAngular(emailField, email);
        typeAngular(passwordField, password);

        // Fresh lookup avoids a stale PageFactory proxy reference on the submit button.
        driver.findElement(By.cssSelector("button[type='submit']")).click();
        waitForUrlContaining("home");
        return new DashboardPage(driver);
    }
}
