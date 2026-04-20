import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { PlayerPage } from './PlayerPage';
import { SettingsPage } from './SettingsPage';

export class DashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Scrolls through the home page in 600 px steps until the target row heading
   * is found. Returns a locator for the row's `.sec_slider` container, or null
   * if the row is not present on the page.
   *
   * Uses JS textContent matching (case-sensitive, trimmed) — same approach as
   * the Java findRowSection() scroll-and-poll strategy.
   */
  async findRowSection(rowName: string): Promise<Locator | null> {
    let scrollY = 0;
    let lastHeight = -1;

    while (true) {
      const found: boolean = await this.page.evaluate((name: string) => {
        const headings = Array.from(document.querySelectorAll('h3.ott_tray_title'));
        return headings.some(h => h.textContent?.trim() === name);
      }, rowName);

      if (found) {
        // Scroll the heading into view and return the containing .sec_slider
        await this.page.evaluate((name: string) => {
          const h = Array.from(document.querySelectorAll('h3.ott_tray_title'))
            .find(el => el.textContent?.trim() === name);
          h?.scrollIntoView({ block: 'center' });
        }, rowName);
        await this.page.waitForTimeout(300);

        // Return a locator that resolves to the .sec_slider containing this heading
        const sectionIndex: number = await this.page.evaluate((name: string) => {
          const sliders = Array.from(document.querySelectorAll('.sec_slider'));
          return sliders.findIndex(s =>
            s.querySelector('h3.ott_tray_title')?.textContent?.trim() === name
          );
        }, rowName);

        if (sectionIndex === -1) return null;
        return this.page.locator('.sec_slider').nth(sectionIndex);
      }

      const scrollHeight: number = await this.page.evaluate(() => document.body.scrollHeight);
      if (scrollY >= scrollHeight && scrollHeight === lastHeight) break;
      lastHeight = scrollHeight;
      scrollY += 600;
      await this.page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await this.page.waitForTimeout(500);
    }

    return null;
  }

  /**
   * Returns the number of cards in the named row, or 0 if the row is not found.
   */
  async getCardCountInRow(rowName: string): Promise<number> {
    const section = await this.findRowSection(rowName);
    if (!section) return 0;

    // Poll up to 6 s for cards to render
    const deadline = Date.now() + 6_000;
    while (Date.now() < deadline) {
      const count: number = await section.evaluate((el: Element) =>
        el.querySelectorAll('.sheet_poster, .roller_poster').length
      );
      if (count > 0) return count;
      await this.page.waitForTimeout(500);
    }
    return 0;
  }

  /**
   * Clicks the card at `index` (0-based) within the named row and returns a
   * PlayerPage. Returns null if the row or card is not found.
   */
  async clickCardAtIndexInRow(rowName: string, index: number): Promise<PlayerPage | null> {
    const section = await this.findRowSection(rowName);
    if (!section) return null;

    // Poll up to 6 s for the card at the target index to render
    const deadline = Date.now() + 6_000;
    let card: Locator | null = null;
    while (Date.now() < deadline) {
      const count: number = await section.evaluate((el: Element) =>
        el.querySelectorAll('.sheet_poster, .roller_poster').length
      );
      if (count > index) {
        card = section.locator('.sheet_poster, .roller_poster').nth(index);
        break;
      }
      await this.page.waitForTimeout(500);
    }

    if (!card) return null;

    await card.evaluate((el: Element) => el.scrollIntoView({ block: 'center' }));
    await this.page.waitForTimeout(300);

    await this.jsClick(card);

    await this.page.waitForTimeout(2000);
    return new PlayerPage(this.page);
  }

  /**
   * Clicks the first card in the named row.
   */
  async clickFirstCardInRow(rowName: string): Promise<PlayerPage | null> {
    return this.clickCardAtIndexInRow(rowName, 0);
  }

  /**
   * Clicks the first "Continue Watching" card. Uses JS scroll + jsClick to
   * bypass Playwright's visibility requirement (cards can be technically
   * display:none until scrolled into the viewport on Angular lazy-load rows).
   */
  async clickFirstContinueWatchingAsset(): Promise<PlayerPage> {
    const card = this.page.locator(
      "//h3[contains(text(),'Continue Watching')]/ancestor::div[contains(@class,'sec_slider')]//div[contains(@class,'sheet_poster')]"
    ).first();
    // JS scroll works even when element is not "visible" per Playwright rules
    await card.evaluate((el: Element) => el.scrollIntoView({ block: 'center' }));
    await this.page.waitForTimeout(300);
    await this.jsClick(card);
    await this.page.waitForTimeout(2000);
    return new PlayerPage(this.page);
  }

  /**
   * Returns all row names visible on the home page (after full scroll).
   */
  async getRowNames(): Promise<string[]> {
    await this.scrollPageToLoadAllRows();
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('h3.ott_tray_title'))
        .map(h => h.textContent?.trim() ?? '')
        .filter(Boolean)
    );
  }

  async clickSettingsWheel(): Promise<SettingsPage> {
    await this.page.locator("div[routerlink='/settings'].ott-header-search").click();
    await this.page.waitForURL('**/settings');
    return new SettingsPage(this.page);
  }
}
