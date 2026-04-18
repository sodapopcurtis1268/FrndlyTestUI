package com.automation.config;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;

/**
 * Singleton utility that reads {@code src/main/resources/config.properties} once at class
 * load time and exposes typed accessor methods for every configuration key.
 *
 * <p>All keys are required. A missing key throws a {@link RuntimeException} so tests fail
 * fast with a clear message rather than a NullPointerException deep in test logic.
 *
 * <p>Override values at the command line with {@code -Dkey=value} if needed; to do that,
 * change the accessors to check {@link System#getProperty} first.
 */
public class ConfigReader {

    private static Properties properties;
    private static final String CONFIG_PATH = "src/main/resources/config.properties";

    static {
        try (FileInputStream fis = new FileInputStream(CONFIG_PATH)) {
            properties = new Properties();
            properties.load(fis);
        } catch (IOException e) {
            throw new RuntimeException("Failed to load config.properties: " + e.getMessage());
        }
    }

    /**
     * Returns the raw string value for the given property key.
     *
     * @param key the property name (e.g. {@code "browser"})
     * @return the value
     * @throws RuntimeException if the key is absent from config.properties
     */
    public static String get(String key) {
        String value = properties.getProperty(key);
        if (value == null) throw new RuntimeException("Property not found: " + key);
        return value;
    }

    /**
     * Returns the browser name to use (e.g. {@code "chrome"}, {@code "firefox"}, {@code "edge"}).
     *
     * @return browser identifier string, lowercase-normalised by {@link com.automation.utils.DriverFactory}
     */
    public static String getBrowser() {
        return get("browser");
    }

    /**
     * Returns the base URL that every test navigates to during {@code @BeforeMethod}.
     *
     * @return fully-qualified URL (e.g. {@code "https://watch.frndlytv.com/home"})
     */
    public static String getBaseUrl() {
        return get("base.url");
    }

    /**
     * Returns the implicit wait timeout in seconds applied to every {@link org.openqa.selenium.WebDriver}
     * element lookup.
     *
     * @return implicit wait duration in seconds
     */
    public static int getImplicitWait() {
        return Integer.parseInt(get("implicit.wait"));
    }

    /**
     * Returns the explicit wait timeout in seconds used by {@link com.automation.utils.WaitUtils}.
     *
     * @return explicit wait duration in seconds
     */
    public static int getExplicitWait() {
        return Integer.parseInt(get("explicit.wait"));
    }

    /**
     * Returns whether the browser should run in headless mode.
     *
     * @return {@code true} if headless, {@code false} for a visible window
     */
    public static boolean isHeadless() {
        return Boolean.parseBoolean(get("headless"));
    }

    /**
     * Returns the Frndly TV account email address used for login tests.
     *
     * @return email string
     */
    public static String getUsername() {
        return get("username");
    }

    /**
     * Returns the Frndly TV account password used for login tests.
     *
     * @return password string
     */
    public static String getPassword() {
        return get("password");
    }
}
