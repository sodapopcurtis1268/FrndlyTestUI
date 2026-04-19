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

    /** Utility class — do not instantiate. */
    private ConfigReader() {}

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
     * Returns the value for {@code key}, checking {@link System#getProperty} first
     * (allows {@code -Dkey=value} CLI overrides), then config.properties, then
     * {@code defaultValue} if absent from both.
     *
     * @param key          the property name
     * @param defaultValue fallback when the key is absent
     * @return resolved value
     */
    private static String getOptional(String key, String defaultValue) {
        String sysProp = System.getProperty(key);
        if (sysProp != null) return sysProp;
        return properties.getProperty(key, defaultValue);
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

    /**
     * Returns the screen index to record (0 = primary/built-in, 1 = first external, etc.).
     * Defaults to 0 if not set.
     */
    public static int getScreenIndex() {
        return Integer.parseInt(getOptional("screen.index", "0"));
    }

    /**
     * Returns the maximum seconds to wait for video playback to begin (time-to-first-frame).
     * Defaults to 30 if not set. Override with {@code -Dvideo.timeout.seconds=N}.
     */
    public static int getVideoTimeoutSeconds() {
        return Integer.parseInt(getOptional("video.timeout.seconds", "30"));
    }

    /**
     * Returns the seconds to let the video play before taking a screenshot.
     * Defaults to 3 if not set. Override with {@code -Dvideo.play.seconds=N}.
     */
    public static int getVideoPlaySeconds() {
        return Integer.parseInt(getOptional("video.play.seconds", "3"));
    }

    // ── LambdaTest ────────────────────────────────────────────────────────────

    /**
     * Returns whether LambdaTest remote execution is enabled.
     * Checks the {@code lt.enabled} system property first, then config.properties.
     *
     * @return {@code true} if tests should run on LambdaTest's Selenium Grid
     */
    public static boolean isLtEnabled() {
        String sysProp = System.getProperty("lt.enabled");
        if (sysProp != null) return Boolean.parseBoolean(sysProp);
        return Boolean.parseBoolean(properties.getProperty("lt.enabled", "false"));
    }

    /**
     * Returns the LambdaTest account username.
     *
     * @return LambdaTest username string
     */
    public static String getLtUsername() {
        return get("lt.username");
    }

    /**
     * Returns the LambdaTest account access key.
     *
     * @return LambdaTest access key string
     */
    public static String getLtAccessKey() {
        return get("lt.accesskey");
    }

    /**
     * Returns the browser version to request from the LambdaTest grid.
     * Defaults to {@code "latest"} if not set.
     *
     * @return browser version string (e.g. {@code "latest"}, {@code "120.0"})
     */
    public static String getLtBrowserVersion() {
        return getOptional("lt.browser.version", "latest");
    }

    /**
     * Returns the OS platform to request from the LambdaTest grid.
     * Defaults to {@code "Windows 10"} if not set.
     *
     * @return platform name (e.g. {@code "Windows 10"}, {@code "macOS Ventura"})
     */
    public static String getLtPlatform() {
        return getOptional("lt.platform", "Windows 10");
    }

    /**
     * Returns the LambdaTest build name used to group test sessions on the dashboard.
     * Defaults to {@code "Automation"} if not set.
     *
     * @return build name string
     */
    public static String getLtBuild() {
        return getOptional("lt.build", "Automation");
    }
}
