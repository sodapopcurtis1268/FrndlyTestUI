import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { DashboardPage } from './DashboardPage';
import { config } from '../utils/config';

export class PlayerPage extends BasePage {
  private readonly constructedAtMs: number;

  constructor(page: Page) {
    super(page);
    this.constructedAtMs = Date.now();
  }

  /**
   * Polls for a playing <video> element, trying detail-page play buttons every
   * 5 s if no video is found. Returns elapsed milliseconds (TTFF) or -1 on
   * timeout. Distinguishes VOD (currentTime > 0 && readyState >= 3) from live
   * (!paused && !ended && readyState >= 2).
   */
  async waitForVideoToStart(timeoutSeconds = config.videoTimeoutSeconds): Promise<number> {
    const timeoutMs = timeoutSeconds * 1000;
    const pollMs = 500;
    const detailRetryMs = 5000;
    let lastDetailRetry = Date.now();

    // Frndly TV detail pages show CTAs like "Continue Watching", "Start Over",
    // or "Watch" before the video element appears. These selectors cover all
    // known variants — text-based selectors are most resilient to class changes.
    const detailPlaySelectors = [
      'button:has-text("Continue Watching")',
      'button:has-text("Start Over")',
      'button:has-text("Watch Now")',
      'button:has-text("Watch")',
      'button:has-text("Play")',
      'button[class*="watch"]',
      'button[class*="play"]',
      'button[aria-label*="play" i]',
      'button.watch-btn',
    ];

    while (Date.now() - this.constructedAtMs < timeoutMs) {
      // Detect Widevine DRM / media errors — VOD content that requires a license
      // server cannot play in standard Playwright Chrome (no Widevine CDM).
      // Checks multiple signals:
      //   • DRM_NO_KEY_SYSTEM text in the page (most explicit)
      //   • video.error.code 3 (MEDIA_ERR_DECODE) or 4 (MEDIA_ERR_SRC_NOT_SUPPORTED)
      //     — both appear when DRM blocks playback without showing text in the DOM
      //   • "not available" / "unavailable" messages shown by the Frndly player
      const drmBlocked = await this.page.evaluate(() => {
        const body = document.body?.innerText ?? '';
        if (body.includes('DRM_NO_KEY_SYSTEM')) return true;
        const video = document.querySelector('video') as HTMLVideoElement | null;
        if (video?.error) {
          // code 3 = MEDIA_ERR_DECODE, code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED
          if (video.error.code === 3 || video.error.code === 4) return true;
        }
        return false;
      });
      if (drmBlocked) return -2;

      const playing: boolean = await this.page.evaluate(() => {
        const video = document.querySelector('video');
        if (!video) return false;
        const isVod  = video.currentTime > 0 && video.readyState >= 3;
        const isLive = !video.paused && !video.ended && video.readyState >= 2;
        return isVod || isLive;
      });

      if (playing) return Date.now() - this.constructedAtMs;

      // Every 5 s, try clicking a detail-page play CTA
      if (Date.now() - lastDetailRetry >= detailRetryMs) {
        lastDetailRetry = Date.now();
        for (const selector of detailPlaySelectors) {
          const btn = this.page.locator(selector).first();
          if (await btn.isVisible().catch(() => false)) {
            await btn.click().catch(() => {});
            break;
          }
        }
      }

      await this.page.waitForTimeout(pollMs);
    }

    return -1; // timed out
  }

  /**
   * Waits `VIDEO_PLAY_SECONDS` for the asset to play, then captures a
   * screenshot. The screenshot is saved to playwright/screenshots/.
   */
  async captureScreenshot(name: string): Promise<string> {
    await this.page.waitForTimeout(config.videoPlaySeconds * 1000);
    return this.takeScreenshot(name);
  }

  /**
   * Navigates back to /home to stop playback and returns a DashboardPage.
   */
  async clickClose(): Promise<DashboardPage> {
    await this.page.goBack();
    await this.page.waitForURL('**/home', { timeout: 30_000 });
    return new DashboardPage(this.page);
  }

  async isVideoPlaying(): Promise<boolean> {
    return this.page.evaluate(() => {
      const video = document.querySelector('video');
      if (!video) return false;
      return !video.paused && !video.ended && video.currentTime > 0;
    });
  }

  async getVideoCurrentTime(): Promise<number> {
    return this.page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.currentTime : -1;
    });
  }
}
