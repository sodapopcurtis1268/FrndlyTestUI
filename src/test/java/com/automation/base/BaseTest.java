package com.automation.base;

import com.automation.config.ConfigReader;
import com.automation.utils.DriverFactory;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.openqa.selenium.WebDriver;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

import java.io.File;
import java.util.Arrays;
import java.util.Comparator;

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

    private static final Logger log = LogManager.getLogger(BaseTest.class);
    private static final int MAX_ARTIFACTS = 10;

    /** The WebDriver session for the current test method. Injected by {@code @BeforeMethod}. */
    protected WebDriver driver;

    /**
     * Creates the browser session and navigates to the configured base URL before
     * each test method. Also prunes screenshots/ and videos/ to the most recent
     * {@value #MAX_ARTIFACTS} files each.
     */
    @BeforeMethod
    public void setUp() {
        pruneDirectory("screenshots", MAX_ARTIFACTS);
        pruneDirectory("videos", MAX_ARTIFACTS);
        driver = DriverFactory.getDriver();
        driver.get(ConfigReader.getBaseUrl());
    }

    /**
     * Deletes the oldest files in {@code dirName/} so that at most {@code keep}
     * files remain. Files are ordered by last-modified time; the newest are kept.
     * No-op if the directory doesn't exist or has fewer than {@code keep} files.
     */
    private static void pruneDirectory(String dirName, int keep) {
        File dir = new File(dirName);
        if (!dir.isDirectory()) return;

        File[] files = dir.listFiles(File::isFile);
        if (files == null || files.length <= keep) return;

        Arrays.sort(files, Comparator.comparingLong(File::lastModified));

        int deleteCount = files.length - keep;
        for (int i = 0; i < deleteCount; i++) {
            if (files[i].delete()) {
                log.info("Pruned old artifact: {}", files[i].getName());
            } else {
                log.warn("Could not delete: {}", files[i].getAbsolutePath());
            }
        }
        log.info("Pruned {}/{} files from {}/ — {} retained",
                deleteCount, files.length, dirName, keep);
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
