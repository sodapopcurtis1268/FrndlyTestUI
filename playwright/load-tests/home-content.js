/**
 * home-content.js — Load test: Home screen content feed
 *
 * WHAT IT TESTS:
 *   The full sequence of API calls made when a user loads the home screen:
 *     1. GET /auth/new/features     — feature flags (no auth needed)
 *     2. GET /auth/user/info        — session validation + user profile
 *     3. GET /auth/user/activepackages — subscription check
 *     4. GET /v1/page/content       — home screen content rows (heaviest call)
 *     5. GET /v1/tivo/content       — TiVo/guide content
 *
 * THRESHOLDS:
 *   p(95) < 2000ms   — matches the 2s SLA in loadTime.spec.ts
 *   error rate < 1%
 *
 * RUN:
 *   cd playwright
 *   k6 run load-tests/home-content.js
 *
 *   # Override session (from playwright/.auth/user.json v2-session-id):
 *   k6 run -e FRNDLY_SESSION_ID=<uuid> load-tests/home-content.js
 *
 *   # Smoke (1 VU, 30s):
 *   k6 run --vus 1 --duration 30s load-tests/home-content.js
 *
 *   # Stress (ramp to 50 VUs):
 *   k6 run -e SCENARIO=stress load-tests/home-content.js
 */

import http    from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate }         from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { ENDPOINTS, authHeaders, getSessionId } from './session.js';

// ── Custom metrics ────────────────────────────────────────────────────────────
const featuresLatency      = new Trend('latency_features',       true);
const userInfoLatency      = new Trend('latency_user_info',      true);
const activePackagesLatency= new Trend('latency_active_packages',true);
const pageContentLatency   = new Trend('latency_page_content',   true);
const tivoLatency          = new Trend('latency_tivo_content',   true);
const errorRate            = new Rate('error_rate');

// ── Scenarios ─────────────────────────────────────────────────────────────────
const SCENARIOS = {
  // Default: moderate ramp — good for CI gate
  default: {
    executor:           'ramping-vus',
    startVUs:           0,
    gracefulRampDown:   '30s',
    stages: [
      { duration: '1m',  target: 10 },  // ramp up
      { duration: '3m',  target: 10 },  // hold
      { duration: '30s', target: 0  },  // ramp down
    ],
  },
  // Stress: find the breaking point
  stress: {
    executor:         'ramping-vus',
    startVUs:         0,
    gracefulRampDown: '1m',
    stages: [
      { duration: '2m', target: 25  },
      { duration: '5m', target: 25  },
      { duration: '2m', target: 50  },
      { duration: '5m', target: 50  },
      { duration: '2m', target: 0   },
    ],
  },
  // Soak: long-running to catch memory/session leaks
  soak: {
    executor:         'constant-vus',
    vus:              10,
    duration:         '30m',
    gracefulStop:     '1m',
  },
};

export const options = {
  scenarios: { load: SCENARIOS[__ENV.SCENARIO ?? 'default'] },
  thresholds: {
    http_req_duration:      ['p(95)<2000'],
    http_req_failed:        ['rate<0.01'],
    latency_page_content:   ['p(95)<3000'],  // content feed gets extra budget
    error_rate:             ['rate<0.01'],
  },
};

// ── Summary / report ─────────────────────────────────────────────────────────
export function handleSummary(data) {
  const scenario = __ENV.SCENARIO ?? 'default';
  return {
    [`reports/home-content-${scenario}-report.html`]: htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

// ── Main VU function ──────────────────────────────────────────────────────────
export default function () {
  const session = getSessionId();
  const headers = authHeaders(session);

  group('Home screen load sequence', () => {

    // 1. Feature flags (no session required — happens before auth check)
    group('GET /auth/new/features', () => {
      const res = http.get(ENDPOINTS.features, { headers });
      featuresLatency.add(res.timings.duration);
      const ok = check(res, {
        'features: status 200': r => r.status === 200,
        'features: has body':   r => r.body.length > 0,
      });
      errorRate.add(!ok);
    });

    sleep(0.2);

    // 2. User info — validates session, returns profile
    group('GET /auth/user/info', () => {
      const res = http.get(ENDPOINTS.userInfo, { headers });
      userInfoLatency.add(res.timings.duration);
      const ok = check(res, {
        'user/info: status 200':      r => r.status === 200,
        'user/info: not 401/403':     r => r.status !== 401 && r.status !== 403,
      });
      errorRate.add(!ok);
    });

    sleep(0.1);

    // 3. Active packages — subscription entitlement check
    group('GET /auth/user/activepackages', () => {
      const res = http.get(ENDPOINTS.activePackages, { headers });
      activePackagesLatency.add(res.timings.duration);
      const ok = check(res, {
        'activepackages: status 200': r => r.status === 200,
      });
      errorRate.add(!ok);
    });

    sleep(0.3);

    // 4. Home page content feed — drives all content rows (heaviest call)
    group('GET /v1/page/content', () => {
      const res = http.get(ENDPOINTS.pageContent, { headers });
      pageContentLatency.add(res.timings.duration);
      const ok = check(res, {
        'page/content: status 200':   r => r.status === 200,
        'page/content: has data':     r => r.body.length > 100,
        'page/content: under 3s':     r => r.timings.duration < 3000,
      });
      errorRate.add(!ok);
    });

    sleep(0.2);

    // 5. TiVo content — guide/EPG data
    group('GET /v1/tivo/content', () => {
      const res = http.get(ENDPOINTS.tivoContent, { headers });
      tivoLatency.add(res.timings.duration);
      const ok = check(res, {
        'tivo/content: status 200': r => r.status === 200,
      });
      errorRate.add(!ok);
    });

  });

  // Simulate a user staying on the page for 3–8 seconds before the next load
  sleep(Math.random() * 5 + 3);
}
