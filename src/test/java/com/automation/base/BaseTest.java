package com.automation.base;

import com.automation.config.ConfigReader;
import com.automation.utils.DriverFactory;
import org.openqa.selenium.WebDriver;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

/**
 * Base class for all TestNG test classes in this framework.
 *
 * <p>Provides lifecycle hooks that create a fresh {@link WebDriver} session before
 * each test method and tear it down afterwards, ensuring test isolation and preventing
 * browser state from leaking between tests.
 *
 * <p>All concrete test classes should extend this class rather than managing the driver
 * directly. The {@code driver} field is {@code protected} so subclasses can interact
 * with it when constructing Page Object instances.
 *
 * <p>Session setup:
 * <ol>
 *   <li>{@link DriverFactory#getDriver()} creates a new browser session (or reuses one
 *       already created for this thread in a parallel execution context).</li>
 *   <li>The driver navigates to {@link ConfigReader#getBaseUrl()} so every test starts
 *       at the same known URL.</li>
 * </ol>
 */
public class BaseTest {

    /** The WebDriver session for the current test method. Injected by {@code @BeforeMethod}. */
    protected WebDriver driver;

    /**
     * Creates the browser session and navigates to the configured base URL before
     * each test method.
     */
    @BeforeMethod
    public void setUp() {
        driver = DriverFactory.getDriver();
        driver.get(ConfigReader.getBaseUrl());
    }

    /**
     * Quits the browser and releases the WebDriver from the thread-local store after
     * each test method, regardless of pass or fail.
     */
    @AfterMethod
    public void tearDown() {
        DriverFactory.quitDriver();
    }
}
