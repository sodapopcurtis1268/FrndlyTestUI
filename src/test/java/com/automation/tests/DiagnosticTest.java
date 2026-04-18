package com.automation.tests;

import com.automation.base.BaseTest;
import com.automation.config.ConfigReader;
import com.automation.pages.HomePage;
import org.openqa.selenium.By;
import org.openqa.selenium.JavascriptExecutor;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.annotations.Test;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

public class DiagnosticTest extends BaseTest {

    @Test
    public void checkLoginFormFill() throws IOException, InterruptedException {
        // Reproduce FrndlyTVTest login() exactly, with diagnostics
        System.out.println("Starting URL: " + driver.getCurrentUrl());

        new HomePage(driver).clickLogin();
        System.out.println("After clickLogin URL: " + driver.getCurrentUrl());

        // Wait for email field to be visible (same as FrndlyLoginPage)
        WebElement email    = driver.findElement(By.cssSelector("input[type='email']"));
        WebElement password = driver.findElement(By.cssSelector("input[type='password']"));
        WebElement submit   = driver.findElement(By.cssSelector("button[type='submit']"));

        // Wait for ng- class (same as FrndlyLoginPage)
        waitUrl("authenticator", 10); // make sure we're there
        long start = System.currentTimeMillis();
        waitFor(() -> {
            String cls = driver.findElement(By.cssSelector("input[type='email']")).getAttribute("class");
            return cls != null && cls.contains("ng-");
        }, 15);
        System.out.println("ng- class appeared after " + (System.currentTimeMillis() - start) + "ms");
        System.out.println("email classes: " + email.getAttribute("class"));

        System.out.println("submit disabled before fill: " + submit.getAttribute("disabled"));
        // Use typeAngular-equivalent JS (same as BasePage.typeAngular)
        jsSet(email, ConfigReader.getUsername());
        jsSet(password, ConfigReader.getPassword());

        System.out.println("email value after jsSet: "    + email.getAttribute("value"));
        System.out.println("password value after jsSet: " + password.getAttribute("value"));
        System.out.println("submit disabled after fill: "  + submit.getAttribute("disabled"));
        screenshot("B-form-filled");

        // Click submit (fresh lookup, same as FrndlyLoginPage)
        driver.findElement(By.cssSelector("button[type='submit']")).click();
        Thread.sleep(5000);
        System.out.println("URL after submit click: " + driver.getCurrentUrl());
        screenshot("C-after-submit");
    }

    private void waitFor(java.util.function.Supplier<Boolean> condition, int timeoutSeconds) {
        long deadline = System.currentTimeMillis() + timeoutSeconds * 1000L;
        while (System.currentTimeMillis() < deadline) {
            try {
                if (Boolean.TRUE.equals(condition.get())) return;
                Thread.sleep(200);
            } catch (Exception e) { break; }
        }
    }

