import { test, expect } from '@playwright/test';
import { FrndlyLoginPage } from '../pages/FrndlyLoginPage';
import { config } from '../utils/config';

/**
 * E2E smoke test: login → play first Continue Watching asset → navigate to
 * settings → sign out.
 *
 * Mirrors FrndlyTVTest.java. Runs in a single browser session (~2 min).
 */
test.describe('Frndly TV E2E', () => {
  // This test exercises the full login flow, so it must start unauthenticated.
  // Override the project-level storageState so cookies are not pre-loaded.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('@smoke login, play asset, open settings, sign out', async ({ page }) => {
    // ── Login ────────────────────────────────────────────────────────────────
    // FrndlyLoginPage.login() navigates directly to /authenticator — more
    // reliable than clicking the landing-page "Sign In" link (which points to
    // watch.frndlytv.com/ and relies on a redirect).
    const dashboard = await new FrndlyLoginPage(page).login(config.username, config.password);

    // ── Play first Continue Watching card ────────────────────────────────────
    const player = await dashboard.clickFirstContinueWatchingAsset();
    await player.captureScreenshot('e2e-continue-watching');

    // ── Navigate back to home ────────────────────────────────────────────────
    await player.clickClose();

    // ── Open settings ────────────────────────────────────────────────────────
    // Re-instantiate DashboardPage after navigation back
    const { DashboardPage } = await import('../pages/DashboardPage');
    const dash2 = new DashboardPage(page);
    const settings = await dash2.clickSettingsWheel();
    await settings.waitForPageToSettle();
    await settings.captureScreenshot('e2e-settings');

    // ── Sign out ─────────────────────────────────────────────────────────────
    await settings.scrollToAndClickSignOut();

    // After sign out the app redirects to the authenticator page
    expect(page.url()).toContain('/authenticator');
  });

});
