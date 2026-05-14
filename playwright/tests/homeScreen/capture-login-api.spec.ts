import { test } from '@playwright/test';

test('capture login API endpoint', async ({ page }) => {
  const all: any[] = [];

  page.on('request', req => {
    if (['xhr', 'fetch'].includes(req.resourceType())) {
      all.push({
        method: req.method(),
        url: req.url(),
        headers: req.headers(),
        postData: req.postData()?.slice(0, 600) ?? null,
      });
    }
  });
  page.on('response', async res => {
    if (['xhr', 'fetch'].includes(res.request().resourceType())) {
      const r = all.find(x => x.url === res.url() && !x.status);
      if (r) {
        r.status = res.status();
        try { r.responseBody = (await res.text()).slice(0, 400); } catch {}
      }
    }
  });

  await page.goto('https://watch.frndlytv.com/authenticator', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  const emailInput = page.locator("input[type='email']");
  await emailInput.waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1000);

  // Use JS native setter to trigger Angular validators
  await page.evaluate((val) => {
    const el = document.querySelector("input[type='email']") as HTMLInputElement;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    nativeInputValueSetter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, 'scott1268@pm.me');

  await page.evaluate((val) => {
    const el = document.querySelector("input[type='password']") as HTMLInputElement;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    nativeInputValueSetter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, 'Welcome.1268');

  await page.locator("button[type='submit']").click();
  await page.waitForURL('**/home', { timeout: 60000 });
  await page.waitForTimeout(2000);

  for (const r of all) {
    if (r.url.includes('frndlytv-api')) {
      console.log(`\n${r.method} [${r.status ?? '?'}] ${r.url.replace(/[?#].*/,'')}`);
      if (r.postData) console.log(`  REQ BODY: ${r.postData}`);
      if (r.responseBody) {
        // Look for session tokens in responses
        const body = r.responseBody;
        if (body.includes('session') || body.includes('token') || body.includes('Token')) {
          console.log(`  RES BODY: ${body}`);
        }
      }
    }
  }
});