    @Test
    public void captureDashboardState() throws IOException, InterruptedException {
        // ── Login ────────────────────────────────────────────────────────────────
        new HomePage(driver).clickLogin();
        Thread.sleep(2000);
        jsSet(driver.findElement(By.cssSelector("input[type='email']")),    ConfigReader.getUsername());
        jsSet(driver.findElement(By.cssSelector("input[type='password']")), ConfigReader.getPassword());
        driver.findElement(By.cssSelector("button[type='submit']")).click();
        waitUrl("home", 30);
        System.out.println("Logged in. URL: " + driver.getCurrentUrl());

        // ── Scroll to Continue Watching and wait for cards to render ─────────────
        WebElement cwHeading = driver.findElement(
                By.xpath("//h3[normalize-space(text())='Continue Watching']"));
        js().executeScript("arguments[0].scrollIntoView({block:'center'});", cwHeading);
        Thread.sleep(4000);  // give intersection observer time to render cards
        screenshot("G-cw-scrolled");

        // Check visibility of sheet_poster elements using JS offsetParent trick
        @SuppressWarnings("unchecked")
        List<String> visibleIds = (List<String>) js().executeScript(
                "var all = document.querySelectorAll('.sheet_poster');"
                + "return Array.from(all)"
                + "  .filter(function(el){ return el.offsetParent !== null; })"
                + "  .slice(0,5)"
                + "  .map(function(el){ return el.id + '|' + el.className; });");
        System.out.println("Visible sheet_poster elements: " + visibleIds);

        // Also count total vs visible
        Long total   = (Long) js().executeScript("return document.querySelectorAll('.sheet_poster').length;");
        Long visible = (Long) js().executeScript(
                "return Array.from(document.querySelectorAll('.sheet_poster')).filter(e=>e.offsetParent!==null).length;");
        System.out.println("Total sheet_poster: " + total + ", visible: " + visible);

        // Find the first visible one in the Continue Watching tray
        WebElement firstVisible = (WebElement) js().executeScript(
                "var h3 = Array.from(document.querySelectorAll('h3.ott_tray_title'))"
                + "  .find(h=>h.textContent.trim()==='Continue Watching');"
                + "if(!h3) return null;"
                + "var tray = h3.closest('.sec_slider');"
                + "if(!tray) return null;"
                + "var posters = Array.from(tray.querySelectorAll('.sheet_poster'));"
                + "return posters.find(function(p){ return p.offsetParent!==null; }) || posters[0];");
        System.out.println("First CW poster (visible or first): " + (firstVisible != null ? firstVisible.getAttribute("id") : "null"));

        if (firstVisible != null) {
            js().executeScript("arguments[0].scrollIntoView({block:'center'});", firstVisible);
            Thread.sleep(1000);
            // Click using JS (bypasses display:none)
            js().executeScript("arguments[0].click();", firstVisible);
            Thread.sleep(5000);
            System.out.println("After click URL: " + driver.getCurrentUrl());
            screenshot("H-after-click");
            save("H-after-click.html");

            // Probe player elements
            probe("video",           By.tagName("video"));
            probe("class*=player",   By.cssSelector("[class*=player]"));
            probe("class*=Player",   By.cssSelector("[class*=Player]"));
            probe("jwplayer",        By.cssSelector(".jwplayer,.jw-wrapper"));

            // What changed in the URL?
            System.out.println("Final URL: " + driver.getCurrentUrl());
        }
    }

    private JavascriptExecutor js() { return (JavascriptExecutor) driver; }

    private void jsSet(WebElement el, String val) {
        js().executeScript(
                "var s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;"
                + "s.call(arguments[0],arguments[1]);"
                + "arguments[0].dispatchEvent(new Event('input',{bubbles:true}));"
                + "arguments[0].dispatchEvent(new Event('change',{bubbles:true}));",
                el, val);
    }

    private void waitUrl(String fragment, int seconds) {
        new WebDriverWait(driver, Duration.ofSeconds(seconds))
                .until(ExpectedConditions.urlContains(fragment));
    }

    private void probe(String label, By by) {
        List<WebElement> els = driver.findElements(by);
        System.out.printf("%-25s → %d found%n", label, els.size());
        if (!els.isEmpty())
            System.out.printf("   class=%s%n", trim(els.get(0).getAttribute("class"), 80));
    }

    private void screenshot(String name) throws IOException {
        File src = ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);
        Path dest = Path.of("screenshots", name + ".png");
        Files.createDirectories(dest.getParent());
        Files.copy(src.toPath(), dest, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        System.out.println("Screenshot: " + dest.toAbsolutePath());
    }

    private void save(String name) throws IOException {
        Files.writeString(Path.of("screenshots", name), driver.getPageSource());
        System.out.println("Saved: screenshots/" + name);
    }

    private String trim(String s, int max) {
        return s == null ? "" : s.substring(0, Math.min(max, s.length()));
    }
}
