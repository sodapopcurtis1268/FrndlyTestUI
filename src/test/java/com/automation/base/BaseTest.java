package com.automation.base;

import com.automation.config.ConfigReader;
import com.automation.utils.DriverFactory;
import org.openqa.selenium.WebDriver;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

public class BaseTest {

    protected WebDriver driver;

    @BeforeMethod
    public void setUp() {
        driver = DriverFactory.getDriver();
        driver.get(ConfigReader.getBaseUrl());
    }

    @AfterMethod
    public void tearDown() {
        DriverFactory.quitDriver();
    }
}
