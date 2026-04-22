/**
 * Typed configuration loaded from environment variables.
 * Locally: values come from playwright/.env (via dotenv in playwright.config.ts).
 * CI: values are injected as GitHub Actions secrets.
 */

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  baseUrl:             optional('BASE_URL', 'https://try.frndlytv.com'),
  watchUrl:            optional('WATCH_URL', 'https://watch.frndlytv.com'),
  homeUrl:             optional('WATCH_URL', 'https://watch.frndlytv.com') + '/home',
  username:            required('USERNAME'),
  password:            required('PASSWORD'),
  videoPlaySeconds:    parseInt(optional('VIDEO_PLAY_SECONDS', '25'), 10),
  videoTimeoutSeconds: parseInt(optional('VIDEO_TIMEOUT_SECONDS', '30'), 10),
} as const;
