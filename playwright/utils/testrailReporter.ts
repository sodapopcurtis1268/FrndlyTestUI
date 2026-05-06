/**
 * TestRail reporter for Playwright.
 *
 * Automatically creates a TestRail run, posts test results, and attaches
 * screenshots and videos when credentials are configured.
 *
 * Tests are matched to TestRail cases by embedding the case ID in the title:
 *   test('Login loads within SLA [C1001]', async ({ page }) => { ... });
 *
 * Required env vars (in playwright/.env or CI secrets):
 *   TESTRAIL_URL         https://frndlytv.testrail.io
 *   TESTRAIL_USER        your-email@example.com
 *   TESTRAIL_API_KEY     your-api-key
 *   TESTRAIL_PROJECT_ID  172
 *
 * Optional:
 *   TESTRAIL_RUN_ID      Use an existing run ID instead of creating a new one
 *   TESTRAIL_SUITE_ID    Suite ID (required for multi-suite projects)
 *   TESTRAIL_RUN_NAME    Override the auto-generated run name
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
import * as https        from 'https';
import * as http         from 'http';
import * as fs           from 'fs';
import * as path         from 'path';

interface TRResult {
  case_id:     number;
  title:       string;
  status_id:   number;
  elapsed?:    string;
  comment?:    string;
  attachments: Array<{ name: string; contentType: string; path?: string; body?: Buffer }>;
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
  private readonly existingRunId: number | null;

  private runCreation: Promise<number | null> = Promise.resolve(null);
  private collected:   TRResult[]             = [];

  constructor() {
    const url    = process.env.TESTRAIL_URL        ?? '';
    const user   = process.env.TESTRAIL_USER       ?? '';
    const apiKey = process.env.TESTRAIL_API_KEY    ?? '';
    const projId = process.env.TESTRAIL_PROJECT_ID ?? '';

    this.enabled   = !!(url && user && apiKey && projId);
    this.auth      = Buffer.from(`${user}:${apiKey}`).toString('base64');
    this.projectId = projId;
    this.suiteId       = process.env.TESTRAIL_SUITE_ID ?? null;
    this.existingRunId = process.env.TESTRAIL_RUN_ID ? parseInt(process.env.TESTRAIL_RUN_ID, 10) : null;
    this.runName   = process.env.TESTRAIL_RUN_NAME
      ?? `Playwright — ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`;

    try {
      const parsed  = new URL(url);
      this.hostname = parsed.hostname;
      this.protocol = parsed.protocol as 'https:' | 'http:';
    } catch {
      this.hostname = '';
      this.protocol = 'https:';
    }

    console.log(
      `[TestRail] Config — enabled=${this.enabled}` +
      ` url=${url || '(not set)'}` +
      ` user=${user || '(not set)'}` +
      ` apiKey=${apiKey ? apiKey.slice(0, 4) + '…' : '(not set)'}` +
      ` projectId=${projId || '(not set)'}` +
      ` suiteId=${this.suiteId ?? '(not set)'}` +
      ` runId=${this.existingRunId ?? '(none — will create)'}`,
    );
  }

  // ── HTTP helper ────────────────────────────────────────────────────────────
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
            Authorization:    `Basic ${this.auth}`,
            'Content-Type':   'application/json',
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

  // ── Multipart file attachment ──────────────────────────────────────────────
  private attachToResult(
    resultId: number,
    att: { name: string; contentType: string; path?: string; body?: Buffer },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let data: Buffer;
      try {
        data = att.path ? fs.readFileSync(att.path) : (att.body ?? Buffer.alloc(0));
      } catch {
        return resolve();   // file may not exist (video not flushed yet, etc.)
      }
      if (!data.length) return resolve();

      const ext      = att.contentType === 'video/webm' ? '.webm' : '.png';
      const filename = att.name.replace(/[^a-z0-9_\-. ]/gi, '_') + ext;
      const boundary = '----PlaywrightBoundary' + Date.now();
      const CRLF     = '\r\n';

      const header = Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="attachment"; filename="${filename}"${CRLF}` +
        `Content-Type: ${att.contentType}${CRLF}${CRLF}`,
      );
      const footer = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
      const body   = Buffer.concat([header, data, footer]);

      const mod = this.protocol === 'https:' ? https : http;
      const req = mod.request(
        {
          hostname: this.hostname,
          path:     `/index.php?/api/v2/add_attachment_to_result/${resultId}`,
          method:   'POST',
          headers:  {
            Authorization:    `Basic ${this.auth}`,
            'Content-Type':   `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
        },
        (res) => { res.resume(); res.on('end', resolve); },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // ── Multipart attachment to a run (not a result) ──────────────────────────
  private attachToRun(
    runId:       number,
    data:        Buffer,
    filename:    string,
    contentType: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!data.length) return resolve();

      const boundary = '----PlaywrightBoundary' + Date.now();
      const CRLF     = '\r\n';

      const header = Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="attachment"; filename="${filename}"${CRLF}` +
        `Content-Type: ${contentType}${CRLF}${CRLF}`,
      );
      const footer = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
      const body   = Buffer.concat([header, data, footer]);

      const mod = this.protocol === 'https:' ? https : http;
      const req = mod.request(
        {
          hostname: this.hostname,
          path:     `/index.php?/api/v2/add_attachment_to_run/${runId}`,
          method:   'POST',
          headers:  {
            Authorization:    `Basic ${this.auth}`,
            'Content-Type':   `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.error) reject(new Error(parsed.error));
              else resolve();
            } catch { resolve(); }
          });
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // ── Playwright reporter hooks ──────────────────────────────────────────────

  onBegin(): void {
    if (!this.enabled) {
      console.log('[TestRail] Skipped — TESTRAIL_* env vars not set.');
      return;
    }

    // If an existing run ID is supplied, skip run creation entirely.
    if (this.existingRunId) {
      console.log(`[TestRail] Using existing run #${this.existingRunId}.`);
      this.runCreation = Promise.resolve(this.existingRunId);
      return;
    }

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

    const match = test.title.match(/\[[Cc](\d+)\]/);
    if (!match) return;

    const elapsed  = Math.max(1, Math.ceil(result.duration / 1000));
    const statusId = TR_STATUS[result.status] ?? 4;
    const comment  = result.error?.message?.slice(0, 500);

    // Collect only image/video attachments (skip JSON data blobs)
    const attachments = result.attachments.filter(
      a => a.contentType === 'image/png' || a.contentType === 'video/webm',
    );

    this.collected.push({
      case_id:   parseInt(match[1], 10),
      title:     test.title,
      status_id: statusId,
      elapsed:   `${elapsed}s`,
      ...(comment ? { comment } : {}),
      attachments,
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
      // ── Post results ────────────────────────────────────────────────────────
      const res = await this.request(
        'POST',
        `add_results_for_cases/${runId}`,
        {
          results: this.collected.map(({ case_id, status_id, elapsed, comment }) => ({
            case_id,
            status_id,
            elapsed,
            ...(comment ? { comment } : {}),
          })),
        },
      );
      if (res?.error) throw new Error(res.error);
      console.log(`[TestRail] Posted ${this.collected.length} result(s) to run #${runId}.`);

      // ── Build case_id → result_id map from response ─────────────────────────
      // add_results_for_cases returns an array of { id, case_id, ... }
      const resultMap = new Map<number, number>();
      if (Array.isArray(res)) {
        for (const r of res) {
          if (r.case_id && r.id) resultMap.set(r.case_id, r.id);
        }
      }

      // ── Attach screenshots and videos ───────────────────────────────────────
      let attachCount = 0;
      for (const collected of this.collected) {
        const resultId = resultMap.get(collected.case_id);
        if (!resultId || collected.attachments.length === 0) continue;

        for (const att of collected.attachments) {
          try {
            await this.attachToResult(resultId, att);
            attachCount++;
          } catch (e: any) {
            console.warn(`[TestRail] Failed to attach "${att.name}" to result #${resultId}: ${e.message}`);
          }
        }
      }

      if (attachCount > 0) {
        console.log(`[TestRail] Attached ${attachCount} file(s) to results in run #${runId}.`);
      }

      // ── Post summary as run description (inline text, no file attachments) ──
      const STATUS_LABEL: Record<number, string> = { 1: 'passed', 4: 'skipped', 5: 'failed' };
      const passed  = this.collected.filter(r => r.status_id === 1).length;
      const failed  = this.collected.filter(r => r.status_id === 5).length;
      const skipped = this.collected.filter(r => r.status_id === 4).length;
      const total   = this.collected.length;

      const lines: string[] = [
        `Playwright run — ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
        `Totals: ${passed} passed, ${failed} failed, ${skipped} skipped (${total} total)`,
        '',
        'Results:',
        ...this.collected.map(r => {
          const status = STATUS_LABEL[r.status_id] ?? 'unknown';
          const line = `  [C${r.case_id}] ${r.title} — ${status} (${r.elapsed})`;
          return r.comment ? `${line}\n    ${r.comment}` : line;
        }),
      ];

      try {
        await this.request('POST', `update_run/${runId}`, { description: lines.join('\n') });
        console.log(`[TestRail] Posted summary as run description on run #${runId}.`);
      } catch (e: any) {
        console.warn(`[TestRail] Could not update run description: ${e.message}`);
      }

    } catch (err: any) {
      console.error(`[TestRail] Failed to post results: ${err.message}`);
    }
  }
}

export default TestRailReporter;
