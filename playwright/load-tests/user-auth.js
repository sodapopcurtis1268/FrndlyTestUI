/**
 * user-auth.js — Load test: Auth API endpoints
 *
 * WHAT IT TESTS:
 *   The auth endpoints called on every session start. These are the most
 *   critical — if they degrade, every active user is impacted simultaneously.
 *
 *   Tests both the "cold" path (features before login) and the "warm" path
 *   (user info + packages after login).
 *
 * THRESHOLDS:
 *   p(95) < 1000ms for auth endpoints (tighter SLA than content)
 *   error rate < 0.5%
 *
 * RUN:
 *   cd playwright
 *   k6 run load-tests/user-auth.js
 *   k6 run -e FRNDLY_SESSION_ID=<uuid> load-tests/user-auth.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate }         from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { ENDPOINTS, authHeaders, getSessionId } from './session.js';

const authInfoLatency     = new Trend('latency_auth_user_info',     true);
const authPackageLatency  = new Trend('latency_auth_packages',      true);
const authAddonsLatency   = new Trend('latency_auth_addon_packages',true);
const authFeaturesLatency = new Trend('latency_auth_features',      true);
const authErrorRate       = new Rate('auth_error_rate');

export const options = {
  scenarios: {
    load: {
      executor:         'ramping-vus',
      startVUs:         0,
      gracefulRampDown: '30s',
      stages: [
        { duration: '1m',  target: 20 },
        { duration: '3m',  target: 20 },
        { duration: '1m',  target: 0  },
      ],
    },
  },
  thresholds: {
    http_req_duration:          ['p(95)<1000'],   // auth must be fast
    http_req_failed:            ['rate<0.005'],
    latency_auth_user_info:     ['p(95)<1000'],
    latency_auth_packages:      ['p(95)<1000'],
    auth_error_rate:            ['rate<0.005'],
  },
};

export function handleSummary(data) {
  return {
    'reports/user-auth-report.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

export default function () {
  const session = getSessionId();
  const headers = authHeaders(session);

  group('Auth API sequence', () => {

    // Feature flags — first call on page load, no auth required
    group('GET /auth/new/features', () => {
      const res = http.get(ENDPOINTS.features, { headers });
      authFeaturesLatency.add(res.timings.duration);
      const ok = check(res, {
        'features: 200':      r => r.status === 200,
        'features: fast':     r => r.timings.duration < 1000,
      });
      authErrorRate.add(!ok);
    });

    sleep(0.1);

    // User session validation — called immediately after auth check
    group('GET /auth/user/info', () => {
      const res = http.get(ENDPOINTS.userInfo, { headers });
      authInfoLatency.add(res.timings.duration);
      const ok = check(res, {
        'user/info: 200':     r => r.status === 200,
        'user/info: not 401': r => r.status !== 401,
        'user/info: fast':    r => r.timings.duration < 1000,
      });
      authErrorRate.add(!ok);
    });

    sleep(0.1);

    // Active subscription packages
    group('GET /auth/user/activepackages', () => {
      const res = http.get(ENDPOINTS.activePackages, { headers });
      authPackageLatency.add(res.timings.duration);
      const ok = check(res, {
        'activepackages: 200': r => r.status === 200,
      });
      authErrorRate.add(!ok);
    });

    sleep(0.1);

    // Add-on package catalog
    group('GET /auth/v2/addon/packages', () => {
      const res = http.get(ENDPOINTS.addonPackages, { headers });
      authAddonsLatency.add(res.timings.duration);
      const ok = check(res, {
        'addon/packages: 200': r => r.status === 200,
      });
      authErrorRate.add(!ok);
    });

  });

  sleep(Math.random() * 3 + 2);
}
