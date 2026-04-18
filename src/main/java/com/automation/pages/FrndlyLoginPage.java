package com.automation.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

public class FrndlyLoginPage extends BasePage {

    @FindBy(css = "input[type='email']")
    private WebElement emailField;

    @FindBy(css = "input[type='password']")
    private WebElement passwordField;

    @FindBy(css = "button[type='submit']")
    private WebElement signInButton;

    public FrndlyLoginPage(WebDriver driver) {
        super(driver);
    }

    public DashboardPage login(String email, String password) {
        // Wait for the email field to appear (Angular template rendered).
        wait.waitForVisible(emailField);

        // The Angular app fires background init requests (auth-service bootstrap,
        // token fetch, etc.) after DOMContentLoaded.  Submitting the form before
        // those requests complete causes a silent server-side rejection.
        // Waiting 2 s is the minimum window that lets these requests settle —
        // confirmed via DiagnosticTest (login fails at 0 ms, succeeds at 2000 ms).
        try { Thread.sleep(2000); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }

        // Use typeAngular() so Angular's reactive-form model picks up the values.
        typeAngular(emailField, email);
        typeAngular(passwordField, password);

        // Fresh lookup — avoids stale PageFactory proxy reference for the submit.
        driver.findElement(By.cssSelector("button[type='submit']")).click();
        waitForUrlContaining("home");
        return new DashboardPage(driver);
    }
}
