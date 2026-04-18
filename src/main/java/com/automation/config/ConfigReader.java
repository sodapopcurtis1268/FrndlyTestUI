package com.automation.config;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;

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

    public static String get(String key) {
        String value = properties.getProperty(key);
        if (value == null) throw new RuntimeException("Property not found: " + key);
        return value;
    }

    public static String getBrowser() {
        return get("browser");
    }

    public static String getBaseUrl() {
        return get("base.url");
    }

    public static int getImplicitWait() {
        return Integer.parseInt(get("implicit.wait"));
    }

    public static int getExplicitWait() {
        return Integer.parseInt(get("explicit.wait"));
    }

    public static boolean isHeadless() {
        return Boolean.parseBoolean(get("headless"));
    }

    public static String getUsername() {
        return get("username");
    }

    public static String getPassword() {
        return get("password");
    }
}
