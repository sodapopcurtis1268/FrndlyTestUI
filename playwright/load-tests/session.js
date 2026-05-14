/**
 * session.js — Shared auth helper for k6 load tests.
 *
 * HOW SESSION-ID WORKS:
 *   The app stores a UUID as `v2-session-id` in localStorage after login.
 *   Every API call includes it as a `session-id` request header.
 *
 * FOR LOCAL / BASELINE RUNS:
 *   SESSION_ID is read from the FRNDLY_SESSION_ID env var, which you populate
 *   from playwright/.auth/user.json (v2-session-id value).
 *
 *   Extract it with:
 *     node -e "const d=require('./.auth/user.json');
 *       console.log(d.origins[0].localStorage.find(x=>x.name==='v2-session-id').value)"
 *
 * FOR FULL LOAD RUNS (multiple VUs):
 *   Each VU needs its own session. Use the k6 setup() pattern in each script:
 *   setup() logs in once, returns a pool of session IDs, and each VU picks one.
 *   Once the login endpoint is confirmed, update getSession() here to call it.
 */

export const API_BASE    = 'https://frndlytv-api.revlet.net';
export const TIVO_BASE   = 'https://op4fswl7z7.execute-api.us-east-1.amazonaws.com';
export const TENANT_CODE = 'frndlytv';

// Fully-qualified endpoint URLs (query params required for non-404 responses)
export const ENDPOINTS = {
  features:       `${API_BASE}/service/api/auth/new/features`,
  userInfo:       `${API_BASE}/service/api/auth/user/info`,
  activePackages: `${API_BASE}/service/api/auth/user/activepackages`,
  addonPackages:  `${API_BASE}/service/api/auth/v2/addon/packages`,
  pageContent:    `${API_BASE}/service/api/v1/page/content?path=home&count=25`,
  tivoContent:    `${API_BASE}/service/api/v1/tivo/content?path=homeScreen&carouselCount=10&assetsCount=30`,
  locationInfo:   `${API_BASE}/service/location/api/v1/locationinfo?tenant_code=frndlytv&product=frndlytv&client=web`,
  updatePref:     `${API_BASE}/service/api/auth/update/preference`,
};

/**
 * Returns the common headers required by every API call.
 * Pass a session-id obtained from setup() or __ENV.
 */
export function authHeaders(sessionId) {
  return {
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'session-id':      sessionId,
    'Origin':          'https://watch.frndlytv.com',
    'Referer':         'https://watch.frndlytv.com/',
  };
}

/**
 * Returns the session-id to use for this run.
 * Priority: FRNDLY_SESSION_ID env var → hard-coded fallback from last auth.
 *
 * Rotate the fallback periodically by re-running playwright setup:
 *   cd playwright && npx playwright test --project=setup
 */
export function getSessionId() {
  const envSession = __ENV.FRNDLY_SESSION_ID;
  if (envSession && envSession.length > 10) return envSession;
  // Fallback: last known good session from playwright/.auth/user.json
  // Refresh this by running: npx playwright test --project=setup
  return '2958c85e-7b77-403a-b390-fd09d7e88b8b';
}
