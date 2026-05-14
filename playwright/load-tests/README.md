# FrndlyTV Load Tests

k6 load tests targeting `frndlytv-api.revlet.net`.

## Prerequisites

```bash
brew install k6
```

## Session ID

All tests require a valid `session-id`. Get a fresh one from the Playwright auth state:

```bash
cd playwright
npx playwright test --project=setup   # refreshes .auth/user.json

node -e "
  const d = require('./.auth/user.json');
  const s = d.origins[0].localStorage.find(x => x.name === 'v2-session-id');
  console.log(s.value);
"
```

Pass it to k6 via env var:

```bash
k6 run -e FRNDLY_SESSION_ID=<uuid> load-tests/smoke.js
```

Or hardcode the fallback in `session.js` (rotate periodically).

---

## Scripts

| Script | What it tests | Default load |
|---|---|---|
| `smoke.js` | All 7 endpoints, 1 VU, 1 iteration — confirms everything is reachable | 1 VU × 1 |
| `user-auth.js` | Auth API sequence (features → user/info → packages → addons) | Ramp 0→20→0 VUs over 5m |
| `home-content.js` | Full home screen load sequence (all 5 content calls) | Ramp 0→10→0 VUs over 5m |

---

## Running

### 1. Smoke check first (always)
```bash
cd playwright
k6 run -e FRNDLY_SESSION_ID=<uuid> load-tests/smoke.js
```
All checks must be green before running load scenarios.

### 2. Auth load test
```bash
k6 run -e FRNDLY_SESSION_ID=<uuid> load-tests/user-auth.js
```

### 3. Home screen load test
```bash
k6 run -e FRNDLY_SESSION_ID=<uuid> load-tests/home-content.js
```

### 4. Stress test (find the breaking point)
```bash
k6 run -e FRNDLY_SESSION_ID=<uuid> -e SCENARIO=stress load-tests/home-content.js
```

### 5. Soak test (30 min, check for memory/session drift)
```bash
k6 run -e FRNDLY_SESSION_ID=<uuid> -e SCENARIO=soak load-tests/home-content.js
```

---

## Thresholds

| Metric | Threshold | Rationale |
|---|---|---|
| `http_req_duration p(95)` | < 2000ms | Matches Playwright 2s home screen SLA |
| `latency_page_content p(95)` | < 3000ms | Content feed gets extra budget |
| `latency_auth_user_info p(95)` | < 1000ms | Auth must be fast — blocks all users |
| `http_req_failed` | < 1% | Error floor |
| `auth_error_rate` | < 0.5% | Tighter for auth |

---

## API Endpoints Under Test

All on `https://frndlytv-api.revlet.net`:

| Endpoint | Auth required | Purpose |
|---|---|---|
| `GET /service/api/auth/new/features` | No | Feature flags |
| `GET /service/api/auth/user/info` | Yes | Session validation + user profile |
| `GET /service/api/auth/user/activepackages` | Yes | Subscription entitlement |
| `GET /service/api/auth/v2/addon/packages` | Yes | Add-on catalog |
| `POST /service/api/auth/update/preference` | Yes | IP update (not load tested — POST) |
| `GET /service/api/v1/page/content` | Yes | Home screen content rows |
| `GET /service/api/v1/tivo/content` | Yes | TiVo/guide data |
| `GET /service/location/api/v1/locationinfo` | No | Geo lookup |

---

## Notes

- **Session-id scope**: Each test VU reuses the same session-id. For a true multi-user load test, you'd need unique session IDs per VU (requires locating the login endpoint).
- **Rate limiting**: The Frndly TV backend rate-limits repeated logins. Don't run `--project=setup` repeatedly in quick succession.
- **CDN / HLS streams**: Not load tested here — stream delivery is handled by the CDN (CloudFront/Roku), not the API server.
