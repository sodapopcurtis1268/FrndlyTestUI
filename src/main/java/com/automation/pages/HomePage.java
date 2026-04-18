package com.automation.pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

public class HomePage extends BasePage {

    // "Log In" link in the top navigation of try.frndlytv.com
    @FindBy(xpath = "//a[normalize-space(text())='Log In' or normalize-space(text())='Sign In']"
            + " | //button[normalize-space(text())='Log In' or normalize-space(text())='Sign In']")
    private WebElement loginButton;

    public HomePage(WebDriver driver) {
        super(driver);
    }

    public FrndlyLoginPage clickLogin() {
        click(loginButton);
        return new FrndlyLoginPage(driver);
    }
}
