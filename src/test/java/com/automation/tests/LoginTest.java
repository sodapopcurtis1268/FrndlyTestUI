package com.automation.tests;

import com.automation.base.BaseTest;
import com.automation.pages.LoginPage;
import org.testng.Assert;
import org.testng.annotations.Test;

/**
 * Tests for the generic login page ({@link LoginPage}).
 *
 * <p>These tests target a standard username/password login form and are intended as
 * template examples. Update the credential values and post-login assertions to match
 * the target application before running.
 *
 * <p>Both tests are registered in {@code testng.xml} under the "Login Tests" group.
 */
public class LoginTest extends BaseTest {

    /**
     * Verifies that submitting valid credentials navigates away from the login page.
     *
     * <p><b>Pre-condition:</b> the driver is at the base URL (set by {@code @BeforeMethod}).
     * <p><b>Expected:</b> the URL after login differs from the login page URL.
     */
    @Test(description = "Verify successful login with valid credentials")
    public void testValidLogin() {
        LoginPage loginPage = new LoginPage(driver);
        loginPage.login("valid_user@example.com", "valid_password");
        // Assert post-login state — update with your app's expected URL/title
        Assert.assertNotEquals(driver.getCurrentUrl(), "https://example.com/login",
                "Should have navigated away from login page");
    }

    /**
     * Verifies that submitting invalid credentials displays an inline error message.
     *
     * <p><b>Pre-condition:</b> the driver is at the base URL.
     * <p><b>Expected:</b> the login page shows an error element after submission.
     */
    @Test(description = "Verify error shown with invalid credentials")
    public void testInvalidLogin() {
        LoginPage loginPage = new LoginPage(driver);
        loginPage.login("invalid@example.com", "wrongpassword");
        Assert.assertTrue(loginPage.isErrorDisplayed(), "Error message should be displayed");
    }
}
