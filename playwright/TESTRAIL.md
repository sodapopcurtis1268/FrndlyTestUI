# TestRail Integration

This project automatically reports Playwright test results to TestRail after every run.

---

## Table of Contents

1. [How it works](#how-it-works)
2. [Setup](#setup)
3. [Tagging tests with case IDs](#tagging-tests-with-case-ids)
4. [Finding case IDs in TestRail](#finding-case-ids-in-testrail)
5. [TestRail API reference](#testrail-api-reference)
6. [CI/CD integration](#cicd-integration)
7. [Troubleshooting](#troubleshooting)

---

## How it works

The custom reporter (`utils/testrailReporter.ts`) runs as part of every Playwright suite:

```
Playwright run starts
  └─ Reporter: POST /add_run/243          ← creates a new TestRail run
       │
       ├─ test 1 ends → collect result
       ├─ test 2 ends → collect result
       └─ ...
  └─ Reporter: POST /add_results_for_cases/{run_id}  ← bulk-posts all results
```

Only tests tagged with `[C####]` in their title are sent to TestRail. Untagged tests are ignored by the reporter (they still appear in the HTML/JSON reports).

---

## Setup

### 1. Environment variables

Add the following to `playwright/.env` for local runs.  
In CI (GitHub Actions) add them as repository secrets.

| Variable               | Description                                      | Example                          |
|------------------------|--------------------------------------------------|----------------------------------|
| `TESTRAIL_URL`         | Base URL of your TestRail instance               | `https://frndlytv.testrail.io`   |
| `TESTRAIL_USER`        | Your TestRail login email                        | `you@example.com`                |
| `TESTRAIL_API_KEY`     | API key (not your password — see below)          | `abc123xyz...`                   |
| `TESTRAIL_PROJECT_ID`  | Numeric project ID (P243 → `243`)                | `243`                            |
| `TESTRAIL_SUITE_ID`    | *(Optional)* Suite ID for multi-suite projects   | `1`                              |
| `TESTRAIL_RUN_NAME`    | *(Optional)* Override the auto-generated run name| `Nightly - April 26`             |

### 2. Generating a TestRail API key

1. Log in to `https://frndlytv.testrail.io`
2. Click your name (top right) → **My Settings**
3. Scroll to **API Keys** → click **Add Key**
4. Copy the key into `TESTRAIL_API_KEY` in `.env`

> **Never commit your API key.** The `.env` file is in `.gitignore`.

### 3. Authentication

TestRail uses HTTP Basic Auth with your **email** and **API key** (not your password):

```
Authorization: Basic base64(email:api_key)
```

Example (Node.js):
```typescript
const auth = Buffer.from(`you@example.com:your-api-key`).toString('base64');
// → Authorization: Basic eW91QGV4YW1wbGUuY29tOnlvdXItYXBpLWtleQ==
```

---

## Tagging tests with case IDs

Add `[C####]` anywhere in the test title. The reporter extracts the number and maps the result to that TestRail case.

```typescript
// liveNow.spec.ts
test(`@smoke Live Now — first asset TTFF [C1001]`, async ({ page }) => {
  // ...
});

// closedCaptions.spec.ts
test(`Player — closed captions toggle [C1042]`, async ({ page }) => {
  // ...
});

// guideChannelCC.spec.ts
test(`Guide CC [mode=on] [channels=all] [C1100]`, async ({ page }) => {
  // ...
});
```

### Status mapping

| Playwright result | TestRail status |
|-------------------|-----------------|
| `passed`          | 1 — Passed      |
| `failed`          | 5 — Failed      |
| `timedOut`        | 5 — Failed      |
| `skipped`         | 4 — Retest      |

Failed tests include the error message (up to 500 characters) in the TestRail result comment.

---

## Finding case IDs in TestRail

1. Go to `https://frndlytv.testrail.io` → your project
2. Click **Test Cases** in the left nav
3. Each case shows its ID in the format `C####` in the leftmost column
4. Copy the number (without the `C`) into your test title as `[C####]`

---

## TestRail API reference

Base URL for all API calls:
```
https://frndlytv.testrail.io/index.php?/api/v2/{endpoint}
```

> Note: The `?` is part of TestRail's routing, not a query string. Always include it literally.

### GET /get_project/{project_id}

Verify the project exists and retrieve its details.

```bash
curl -u "you@example.com:your-api-key" \
  "https://frndlytv.testrail.io/index.php?/api/v2/get_project/243"
```

Response:
```json
{
  "id": 243,
  "name": "Frndly TV Web",
  "suite_mode": 1
}
```

`suite_mode`: `1` = single suite, `2` = single suite with baselines, `3` = multiple suites

---

### GET /get_suites/{project_id}

List all test suites (only needed for `suite_mode: 3`).

```bash
curl -u "you@example.com:your-api-key" \
  "https://frndlytv.testrail.io/index.php?/api/v2/get_suites/243"
```

Response:
```json
[
  { "id": 1, "name": "Regression Suite" },
  { "id": 2, "name": "Smoke Suite" }
]
```

---

### GET /get_cases/{project_id}

List all test cases in a project (add `&suite_id=1` for multi-suite projects).

```bash
curl -u "you@example.com:your-api-key" \
  "https://frndlytv.testrail.io/index.php?/api/v2/get_cases/243"
```

Response:
```json
[
  { "id": 1001, "title": "Live Now — first asset TTFF" },
  { "id": 1002, "title": "Trending Movies — TTFF" }
]
```

---

### POST /add_run/{project_id}

Create a new test run. This is what the reporter calls at the start of each Playwright run.

```bash
curl -u "you@example.com:your-api-key" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "name": "Playwright — 2026-04-26 15:30:00 UTC",
    "include_all": true
  }' \
  "https://frndlytv.testrail.io/index.php?/api/v2/add_run/243"
```

Request body:

| Field          | Type    | Description                                                   |
|----------------|---------|---------------------------------------------------------------|
| `name`         | string  | Display name for the run                                      |
| `include_all`  | boolean | `true` = include all cases; `false` = only `case_ids` below  |
| `case_ids`     | array   | Case IDs to include (only when `include_all: false`)          |
| `suite_id`     | integer | Required for multi-suite projects                             |
| `description`  | string  | *(Optional)* Run description                                  |

Response:
```json
{
  "id": 55,
  "name": "Playwright — 2026-04-26 15:30:00 UTC",
  "url": "https://frndlytv.testrail.io/index.php?/runs/view/55"
}
```

---

### POST /add_results_for_cases/{run_id}

Bulk-post results for multiple cases in one request. This is called at the end of each Playwright run.

```bash
curl -u "you@example.com:your-api-key" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "results": [
      { "case_id": 1001, "status_id": 1, "elapsed": "12s" },
      { "case_id": 1002, "status_id": 5, "elapsed": "30s", "comment": "video did not start within 30 s" }
    ]
  }' \
  "https://frndlytv.testrail.io/index.php?/api/v2/add_results_for_cases/55"
```

Each result object:

| Field       | Type    | Description                                     |
|-------------|---------|-------------------------------------------------|
| `case_id`   | integer | TestRail case ID (the `C####` number)           |
| `status_id` | integer | 1=Passed, 4=Retest, 5=Failed                    |
| `elapsed`   | string  | Duration string e.g. `"12s"`, `"2m 5s"`        |
| `comment`   | string  | *(Optional)* Error message or notes             |

---

### POST /add_case/{section_id}

Create a new test case (useful for auto-generating cases from test titles).

```bash
curl -u "you@example.com:your-api-key" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "title": "Guide CC — all channels pass"
  }' \
  "https://frndlytv.testrail.io/index.php?/api/v2/add_case/1"
```

Response:
```json
{ "id": 1103, "title": "Guide CC — all channels pass" }
```

---

### GET /get_runs/{project_id}

List all test runs for the project (useful for finding recent run IDs).

```bash
curl -u "you@example.com:your-api-key" \
  "https://frndlytv.testrail.io/index.php?/api/v2/get_runs/243"
```

---

### POST /close_run/{run_id}

Mark a run as completed (locks it from further edits).

```bash
curl -u "you@example.com:your-api-key" \
  -X POST \
  "https://frndlytv.testrail.io/index.php?/api/v2/close_run/55"
```

---

## CI/CD integration

In `.github/workflows/playwright.yml`, add the TestRail secrets to the environment:

```yaml
- name: Run Playwright tests
  env:
    USERNAME:             ${{ secrets.USERNAME }}
    PASSWORD:             ${{ secrets.PASSWORD }}
    TESTRAIL_URL:         ${{ secrets.TESTRAIL_URL }}
    TESTRAIL_USER:        ${{ secrets.TESTRAIL_USER }}
    TESTRAIL_API_KEY:     ${{ secrets.TESTRAIL_API_KEY }}
    TESTRAIL_PROJECT_ID:  ${{ secrets.TESTRAIL_PROJECT_ID }}
  run: npx playwright test --project=smoke
```

To add secrets in GitHub:  
**Repository → Settings → Secrets and variables → Actions → New repository secret**

---

## Troubleshooting

### `[TestRail] Skipped — TESTRAIL_* env vars not set.`
One or more of `TESTRAIL_URL`, `TESTRAIL_USER`, `TESTRAIL_API_KEY`, or `TESTRAIL_PROJECT_ID` is missing from `.env`. Check the file and make sure there are no trailing spaces.

### `[TestRail] Failed to create run: ...`
- Verify your API key is correct (regenerate in My Settings if unsure)
- Confirm the project ID is `243` (numeric, not `P243`)
- Check that your user has permission to create runs in the project

### `[TestRail] No [C###]-tagged tests found — nothing to post.`
No test titles contain `[C####]`. Add the tag to the tests you want reported (see [Tagging tests](#tagging-tests-with-case-ids)).

### `[TestRail] Failed to post results: unknown case ...`
The case ID in the test title doesn't exist in the TestRail project. Check the ID in TestRail → Test Cases and update the tag.

### Results posted but status is wrong
Confirm the test's Playwright status maps to the expected TestRail status (see [Status mapping](#status-mapping)).
