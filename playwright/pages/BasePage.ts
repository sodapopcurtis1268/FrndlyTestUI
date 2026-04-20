import { Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * Fills an Angular reactive form input by setting the native value directly
   * and dispatching input + change events. Playwright's fill() handles most
   * inputs, but Angular's reactive forms sometimes require the native setter to
   * trigger validators — identical to the Java typeAngular() workaround.
   */
  async typeAngular(locator: Locator, value: string): Promise<void> {
    await locator.waitFor({ state: 'visible' });
    await locator.evaluate((el: HTMLInputElement, val: string) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      nativeInputValueSetter?.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }

  /**
   * Clicks via HTMLElement.click() — bypasses Playwright's visibility check for
   * elements that are technically hidden (display:none, zero-size) but still
   * respond to programmatic clicks. Unlike dispatchEvent(MouseEvent), the
   * native .click() method triggers Angular's router link handlers.
   */
  async jsClick(locator: Locator): Promise<void> {
    await locator.evaluate((el: Element) => {
      (el as HTMLElement).click();
    });
  }

  /**
   * Saves a full-page screenshot to playwright/screenshots/<name>-<timestamp>.png.
   */
  async takeScreenshot(name: string): Promise<string> {
    const dir = path.join(__dirname, '..', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${name}-${Date.now()}.png`;
    const filepath = path.join(dir, filename);
    await this.page.screenshot({ path: filepath, fullPage: false });
    return filepath;
  }

  /**
   * Scrolls the page in 600 px increments until the bottom is reached, giving
   * Angular's intersection observers time to lazy-load each row of content.
   */
  async scrollPageToLoadAllRows(): Promise<void> {
    let lastHeight = 0;
    while (true) {
      const scrollHeight: number = await this.page.evaluate(() => document.body.scrollHeight);
      if (scrollHeight === lastHeight) break;
      lastHeight = scrollHeight;
      let scrollY = 0;
      while (scrollY < scrollHeight) {
        scrollY += 600;
        await this.page.evaluate((y) => window.scrollTo(0, y), scrollY);
        await this.page.waitForTimeout(500);
      }
    }
    // Return to top
    await this.page.evaluate(() => window.scrollTo(0, 0));
  }
}
