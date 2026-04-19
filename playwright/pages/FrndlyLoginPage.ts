import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { DashboardPage } from './DashboardPage';
import { config } from '../utils/config';

const AUTHENTICATOR_URL = `${config.watchUrl}/authenticator`;

export class FrndlyLoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Navigates directly to the authenticator URL and logs in with up to 3
   * attempts. Going direct is more reliable than clicking the landing-page
   * "Sign In" link, which resolves to watch.frndlytv.com/ (a redirect) and
   * can mismatch Angular router expectations in a fresh Playwright context.
   */
  async login(email: string, password: string): Promise<DashboardPage> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Navigate to the authenticator directly each attempt to ensure a
        // clean Angular form state (avoids stale reactive form validators)
        await this.page.goto(AUTHENTICATOR_URL);

        const emailField = this.page.locator("input[type='email']");
        await emailField.waitFor({ state: 'visible', timeout: 15_000 });

        // Allow background auth HTTP requests to settle before typing
        await this.page.waitForTimeout(2000);

        // Angular reactive form requires native input setter to trigger validators
        await this.typeAngular(emailField, email);
        await this.typeAngular(this.page.locator("input[type='password']"), password);

        // Re-query submit button to avoid stale reference
        await this.page.locator("button[type='submit']").click();

        await this.page.waitForURL('**/home', { timeout: 30_000 });
        console.log(`Login succeeded on attempt ${attempt}`);
        return new DashboardPage(this.page);
      } catch (err) {
        console.warn(`Login attempt ${attempt} failed: ${(err as Error).message}`);
        if (attempt === 3) throw err;
      }
    }
    throw new Error('Login failed after 3 attempts');
  }
}
