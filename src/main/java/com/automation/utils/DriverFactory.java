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

public class DriverFactory {

    private static final ThreadLocal<WebDriver> driver = new ThreadLocal<>();

    public static WebDriver getDriver() {
        if (driver.get() == null) {
            initDriver();
        }
        return driver.get();
    }

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
                        // Prevent the site from detecting Selenium via navigator.webdriver
                        "--disable-blink-features=AutomationControlled"
                );
                // Remove the "Chrome is being controlled by automated software" banner
                // and suppress the webdriver flag that bot-detection checks
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

    public static void quitDriver() {
        if (driver.get() != null) {
            driver.get().quit();
            driver.remove();
        }
    }
}
