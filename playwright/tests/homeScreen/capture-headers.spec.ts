import { test } from '@playwright/test';
import * as fs from 'fs';

test('capture API request headers and responses', async ({ page }) => {
  const captured: any[] = [];

  page.on('request', req => {
    if (['xhr', 'fetch'].includes(req.resourceType())) {
      captured.push({
        method: req.method(),
        url: req.url(),
        headers: req.headers(),
        postData: req.postData()?.slice(0, 500) ?? null,
      });
    }
  });

  await page.goto('https://watch.frndlytv.com/home', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Print headers for each unique endpoint
  const seen = new Set<string>();
  for (const r of captured) {
    const baseUrl = r.url.replace(/[?#].*/, '');
    const key = `${r.method}:${baseUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);

    console.log(`\n--- ${r.method} ${baseUrl} ---`);
    const important = ['authorization', 'x-auth-token', 'x-api-key', 'x-token',
                       'cookie', 'x-device-id', 'x-platform', 'x-app-version',
                       'content-type', 'accept', 'x-user-token', 'x-session'];
    for (const [k, v] of Object.entries(r.headers)) {
      if (important.some(h => k.toLowerCase().includes(h.replace('x-', '')))) {
        console.log(`  ${k}: ${String(v).slice(0, 120)}`);
      }
    }
    if (r.postData) console.log(`  BODY: ${r.postData}`);
  }

  // Save full headers to file for inspection
  fs.writeFileSync('test-results/api-headers.json',
    JSON.stringify(captured.filter((r, i, arr) =>
      arr.findIndex(x => x.url.replace(/[?#].*/,'') === r.url.replace(/[?#].*/,'') && x.method === r.method) === i
    ), null, 2)
  );
});
