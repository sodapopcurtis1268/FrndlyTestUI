package com.automation.pages;

import com.automation.utils.WaitUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
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

/**
 * Abstract base class for all Page Object classes in this framework.
 *
 * <p>Provides a library of protected helper methods that concrete page classes can
 * call instead of interacting with Selenium APIs directly. Centralising these helpers
 * here means changes to waiting strategy, screenshot behaviour, or Angular-specific
 * click logic only need to be made in one place.
 *
 * <p>Every subclass must call {@code super(driver)} in its constructor so that
 * {@link PageFactory#initElements} wires up {@code @FindBy} locators and
 * {@link WaitUtils} is initialised.
 */
public abstract class BasePage {

    private static final Logger log = LogManager.getLogger(BasePage.class);

    /** The active WebDriver session shared with all helper methods and subclasses. */
    protected WebDriver driver;

    /** Pre-configured explicit-wait helper, timeout driven by {@code config.properties}. */
    protected WaitUtils wait;

    /**
     * Initialises the page: stores the driver, creates {@link WaitUtils}, and
     * initialises all {@code @FindBy} proxy fields via {@link PageFactory}.
     *
     * @param driver the active WebDriver session
     */
    public BasePage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WaitUtils(driver);
        PageFactory.initElements(driver, this);
    }

    /**
     * Waits for {@code element} to be clickable, then clicks it.
     *
     * @param element the target element
     */
    protected void click(WebElement element) {
        wait.waitForClickable(element).click();
    }

    /**
     * Waits for {@code element} to be visible, clears any existing text, then types
     * {@code text} using standard Selenium {@code sendKeys}.
     *
     * <p>Use {@link #typeAngular(WebElement, String)} instead when the field is bound
     * to an Angular reactive form — {@code sendKeys} is not always picked up by Angular's
     * change-detection.
     *
     * @param element the input field
     * @param text    the text to enter
     */
    protected void type(WebElement element, String text) {
        wait.waitForVisible(element).clear();
        element.sendKeys(text);
    }

    /**
     * Waits for {@code element} to be visible and returns its visible text content.
     *
     * @param element the target element
     * @return the trimmed text as returned by {@link WebElement#getText()}
     */
    protected String getText(WebElement element) {
        return wait.waitForVisible(element).getText();
    }

    /**
     * Checks whether {@code element} is currently displayed without throwing if it is
     * stale or absent.
     *
     * @param element the element to probe
     * @return {@code true} if visible; {@code false} on any exception
     */
    protected boolean isDisplayed(WebElement element) {
        try {
            return element.isDisplayed();
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Returns the current page {@code <title>} text.
     *
     * @return page title
     */
    public String getTitle() {
        return driver.getTitle();
    }

    /**
     * Returns the URL shown in the browser address bar.
     *
     * @return current URL string
     */
    public String getCurrentUrl() {
        return driver.getCurrentUrl();
    }

    /**
     * Scrolls the page so that {@code element} is vertically centred in the viewport.
     * Uses {@code scrollIntoView({block:'center'})} rather than the default
     * {@code block:'start'} so the element is not obscured by a sticky header.
     *
     * @param element the element to bring into view
     */
    protected void scrollIntoView(WebElement element) {
        ((JavascriptExecutor) driver).executeScript(
                "arguments[0].scrollIntoView({block:'center'});", element);
    }

    /**
     * Types into an Angular reactive-form input using the native {@code HTMLInputElement}
     * value setter so that Angular's change-detection fires.
     *
     * <p>Plain {@code sendKeys()} bypasses the native setter, so Angular's
     * {@code FormControl} / {@code ngModel} binding does not register the change and
     * the submit button remains disabled. This method:
     * <ol>
     *   <li>Calls the native {@code HTMLInputElement.prototype.value} setter.</li>
     *   <li>Dispatches an {@code input} event (triggers Angular value accessor).</li>
     *   <li>Dispatches a {@code change} event (triggers validators).</li>
     * </ol>
     *
     * @param element the Angular-bound input field
     * @param text    the text to set
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
     * Dispatches a bubbling {@code MouseEvent} click on {@code element} via JavaScript.
     *
     * <p>Use instead of {@link #click(WebElement)} when the target element is inside
     * an Angular carousel page that has {@code display:none} applied by the slider
     * library — the DOM event bypasses the visibility restriction and still reaches
     * Angular's {@code (click)} listener.
     *
     * @param element the element to click
     */
    protected void jsClick(WebElement element) {
        ((JavascriptExecutor) driver).executeScript(
                "arguments[0].dispatchEvent("
                + "  new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));",
                element);
    }

    /**
     * Blocks until the browser's current URL contains {@code fragment}, with a 30-second
     * timeout. Used to confirm Angular SPA client-side route transitions have completed.
     *
     * @param fragment a substring expected in the URL (e.g. {@code "home"}, {@code "authenticator"})
     * @throws org.openqa.selenium.TimeoutException if the URL does not match within 30 s
     */
    protected void waitForUrlContaining(String fragment) {
        new WebDriverWait(driver, Duration.ofSeconds(30))
                .until(ExpectedConditions.urlContains(fragment));
    }

    /**
     * Captures a full-page screenshot and saves it under {@code screenshots/<name>-<timestamp>.png}.
     * The {@code screenshots/} directory is created if it does not yet exist.
     *
     * @param name a human-readable label prepended to the filename
     */
    protected void takeScreenshot(String name) {
        File src = ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);
        try {
            Path dest = Path.of("screenshots", name + "-" + System.currentTimeMillis() + ".png");
            Files.createDirectories(dest.getParent());
            Files.copy(src.toPath(), dest);
            log.info("Screenshot saved: {}", dest.toAbsolutePath());
        } catch (IOException e) {
            log.error("Failed to save screenshot: {}", e.getMessage(), e);
        }
    }
}
