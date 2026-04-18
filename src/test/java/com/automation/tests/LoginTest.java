package com.automation.tests;

import com.automation.base.BaseTest;
import com.automation.pages.LoginPage;
import org.testng.Assert;
import org.testng.annotations.Test;

public class LoginTest extends BaseTest {

    @Test(description = "Verify successful login with valid credentials")
    public void testValidLogin() {
        LoginPage loginPage = new LoginPage(driver);
        loginPage.login("valid_user@example.com", "valid_password");
        // Assert post-login state — update with your app's expected URL/title
        Assert.assertNotEquals(driver.getCurrentUrl(), "https://example.com/login",
                "Should have navigated away from login page");
    }

    @Test(description = "Verify error shown with invalid credentials")
    public void testInvalidLogin() {
        LoginPage loginPage = new LoginPage(driver);
        loginPage.login("invalid@example.com", "wrongpassword");
        Assert.assertTrue(loginPage.isErrorDisplayed(), "Error message should be displayed");
    }
}
