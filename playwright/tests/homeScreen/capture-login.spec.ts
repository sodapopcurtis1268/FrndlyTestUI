import { test } from '@playwright/test';

// Run WITHOUT storageState — needs a fresh login to catch the auth endpoint
test('capture login API flow', async ({ browser }) => {
  const context = await browser.newContext(); // no storageState
  const page = await context.newPage();
  const captured: any[] = [];

  page.on('request', req => {
    if (['xhr', 'fetch'].includes(req.resourceType())) {
      captured.push({ method: req.method(), url: req.url(), postData: req.postData()?.slice(0, 1000) ?? null });
    }
  });

  page.on('response', async res => {
    if (['xhr', 'fetch'].includes(res.request().resourceType())) {
      const r = captured.find(x => x.url === res.url() && !x.status);
      if (r) {
        r.status = res.status();
        try {
          const body = await res.text();
          r.responseBody = body.slice(0, 800);
        } catch {}
      }
    }
  });

  await page.goto('https://watch.frndlytv.com/authenticator', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Type credentials
  const emailField = page.locator("input[type='email']");
  await emailField.waitFor({ state: 'visible', timeout: 15000 });
  await emailField.fill('scott1268@pm.me');
  await page.locator("input[type='password']").fill('Welcome.1268');
  await page.locator("button[type='submit']").click();
  await page.waitForURL('**/home', { timeout: 60000 });
  await page.waitForTimeout(2000);

  for (const r of captured) {
    console.log(`\n${r.method} [${r.status}] ${r.url.replace(/[?#].*/,'')}`);
    if (r.postData) console.log(`  REQ: ${r.postData}`);
    if (r.responseBody) console.log(`  RES: ${r.responseBody}`);
  }
  await context.close();
});
