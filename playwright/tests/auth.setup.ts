import { test as setup } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { FrndlyLoginPage } from '../pages/FrndlyLoginPage';
import { config } from '../utils/config';

/**
 * Global auth setup — runs once before all tests that depend on it.
 * Logs in and saves the browser storage state (cookies + localStorage) to
 * .auth/user.json so every test starts pre-authenticated without logging in.
 *
 * This eliminates ~15 min of login overhead on a 60-test CI run.
 */

const authFile = path.join(__dirname, '../.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Ensure the directory exists
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  await new FrndlyLoginPage(page).login(config.username, config.password);

  // Persist cookies + localStorage so downstream tests can reuse the session
  await page.context().storageState({ path: authFile });
  console.log(`Auth state saved to ${authFile}`);
});
