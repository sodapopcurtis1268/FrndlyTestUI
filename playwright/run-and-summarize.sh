#!/usr/bin/env bash
# run-and-summarize.sh
# Usage: ./run-and-summarize.sh [spec]
# Default: tests/liveNow.spec.ts

SPEC="${1:-tests/liveNow.spec.ts}"
export SUITE_NAME=$(basename "$SPEC" .spec.ts)

echo ""
echo "▶  Running: $SPEC"
echo ""

# Run headed with video
HEADLESS=false npx playwright test "$SPEC" --headed --project=smoke 2>&1

# Grab JSON for the summary (headless, silent)
JSON=$(npx playwright test "$SPEC" --project=smoke --reporter=json 2>/dev/null)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  EXECUTIVE SUMMARY — copy & paste to Slack"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "$JSON" | node -e "
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString()); }
  catch(e) { console.log('Could not parse results.'); return; }

  const stats   = data.stats ?? {};
  const passed  = stats.expected   || 0;
  const failed  = stats.unexpected || 0;
  const flaky   = stats.flaky      || 0;
  const skipped = stats.skipped    || 0;
  const total   = passed + failed + flaky + skipped;

  const BLOCKS     = 10;
  const greenCount = total > 0 ? Math.round(((passed+flaky)/total)*BLOCKS) : 0;
  const redCount   = failed > 0 ? Math.max(1, BLOCKS-greenCount) : 0;
  const greyCount  = BLOCKS - greenCount - redCount;
  const bar  = '🟩'.repeat(greenCount) + '🟥'.repeat(redCount) + '⬜'.repeat(greyCount);
  const pct  = total > 0 ? Math.round(((passed+flaky)/total)*100) : 0;
  const icon = failed > 0 ? '❌' : '✅';
  const name = process.env.SUITE_NAME ?? 'Tests';

  const suites = [];
  function walk(suite, parentPath) {
    if (!suite) return;
    const path = [parentPath, suite.title].filter(Boolean).join(' / ');
    (suite.suites||[]).forEach(s => walk(s, path));
    (suite.specs||[]).forEach(spec => {
      (spec.tests||[]).forEach(t => {
        const status   = t.results?.[0]?.status ?? 'unknown';
        const duration = t.results?.[0]?.duration ?? 0;
        suites.push({ title: [path, spec.title].filter(Boolean).join(' / '), status, duration });
      });
    });
  }
  (data.suites||[]).forEach(s => walk(s, ''));

  const lines = [
    '',
    '📺' + icon + ' Frndly TV — ' + name,
    '',
    bar + '  ' + pct + '% (' + (passed+flaky) + '/' + total + ' passed' +
      (skipped > 0 ? ' · ' + skipped + ' skipped' : '') +
      (flaky   > 0 ? ' · ' + flaky   + ' flaky'   : '') + ')',
    '',
  ];

  suites
    .filter(s => !s.title.includes('authenticate'))
    .forEach(s => {
      const ic = s.status==='passed'  ? '✅'
               : s.status==='failed'  ? '❌'
               : s.status==='skipped' ? '⏭️' : '🔁';
      lines.push(ic + ' ' + s.title + ' (' + (s.duration/1000).toFixed(1) + 's)');
    });

  if (failed > 0) {
    lines.push('');
    lines.push('❌ Failures:');
    suites.filter(s => s.status==='failed').forEach(s =>
      lines.push('  • ' + s.title)
    );
  }

  lines.push('');
  console.log(lines.join('\n'));
});
"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show video path
VIDEO=$(find test-results -name "video.webm" | sort -t/ -k2 | tail -1)
if [ -n "$VIDEO" ]; then
  echo "🎥 Video saved: $(pwd)/$VIDEO"
else
  echo "🎥 No video found (only recorded on failure by default)"
fi
echo ""
