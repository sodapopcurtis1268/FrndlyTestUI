package com.automation.utils;

import com.automation.config.ConfigReader;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

/**
 * Thin wrapper around {@link WebDriverWait} that provides named, readable wait methods
 * for common element conditions.
 *
 * <p>The timeout is driven by the {@code explicit.wait} key in
 * {@code config.properties} (via {@link ConfigReader#getExplicitWait()}), so it can
 * be tuned globally without touching test code.
 *
 * <p>Every method blocks until the condition is met or the timeout expires, at which
 * point Selenium throws a {@link org.openqa.selenium.TimeoutException}.
 */
public class WaitUtils {

    private final WebDriverWait wait;

    /**
     * Constructs a {@code WaitUtils} using the explicit-wait timeout from config.
     *
     * @param driver the WebDriver instance to attach the wait to
     */
    public WaitUtils(WebDriver driver) {
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(ConfigReader.getExplicitWait()));
    }

    /**
     * Waits until {@code element} is present in the DOM and visible on screen.
     *
     * @param element the target element (may be a PageFactory proxy)
     * @return the same element, now guaranteed visible
     */
    public WebElement waitForVisible(WebElement element) {
        return wait.until(ExpectedConditions.visibilityOf(element));
    }

    /**
     * Waits until {@code element} is visible and enabled (i.e. interactable).
     *
     * @param element the target element
     * @return the same element, now guaranteed clickable
     */
    public WebElement waitForClickable(WebElement element) {
        return wait.until(ExpectedConditions.elementToBeClickable(element));
    }

    /**
     * Waits until an element matching {@code locator} exists in the DOM
     * (it does not need to be visible).
     *
     * @param locator the {@link By} strategy to locate the element
     * @return the first matching element
     */
    public WebElement waitForPresence(By locator) {
        return wait.until(ExpectedConditions.presenceOfElementLocated(locator));
    }

    /**
     * Waits until {@code element} is no longer visible (or is removed from the DOM).
     *
     * @param element the element expected to disappear
     * @return {@code true} once the element is invisible
     */
    public boolean waitForInvisibility(WebElement element) {
        return wait.until(ExpectedConditions.invisibilityOf(element));
    }
}
