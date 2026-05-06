import { test, expect } from '@playwright/test';
import { FrndlyLoginPage } from '../pages/FrndlyLoginPage';
import { config } from '../utils/config';

/**
 * Sample login test — verifies that a user can log in and reach the home page.
 */

test('@smoke Login — verify successful authentication [C420668]', async ({ page }) => {
  const loginPage = new FrndlyLoginPage(page);
  await loginPage.login(config.username, config.password);

  // Verify we landed on the home page
  await expect(page).toHaveURL(/\/home/, { timeout: 10_000 });

  // Verify at least one content row is visible
  await page.waitForFunction(
    () => document.querySelectorAll('h3.ott_tray_title').length > 0,
    { timeout: 30_000 }
  );
  const rowCount = await page.locator('h3.ott_tray_title').count();
  expect(rowCount).toBeGreaterThan(0);

  console.log(`Login verified — landed on home page with ${rowCount} content rows`);
});
