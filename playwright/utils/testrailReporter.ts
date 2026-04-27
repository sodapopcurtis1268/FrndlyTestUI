/**
 * TestRail reporter for Playwright.
 *
 * Automatically creates a TestRail run and posts test results when credentials
 * are configured. Tests are matched to TestRail cases by embedding the case ID
 * in the test title:
 *
 *   test('Login loads within SLA [C1001]', async ({ page }) => { ... });
 *
 * Required env vars (in playwright/.env or CI secrets):
 *   TESTRAIL_URL         https://frndlytv.testrail.io
 *   TESTRAIL_USER        your-email@example.com
 *   TESTRAIL_API_KEY     your-api-key
 *   TESTRAIL_PROJECT_ID  243
 *
 * Optional:
 *   TESTRAIL_SUITE_ID    Suite ID (only needed for multi-suite projects)
 *   TESTRAIL_RUN_NAME    Override the auto-generated run name
 *
 * Registration in playwright.config.ts:
 *   reporter: [
 *     ['html', ...],
 *     ['./utils/testrailReporter.ts'],
 *   ]
 *
 * TestRail status IDs used:
 *   1 = Passed
 *   4 = Retest  (skipped / pending)
 *   5 = Failed
 */

import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import * as https from 'https';
import * as http from 'http';

interface TRResult {
  case_id:   number;
  status_id: number;
  elapsed?:  string;
  comment?:  string;
}

const TR_STATUS: Record<string, number> = {
  passed:      1,
  failed:      5,
  timedOut:    5,
  interrupted: 5,
  skipped:     4,
};

class TestRailReporter implements Reporter {
  private readonly enabled:   boolean;
  private readonly auth:      string;
  private readonly hostname:  string;
  private readonly protocol:  'https:' | 'http:';
  private readonly projectId: string;
  private readonly suiteId:   string | null;
  private readonly runName:   string;

  private runCreation: Promise<number | null> = Promise.resolve(null);
  private collected:   TRResult[]             = [];

  constructor() {
    const url      = process.env.TESTRAIL_URL        ?? '';
    const user     = process.env.TESTRAIL_USER       ?? '';
    const apiKey   = process.env.TESTRAIL_API_KEY    ?? '';
    const projId   = process.env.TESTRAIL_PROJECT_ID ?? '';

    this.enabled   = !!(url && user && apiKey && projId);
    this.auth      = Buffer.from(`${user}:${apiKey}`).toString('base64');
    this.projectId = projId;
    this.suiteId   = process.env.TESTRAIL_SUITE_ID ?? null;
    this.runName   = process.env.TESTRAIL_RUN_NAME
      ?? `Playwright — ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`;

    // Parse hostname / protocol from TESTRAIL_URL (e.g. https://frndlytv.testrail.io)
    try {
      const parsed  = new URL(url);
      this.hostname = parsed.hostname;
      this.protocol = parsed.protocol as 'https:' | 'http:';
    } catch {
      this.hostname = '';
      this.protocol = 'https:';
    }
  }

  // ── HTTP helper ────────────────────────────────────────────────────────────
  // TestRail's API path contains a literal '?' (e.g. /index.php?/api/v2/...)
  // which URL parsers treat as a query string separator — so we build the
  // path string manually and pass it directly to http(s).request.
  private request(method: 'GET' | 'POST', endpoint: string, body?: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const path = `/index.php?/api/v2/${endpoint}`;
      const data = body ? JSON.stringify(body) : '';
      const mod  = this.protocol === 'https:' ? https : http;

      const req = mod.request(
        {
          hostname: this.hostname,
          path,
          method,
          headers: {
            Authorization:  `Basic ${this.auth}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
          res.on('end', () => {
            try { resolve(JSON.parse(raw)); }
            catch { resolve(raw); }
          });
        },
      );

      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  // ── Playwright reporter hooks ──────────────────────────────────────────────

  onBegin(): void {
    if (!this.enabled) {
      console.log('[TestRail] Skipped — TESTRAIL_* env vars not set.');
      return;
    }

    // Kick off run creation immediately; await the Promise in onEnd.
    this.runCreation = (async (): Promise<number | null> => {
      try {
        const payload: Record<string, unknown> = {
          name:        this.runName,
          include_all: true,
        };
        if (this.suiteId) payload.suite_id = parseInt(this.suiteId, 10);

        const run = await this.request('POST', `add_run/${this.projectId}`, payload);
        if (!run?.id) throw new Error(`Unexpected response: ${JSON.stringify(run).slice(0, 200)}`);

        console.log(`[TestRail] Created run #${run.id}  →  ${run.url ?? this.hostname}`);
        return run.id as number;
      } catch (err: any) {
        console.error(`[TestRail] Failed to create run: ${err.message}`);
        return null;
      }
    })();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (!this.enabled) return;

    // Match [C123] or [c123] anywhere in the test title
    const match = test.title.match(/\[[Cc](\d+)\]/);
    if (!match) return;

    const elapsed   = Math.max(1, Math.ceil(result.duration / 1000));
    const statusId  = TR_STATUS[result.status] ?? 4;
    const comment   = result.error?.message?.slice(0, 500);

    this.collected.push({
      case_id:   parseInt(match[1], 10),
      status_id: statusId,
      elapsed:   `${elapsed}s`,
      ...(comment ? { comment } : {}),
    });
  }

  async onEnd(_result: FullResult): Promise<void> {
    if (!this.enabled) return;

    const runId = await this.runCreation;
    if (!runId) return;

    if (this.collected.length === 0) {
      console.log('[TestRail] No [C###]-tagged tests found — nothing to post.');
      return;
    }

    try {
      const res = await this.request(
        'POST',
        `add_results_for_cases/${runId}`,
        { results: this.collected },
      );
      if (res?.error) throw new Error(res.error);
      console.log(`[TestRail] Posted ${this.collected.length} result(s) to run #${runId}.`);
    } catch (err: any) {
      console.error(`[TestRail] Failed to post results: ${err.message}`);
    }
  }
}

export default TestRailReporter;
