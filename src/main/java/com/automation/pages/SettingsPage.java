package com.automation.pages;

import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.FindBy;

public class SettingsPage extends BasePage {

    // Confirmed via DOM inspection on watch.frndlytv.com/settings
    @FindBy(xpath = "//button[normalize-space(text())='Sign Out']")
    private WebElement signOutButton;

    public SettingsPage(WebDriver driver) {
        super(driver);
    }

    public void scrollToAndClickSignOut() {
        scrollIntoView(signOutButton);
        click(signOutButton);
        // Sign Out redirects to /authenticator via Angular router; wait for the URL change.
        waitForUrlContaining("authenticator");
    }
}
