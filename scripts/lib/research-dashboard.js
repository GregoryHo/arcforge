/**
 * research-dashboard.js - Live web dashboard for research experiments
 *
 * Serves an SPA that displays experiment results from results.tsv,
 * research config, and real-time updates via SSE.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { readFileSafe } = require('./utils');

// ── TSV Parser ──────────────────────────────────────────────

function parseTsv(content) {
  if (!content || !content.trim()) return [];
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map((h) => h.trim());
  const experiments = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      const val = (values[j] || '').trim();
      row[headers[j]] = val;
    }
    if (row.metric_value !== undefined) {
      const num = parseFloat(row.metric_value);
      row.metric_value = Number.isNaN(num) ? null : num;
    }
    experiments.push(row);
  }
  return experiments;
}

// ── Config Parser ───────────────────────────────────────────

function parseConfig(content) {
  if (!content || !content.trim()) return {};

  const config = {};
  const titleMatch = content.match(/^#\s+Research Config:\s*(.+)/m);
  if (titleMatch) config.target = titleMatch[1].trim();

  // Split by ## headers, extract section name and body
  const parts = content.split(/^##\s+/m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf('\n');
    if (newlineIdx === -1) continue;
    const heading = part.slice(0, newlineIdx).trim();
    const body = part.slice(newlineIdx + 1).trim();
    const key = heading.toLowerCase().replace(/\s+/g, '_');
    if (!key || !body) continue;
    config[key] = body;

    // Extract structured fields from Goal section inline
    if (key === 'goal') {
      for (const line of body.split('\n')) {
        const [field, ...rest] = line.split(':');
        if (rest.length === 0) continue;
        const val = rest.join(':').trim();
        const normalized = field.trim().toLowerCase();
        if (normalized === 'metric') config.metric_name = val;
        else if (normalized === 'direction') config.direction = val;
        else if (normalized === 'target') config.target_value = val;
      }
    }
  }

  return config;
}

// ── Summary Computation ─────────────────────────────────────

function computeSummary(experiments, config) {
  const baseline = experiments.find((e) => e.status === 'baseline');
  const kept = experiments.filter((e) => e.status === 'keep');
  const discarded = experiments.filter((e) => e.status === 'discard');
  const crashed = experiments.filter((e) => e.status === 'crash');
  const lowerIsBetter = (config.direction || '').includes('lower');

  const validMetrics = experiments
    .filter((e) => e.metric_value !== null && e.metric_value !== undefined)
    .map((e) => e.metric_value);

  let best = null;
  if (validMetrics.length > 0) {
    best = lowerIsBetter ? Math.min(...validMetrics) : Math.max(...validMetrics);
  }

  let improvement = null;
  if (baseline && baseline.metric_value != null && best != null && baseline.metric_value !== 0) {
    const delta = best - baseline.metric_value;
    improvement = (Math.abs(delta) / Math.abs(baseline.metric_value)) * 100;
  }

  return {
    baseline: baseline ? baseline.metric_value : null,
    best,
    improvement: improvement != null ? Math.round(improvement * 100) / 100 : null,
    direction: lowerIsBetter ? 'lower-is-better' : 'higher-is-better',
    total: experiments.length,
    kept: kept.length,
    discarded: discarded.length,
    crashed: crashed.length,
  };
}

// ── SSE Client Management ───────────────────────────────────

function createSseManager() {
  const clients = new Set();

  function add(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    clients.add(res);
    res.on('close', () => clients.delete(res));
  }

  function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      client.write(msg);
    }
  }

  function closeAll() {
    for (const client of clients) client.end();
  }

  return { add, broadcast, closeAll, clients };
}

// ── File Watcher ────────────────────────────────────────────

function setupWatcher(resultsPath, sse) {
  let lastSize = 0;
  let debounceTimer = null;

  if (fs.existsSync(resultsPath)) {
    lastSize = fs.statSync(resultsPath).size;
  }

  function processChange() {
    let currentSize;
    try {
      currentSize = fs.statSync(resultsPath).size;
    } catch {
      return;
    }
    if (currentSize <= lastSize) {
      lastSize = currentSize;
      return;
    }

    const content = readFileSafe(resultsPath);
    const experiments = parseTsv(content);
    lastSize = currentSize;

    if (experiments.length > 0) {
      const latest = experiments[experiments.length - 1];
      sse.broadcast('new-experiment', latest);
    }
  }

  const watchers = [];
  const dir = path.dirname(resultsPath);
  if (fs.existsSync(dir)) {
    try {
      const w = fs.watch(dir, (_event, filename) => {
        if (filename !== path.basename(resultsPath)) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(processChange, 500);
      });
      watchers.push(w);
    } catch {
      /* fs.watch may not be available */
    }
  }

  const heartbeat = setInterval(() => {
    sse.broadcast('heartbeat', { time: new Date().toISOString() });
  }, 30000);

  return {
    close() {
      for (const w of watchers) w.close();
      clearInterval(heartbeat);
      clearTimeout(debounceTimer);
    },
  };
}

// ── Response Helpers ────────────────────────────────────────

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendError(res, status, message) {
  sendJson(res, { error: message }, status);
}

// ── Router ──────────────────────────────────────────────────

function createRouter(resultsPath, configPath, cachedHtml) {
  return (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === '/' || pathname === '/index.html') {
      return sendHtml(res, cachedHtml);
    }

    if (pathname === '/api/data') {
      const content = readFileSafe(resultsPath);
      const experiments = parseTsv(content);
      const configContent = readFileSafe(configPath);
      const config = parseConfig(configContent);
      const summary = computeSummary(experiments, config);
      return sendJson(res, { experiments, summary });
    }

    if (pathname === '/api/config') {
      const content = readFileSafe(configPath);
      const config = parseConfig(content);
      return sendJson(res, config);
    }

    sendError(res, 404, 'Not found');
  };
}

// ── Server Entry Point ──────────────────────────────────────

function startServer(options = {}) {
  const { resultsPath, configPath, port = 3000 } = options;

  if (!resultsPath) {
    console.error('Error: --results path required');
    process.exit(1);
  }

  const htmlPath = path.join(__dirname, 'research-dashboard.html');
  let cachedHtml;
  try {
    cachedHtml = fs.readFileSync(htmlPath, 'utf8');
  } catch {
    console.error(`Error: dashboard UI not found at ${htmlPath}`);
    process.exit(1);
  }

  const sse = createSseManager();
  const router = createRouter(resultsPath, configPath, cachedHtml);

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/api/events') {
        return sse.add(res);
      }
      router(req, res);
    } catch (err) {
      sendError(res, 500, err.message);
    }
  });

  const watcher = setupWatcher(resultsPath, sse);

  server.listen(port, () => {
    console.log(`Research dashboard: http://localhost:${port}`);
    console.log('Press Ctrl+C to stop');
  });

  const shutdown = () => {
    watcher.close();
    sse.closeAll();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  startServer,
  createRouter,
  parseTsv,
  parseConfig,
  computeSummary,
  createSseManager,
};
