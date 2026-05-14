import { test } from '@playwright/test';

test('capture full URLs with query params', async ({ page }) => {
  page.on('request', req => {
    if (['xhr', 'fetch'].includes(req.resourceType())) {
      const url = req.url();
      if (url.includes('page/content') || url.includes('tivo/content') || url.includes('locationinfo')) {
        console.log(`\nFULL URL: ${url}`);
      }
    }
  });

  await page.goto('https://watch.frndlytv.com/home', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
});
