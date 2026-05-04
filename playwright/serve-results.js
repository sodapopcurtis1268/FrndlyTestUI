#!/usr/bin/env node
/**
 * serve-results.js
 * Simple static web server for Playwright test results.
 *
 * Usage:
 *   node serve-results.js          # default port 8080
 *   node serve-results.js 9000     # custom port
 *
 * Serves:
 *   /          → landing page with links
 *   /report/   → playwright-report/ (HTML report)
 *   /videos/   → test-results/ (recorded videos)
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const PORT    = parseInt(process.argv[2] || '8080', 10);
const BASE    = __dirname;

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.txt':  'text/plain',
  '.zip':  'application/zip',
};

function serveFile(res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Content-Length': stat.size });
    fs.createReadStream(filePath).pipe(res);
  });
}

function serveDir(res, dirPath, urlPrefix, title) {
  fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Directory not found: ' + dirPath);
      return;
    }
    const rows = entries.map(e => {
      const href = urlPrefix + encodeURIComponent(e.name) + (e.isDirectory() ? '/' : '');
      const icon = e.isDirectory() ? '📁' : e.name.endsWith('.webm') ? '🎥' : '📄';
      return `<li>${icon} <a href="${href}">${e.name}</a></li>`;
    }).join('\n');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; background: #f9f9f9; }
  h2   { color: #333; }
  ul   { list-style: none; padding: 0; }
  li   { padding: 6px 0; border-bottom: 1px solid #eee; }
  a    { color: #0070f3; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .back { font-size: 0.9em; color: #666; }
</style>
</head><body>
<p class="back"><a href="/">← Home</a></p>
<h2>${title}</h2>
<ul>${rows}</ul>
</body></html>`);
  });
}

function landingPage(res) {
  const reportExists  = fs.existsSync(path.join(BASE, 'playwright-report', 'index.html'));
  const videosExist   = fs.existsSync(path.join(BASE, 'test-results'));

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Frndly TV — Test Results</title>
<style>
  body  { font-family: system-ui, sans-serif; max-width: 700px; margin: 60px auto; padding: 0 20px; background: #f9f9f9; }
  h1    { color: #222; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 20px 24px; margin: 16px 0; display: flex; align-items: center; gap: 16px; }
  .card a { font-size: 1.1em; font-weight: 600; color: #0070f3; text-decoration: none; }
  .card a:hover { text-decoration: underline; }
  .card p { margin: 4px 0 0; color: #666; font-size: 0.9em; }
  .dim  { color: #aaa; }
</style>
</head><body>
<h1>📺 Frndly TV — Test Results</h1>

<div class="card">
  <span style="font-size:2em">📊</span>
  <div>
    ${reportExists
      ? '<a href="/report/">HTML Report</a><p>Full Playwright report with test details, timings, and screenshots</p>'
      : '<span class="dim">HTML Report — not yet generated (run a test first)</span>'}
  </div>
</div>

<div class="card">
  <span style="font-size:2em">🎥</span>
  <div>
    ${videosExist
      ? '<a href="/videos/">Test Videos</a><p>Recorded video files from test runs (.webm)</p>'
      : '<span class="dim">Videos — no test-results folder found</span>'}
  </div>
</div>

<hr style="margin:32px 0; border:none; border-top:1px solid #eee">
<p style="color:#999; font-size:0.85em">Serving from: ${BASE}</p>
</body></html>`);
}

const server = http.createServer((req, res) => {
  const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);

  // Landing page
  if (reqPath === '/') {
    return landingPage(res);
  }

  // HTML report
  if (reqPath.startsWith('/report')) {
    const rel      = reqPath.replace(/^\/report/, '') || '/index.html';
    const filePath = path.join(BASE, 'playwright-report', rel);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      return serveDir(res, filePath, '/report' + rel, 'Report: ' + rel);
    }
    return serveFile(res, filePath);
  }

  // Videos / test-results
  if (reqPath.startsWith('/videos')) {
    const rel      = reqPath.replace(/^\/videos/, '') || '/';
    const filePath = path.join(BASE, 'test-results', rel);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return serveDir(res, filePath, '/videos' + rel, 'Videos: ' + rel);
    }
    return serveFile(res, filePath);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('');
  console.log('📺 Frndly TV Test Results Server');
  console.log(`   http://localhost:${PORT}`);
  console.log('');
  console.log('   /report/  → HTML report');
  console.log('   /videos/  → recorded videos');
  console.log('');
  console.log('   Press Ctrl+C to stop');
  console.log('');
});
