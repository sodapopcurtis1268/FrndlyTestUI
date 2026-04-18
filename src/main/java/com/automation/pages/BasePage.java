package com.automation.pages;

import com.automation.utils.WaitUtils;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.PageFactory;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

public abstract class BasePage {

    protected WebDriver driver;
    protected WaitUtils wait;

    public BasePage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WaitUtils(driver);
        PageFactory.initElements(driver, this);
    }

    protected void click(WebElement element) {
        wait.waitForClickable(element).click();
    }

    protected void type(WebElement element, String text) {
        wait.waitForVisible(element).clear();
        element.sendKeys(text);
    }

    protected String getText(WebElement element) {
        return wait.waitForVisible(element).getText();
    }

    protected boolean isDisplayed(WebElement element) {
        try {
            return element.isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    public String getTitle() {
        return driver.getTitle();
    }

    public String getCurrentUrl() {
        return driver.getCurrentUrl();
    }

    protected void scrollIntoView(WebElement element) {
        ((JavascriptExecutor) driver).executeScript(
                "arguments[0].scrollIntoView({block:'center'});", element);
    }

    /**
     * Types into an Angular reactive-form input using the native HTMLInputElement value
     * setter so that Angular's change-detection fires (plain sendKeys() is not always
     * picked up by Angular's (ngModel) / FormControl bindings).
     */
    protected void typeAngular(WebElement element, String text) {
        wait.waitForVisible(element);
        ((JavascriptExecutor) driver).executeScript(
                "var setter = Object.getOwnPropertyDescriptor("
                + "    window.HTMLInputElement.prototype, 'value').set;"
                + "setter.call(arguments[0], arguments[1]);"
                + "arguments[0].dispatchEvent(new Event('input',  {bubbles:true}));"
                + "arguments[0].dispatchEvent(new Event('change', {bubbles:true}));",
                element, text);
    }

    /**
     * Dispatches a full MouseEvent click on an element.  Use instead of click() when
     * the element lives inside an Angular carousel page that has display:none applied
     * by the slider — the DOM event still reaches Angular's (click) listener.
     */
    protected void jsClick(WebElement element) {
        ((JavascriptExecutor) driver).executeScript(
                "arguments[0].dispatchEvent("
                + "  new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));",
                element);
    }

    /** Waits up to 30 s for the current URL to contain the given fragment. */
    protected void waitForUrlContaining(String fragment) {
        new WebDriverWait(driver, Duration.ofSeconds(30))
                .until(ExpectedConditions.urlContains(fragment));
    }

    protected void takeScreenshot(String name) {
        File src = ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);
        try {
            Path dest = Path.of("screenshots", name + "-" + System.currentTimeMillis() + ".png");
            Files.createDirectories(dest.getParent());
            Files.copy(src.toPath(), dest);
            System.out.println("Screenshot saved: " + dest.toAbsolutePath());
        } catch (IOException e) {
            System.err.println("Failed to save screenshot: " + e.getMessage());
        }
    }
}
