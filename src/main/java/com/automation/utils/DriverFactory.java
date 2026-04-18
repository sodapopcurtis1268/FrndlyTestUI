package com.automation.utils;

import com.automation.config.ConfigReader;
import io.github.bonigarcia.wdm.WebDriverManager;
import org.openqa.selenium.PageLoadStrategy;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.edge.EdgeDriver;
import org.openqa.selenium.edge.EdgeOptions;
import org.openqa.selenium.firefox.FirefoxDriver;
import org.openqa.selenium.firefox.FirefoxOptions;

import java.time.Duration;

/**
 * Thread-safe factory that creates and manages one {@link WebDriver} instance per thread.
 *
 * <p>Uses a {@link ThreadLocal} so parallel TestNG test methods each get their own
 * isolated browser session without sharing state. Call {@link #getDriver()} to obtain
 * the current thread's driver (creating it on first access), and {@link #quitDriver()}
 * in {@code @AfterMethod} to close the browser and free the slot.
 *
 * <p>The browser type and headless flag are read from
 * {@link ConfigReader} ({@code browser} and {@code headless} keys). Supported values:
 * {@code chrome} (default), {@code firefox}, {@code edge}.
 *
 * <p><b>Chrome-specific hardening:</b>
 * <ul>
 *   <li>{@code --disable-blink-features=AutomationControlled} — removes the
 *       {@code navigator.webdriver} flag checked by bot-detection.</li>
 *   <li>{@code excludeSwitches: enable-automation} — hides the "controlled by
 *       automated software" banner.</li>
 *   <li>{@link PageLoadStrategy#EAGER} — returns control once the DOM is ready,
 *       without waiting for third-party analytics scripts that never fully load on
 *       Angular SPAs like watch.frndlytv.com.</li>
 * </ul>
 */
public class DriverFactory {

    private static final ThreadLocal<WebDriver> driver = new ThreadLocal<>();

    /**
     * Returns the {@link WebDriver} for the current thread, initialising it on first call.
     *
     * @return the active WebDriver instance for this thread
     */
    public static WebDriver getDriver() {
        if (driver.get() == null) {
            initDriver();
        }
        return driver.get();
    }

    /**
     * Initialises the WebDriver for the current thread based on config values.
     * Downloads the matching driver binary via WebDriverManager if not already cached.
     */
    private static void initDriver() {
        String browser = ConfigReader.getBrowser().toLowerCase();
        boolean headless = ConfigReader.isHeadless();
        WebDriver webDriver;

        switch (browser) {
            case "firefox" -> {
                WebDriverManager.firefoxdriver().setup();
                FirefoxOptions options = new FirefoxOptions();
                if (headless) options.addArguments("--headless");
                webDriver = new FirefoxDriver(options);
            }
            case "edge" -> {
                WebDriverManager.edgedriver().setup();
                EdgeOptions options = new EdgeOptions();
                if (headless) options.addArguments("--headless");
                webDriver = new EdgeDriver(options);
            }
            default -> {
                WebDriverManager.chromedriver().setup();
                ChromeOptions options = new ChromeOptions();
                if (headless) options.addArguments("--headless=new");
                options.addArguments(
                        "--no-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-blink-features=AutomationControlled"
                );
                options.setExperimentalOption("excludeSwitches", new String[]{"enable-automation"});
                options.setExperimentalOption("useAutomationExtension", false);
                // EAGER: return control once DOM is ready; don't wait for every
                // analytics/tracking script — these never "complete" on SPAs like
                // watch.frndlytv.com/authenticator and cause an infinite hang.
                options.setPageLoadStrategy(PageLoadStrategy.EAGER);
                webDriver = new ChromeDriver(options);
            }
        }

        webDriver.manage().timeouts().implicitlyWait(Duration.ofSeconds(ConfigReader.getImplicitWait()));
        webDriver.manage().timeouts().pageLoadTimeout(Duration.ofSeconds(30));
        webDriver.manage().window().maximize();
        driver.set(webDriver);
    }

    /**
     * Quits the browser and removes the {@link WebDriver} from the thread-local store.
     * Should be called in {@code @AfterMethod} to prevent browser leaks between tests.
     */
    public static void quitDriver() {
        if (driver.get() != null) {
            driver.get().quit();
            driver.remove();
        }
    }
}
