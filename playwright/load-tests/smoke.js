/**
 * smoke.js — Load test smoke check (1 VU, 1 iteration)
 *
 * Run this first to confirm all endpoints are reachable and the session-id
 * is valid before running the full load scenarios.
 *
 * RUN:
 *   cd playwright
 *   k6 run load-tests/smoke.js
 *   k6 run -e FRNDLY_SESSION_ID=<uuid> load-tests/smoke.js
 *
 * All checks must pass (0 failures) before running home-content.js or user-auth.js.
 */

import http from 'k6/http';
import { check, group } from 'k6';
import { ENDPOINTS, authHeaders, getSessionId } from './session.js';

export const options = {
  vus:        1,
  iterations: 1,
  thresholds: {
    checks:           ['rate==1.0'],   // every single check must pass
    http_req_failed:  ['rate==0'],
  },
};

export default function () {
  const session = getSessionId();
  const headers = authHeaders(session);

  console.log(`Using session-id: ${session.slice(0, 8)}…`);

  const endpoints = [
    { name: 'features',       url: ENDPOINTS.features },
    { name: 'user/info',      url: ENDPOINTS.userInfo },
    { name: 'activepackages', url: ENDPOINTS.activePackages },
    { name: 'addon/packages', url: ENDPOINTS.addonPackages },
    { name: 'page/content',   url: ENDPOINTS.pageContent },
    { name: 'tivo/content',   url: ENDPOINTS.tivoContent },
    { name: 'locationinfo',   url: ENDPOINTS.locationInfo },
  ];

  group('Smoke check — all endpoints', () => {
    for (const ep of endpoints) {
      group(ep.name, () => {
        const res = http.get(ep.url, { headers });
        const passed = check(res, {
          [`${ep.name}: status 200`]:    r => r.status === 200,
          [`${ep.name}: has response`]:  r => r.body && r.body.length > 0,
        });
        console.log(`  ${ep.name}: ${res.status} — ${res.timings.duration.toFixed(0)}ms ${passed ? '✓' : '✗ FAILED'}`);
      });
    }
  });
}
