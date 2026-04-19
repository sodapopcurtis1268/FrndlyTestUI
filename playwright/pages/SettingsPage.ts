import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class SettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async waitForPageToSettle(): Promise<void> {
    await this.page.locator("//button[normalize-space(text())='Sign Out']")
      .waitFor({ state: 'visible', timeout: 10_000 });
  }

  async scrollToAndClickSignOut(): Promise<void> {
    const signOut = this.page.locator("//button[normalize-space(text())='Sign Out']");
    await signOut.scrollIntoViewIfNeeded();
    await signOut.click();
    await this.page.waitForURL('**/authenticator', { timeout: 15_000 });
  }

  async getAccountName(): Promise<string> {
    return this.page.locator('.account-name, [data-testid="account-name"]')
      .first().textContent().then(t => t?.trim() ?? '');
  }

  async getEmail(): Promise<string> {
    return this.page.locator('.account-email, [data-testid="email"]')
      .first().textContent().then(t => t?.trim() ?? '');
  }

  async captureScreenshot(name: string): Promise<string> {
    return this.takeScreenshot(name);
  }
}
