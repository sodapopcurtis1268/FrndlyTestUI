import { test } from '@playwright/test';
import * as fs from 'fs';

test('capture API endpoints', async ({ page }) => {
  const requests: { method: string; url: string; postData: string | null; status?: number }[] = [];

  page.on('request', req => {
    if (['xhr', 'fetch'].includes(req.resourceType())) {
      requests.push({ method: req.method(), url: req.url(), postData: req.postData()?.slice(0, 300) ?? null });
    }
  });

  page.on('response', res => {
    if (['xhr', 'fetch'].includes(res.request().resourceType())) {
      const r = requests.find(x => x.url === res.url() && x.status == null);
      if (r) r.status = res.status();
    }
  });

  await page.goto('https://watch.frndlytv.com/home', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(2000);

  // Deduplicate
  const seen = new Set<string>();
  const unique = requests.filter(r => {
    const key = `${r.method}:${r.url.replace(/[?#].*/, '').replace(/\/[0-9a-f]{8,}/gi, '/{id}')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const output = unique
    .sort((a, b) => a.url.localeCompare(b.url))
    .map(r => `${r.method.padEnd(6)} [${r.status ?? '???'}] ${r.url.replace(/[?#].*/, '')}${r.postData ? '\n        body: ' + r.postData : ''}`)
    .join('\n');

  console.log('\n=== API ENDPOINTS ===\n' + output + `\n\nTotal: ${unique.length}`);
  fs.writeFileSync('test-results/api-endpoints.txt', output);
});
