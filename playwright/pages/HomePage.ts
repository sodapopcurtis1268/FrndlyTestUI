import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { FrndlyLoginPage } from './FrndlyLoginPage';

export class HomePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async clickLogin(): Promise<FrndlyLoginPage> {
    const loginBtn = this.page.locator(
      "//a[contains(@href, '/authenticator')] | //button[normalize-space(text())='Log In'] | //button[normalize-space(text())='Sign In']"
    ).first();
    await loginBtn.waitFor({ state: 'visible' });
    await loginBtn.click();
    return new FrndlyLoginPage(this.page);
  }
}
