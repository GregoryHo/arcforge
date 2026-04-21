/**
 * dashboard.js - Live web dashboard for eval results
 *
 * Serves an SPA that displays eval scenarios, run history,
 * A/B comparisons, transcripts, and real-time trial progress.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const eval_ = require('../../../scripts/lib/eval');
const stats = require('../../../scripts/lib/eval-stats');
const { classifyAssertions } = require('../../../scripts/lib/eval-graders');
const { sanitizeFilename } = require('../../../scripts/lib/utils');

// ── SSE Client Management ────────────────────────────────────

const sseClients = new Set();

function addSseClient(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  sseClients.add(res);
  res.on('close', () => sseClients.delete(res));
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

// ── File Watcher for Real-Time Updates ────────────────────────

function setupWatchers(projectRoot) {
  const resultsDir = path.join(projectRoot, eval_.RESULTS_DIR);
  const fileSizes = new Map();
  let debounceTimer = null;
  const pendingFiles = new Set();

  function processChanges() {
    for (const relFile of pendingFiles) {
      const absPath = path.join(resultsDir, relFile);
      if (!relFile.endsWith('.jsonl')) continue;
      if (!fs.existsSync(absPath)) {
        fileSizes.delete(absPath);
        continue;
      }

      const currentSize = fs.statSync(absPath).size;
      const lastSize = fileSizes.get(absPath) || 0;
      if (currentSize <= lastSize) {
        fileSizes.set(absPath, currentSize);
        continue;
      }

      const buf = Buffer.alloc(currentSize - lastSize);
      const fd = fs.openSync(absPath, 'r');
      try {
        fs.readSync(fd, buf, 0, buf.length, lastSize);
      } finally {
        fs.closeSync(fd);
      }
      fileSizes.set(absPath, currentSize);

      const newLines = buf
        .toString('utf8')
        .split('\n')
        .filter((l) => l.trim());
      for (const line of newLines) {
        try {
          const result = JSON.parse(line);
          broadcast('trial-complete', result);
        } catch {
          /* skip malformed */
        }
      }
    }
    pendingFiles.clear();
  }

  const watchers = [];

  function watchResultsDir() {
    if (!fs.existsSync(resultsDir)) return false;
    try {
      const w = fs.watch(resultsDir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        pendingFiles.add(filename);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(processChanges, 500);
      });
      watchers.push(w);
      return true;
    } catch {
      /* fs.watch may not support recursive on some platforms */
      return false;
    }
  }

  if (!watchResultsDir()) {
    // Results dir doesn't exist yet — poll until it appears
    const pollInterval = setInterval(() => {
      if (watchResultsDir()) clearInterval(pollInterval);
    }, 5000);
    watchers.push({ close: () => clearInterval(pollInterval) });
  }

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    broadcast('heartbeat', { time: new Date().toISOString() });
  }, 30000);

  return {
    close() {
      for (const w of watchers) w.close();
      clearInterval(heartbeat);
      clearTimeout(debounceTimer);
    },
  };
}

// ── Response Helpers ──────────────────────────────────────────

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function sendText(res, text, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function sendHtml(res, html) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function sendError(res, status, message) {
  sendJson(res, { error: message }, status);
}

// ── API Handlers ──────────────────────────────────────────────

function filterOpts(query) {
  const opts = {};
  if (query.model) opts.model = query.model;
  if (query.since) opts.since = query.since;
  return opts;
}

function handleApiScenarios(res, projectRoot) {
  const files = eval_.listScenarios(projectRoot);
  const scenarios = files.map((f) => {
    const s = eval_.parseScenario(f);
    const isAb = s.scope === 'skill' || s.scope === 'workflow';
    const resultsName = isAb ? `${s.name}-treatment` : s.name;
    let results = eval_.loadResults(resultsName, projectRoot, { version: s.version });
    if (results.length === 0 && isAb) {
      results = eval_.loadResults(s.name, projectRoot, { version: s.version });
    }
    const st = results.length > 0 ? stats.statsFromResults(results) : null;
    const verdictOpts = s.grader === 'model' ? { useCi: true } : {};
    return {
      name: s.name,
      scope: s.scope,
      grader: s.grader,
      target: s.target,
      assertionCount: s.assertions.length,
      status: results.length > 0 ? eval_.getVerdict(results, verdictOpts) : 'NO RUNS',
      resultCount: st ? st.count : 0,
      passRate: st ? st.passRate : 0,
      avgScore: st ? st.avg : 0,
      lastRun: results.length > 0 ? results[results.length - 1].timestamp : null,
    };
  });
  sendJson(res, { scenarios });
}

function handleApiRuns(res, projectRoot, scenarioName) {
  const resultsPath = path.join(projectRoot, eval_.RESULTS_DIR, scenarioName);
  if (!fs.existsSync(resultsPath)) return sendJson(res, { scenario: scenarioName, runs: [] });

  const scenario = eval_.findScenario(scenarioName, projectRoot);
  const version = scenario?.version;

  const entries = fs.readdirSync(resultsPath, { withFileTypes: true });
  const runs = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'transcripts') continue;
    const runDir = path.join(resultsPath, entry.name);
    const conditions = [];
    const runStats = {};
    let totalTrials = 0;
    let timestamp = null;

    for (const file of fs.readdirSync(runDir).filter((f) => f.endsWith('.jsonl'))) {
      const condition = file.replace('.jsonl', '');
      conditions.push(condition);
      const content = fs.readFileSync(path.join(runDir, file), 'utf8');
      const results = content
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter((r) => !version || (r.version || '1') === version);

      if (results.length > 0) {
        const s = stats.statsFromResults(results);
        runStats[condition] = {
          count: s.count,
          passRate: s.passRate,
          avg: s.avg,
        };
        totalTrials += results.length;
        if (!timestamp) timestamp = results[0].timestamp;
      }
    }

    if (totalTrials > 0) {
      runs.push({
        runId: entry.name,
        conditions,
        trialCount: totalTrials,
        timestamp,
        stats: runStats,
      });
    }
  }

  runs.sort((a, b) => (b.runId > a.runId ? 1 : -1));
  sendJson(res, { scenario: scenarioName, runs });
}

function handleApiResults(res, projectRoot, evalName, query) {
  const opts = filterOpts(query);
  const baseName = evalName.replace(/-(baseline|treatment)$/, '');
  const scenario = eval_.findScenario(baseName, projectRoot);
  if (scenario?.version) opts.version = scenario.version;
  const results = eval_.loadResults(evalName, projectRoot, opts);
  const st = results.length > 0 ? stats.statsFromResults(results) : null;
  sendJson(res, {
    eval: evalName,
    results: results.map((r) => ({
      ...trialSummary(r),
      k: r.k,
      grader: r.grader,
      error: r.error,
      errorType: r.errorType,
      gradeError: r.gradeError,
      infraError: r.infraError,
    })),
    stats: st,
  });
}

function handleApiCompare(res, projectRoot, scenarioName, query) {
  const opts = filterOpts(query);
  const scenario = eval_.findScenario(scenarioName, projectRoot);
  if (scenario?.version) opts.version = scenario.version;
  const baseline = eval_.loadResults(`${scenarioName}-baseline`, projectRoot, opts);
  const treatment = eval_.loadResults(`${scenarioName}-treatment`, projectRoot, opts);

  if (baseline.length === 0 && treatment.length === 0) {
    return sendError(res, 404, 'No A/B results found');
  }

  const bStats = baseline.length > 0 ? stats.statsFromResults(baseline) : null;
  const tStats = treatment.length > 0 ? stats.statsFromResults(treatment) : null;
  const delta = stats.computeDelta(baseline, treatment);
  const deltaCi = stats.ciForDelta(baseline, treatment);
  const verdict = stats.verdictFromDeltaCI(baseline, treatment);
  const metricDeltas = stats.computeMetricDeltas(baseline, treatment);

  sendJson(res, {
    scenario: scenarioName,
    baseline: { stats: bStats, results: baseline.map(trialSummary) },
    treatment: { stats: tStats, results: treatment.map(trialSummary) },
    delta: stats.round2(delta),
    deltaCi,
    verdict,
    metricDeltas,
  });
}

function trialSummary(r) {
  const actions = r.actions || null;
  const turnsUsed = actions ? actions.filter((a) => a.type === 'tool').length : null;
  return {
    trial: r.trial,
    passed: r.passed,
    score: r.score,
    timestamp: r.timestamp,
    model: r.model,
    runId: r.runId,
    transcript: r.transcript,
    assertionScores: r.assertionScores,
    evidence: r.evidence,
    blockRefs: r.blockRefs,
    artifacts: r.artifacts,
    graderOutput: r.graderOutput,
    actions,
    turnsUsed,
  };
}

function handleApiTranscript(res, projectRoot, query) {
  const relPath = query.path;
  if (!relPath) return sendError(res, 400, 'Missing path parameter');

  const resultsDir = path.resolve(projectRoot, eval_.RESULTS_DIR);
  const resolved = path.resolve(resultsDir, relPath);

  // Require a real path-segment boundary: bare equality with the dir,
  // OR resolved must start with `resultsDir + path.sep`. A naive
  // startsWith(resultsDir) lets sibling directories whose name shares
  // the prefix (e.g. `evals/results2`, `evals/results.bak`) bypass the
  // guard, exposing arbitrary files under the parent.
  const isInside =
    resolved === resultsDir || resolved.startsWith(resultsDir + path.sep);
  if (!isInside) {
    return sendError(res, 403, 'Path traversal not allowed');
  }
  if (!fs.existsSync(resolved)) return sendError(res, 404, 'Transcript not found');

  sendText(res, fs.readFileSync(resolved, 'utf8'));
}

function handleApiBenchmark(res, projectRoot) {
  const benchPath = path.join(projectRoot, eval_.BENCHMARKS_DIR, 'latest.json');
  if (!fs.existsSync(benchPath)) return sendJson(res, { generated: null, evals: {} });
  sendJson(res, JSON.parse(fs.readFileSync(benchPath, 'utf8')));
}

function handleApiScenario(res, projectRoot, name) {
  const s = eval_.findScenario(name, projectRoot);
  if (!s) return sendError(res, 404, `Scenario "${name}" not found`);
  const { behavioral } = classifyAssertions(s.assertions);
  const behavioralIndices = new Set(behavioral.map((b) => b.originalIndex));
  const assertionTypes = s.assertions.map((_, i) =>
    behavioralIndices.has(i) ? 'behavioral' : 'text',
  );
  sendJson(res, {
    name: s.name,
    scope: s.scope,
    target: s.target,
    grader: s.grader,
    assertions: s.assertions,
    assertionTypes,
    ...(s.pluginDir ? { pluginDir: s.pluginDir } : {}),
    ...(s.maxTurns ? { maxTurns: s.maxTurns } : {}),
  });
}

// ── Feedback Handlers ─────────────────────────────────────────

/**
 * Validate that scenario and runId are safe path components.
 * Returns an error message if invalid, null if valid.
 * @param {string} scenario
 * @param {string} runId
 * @returns {string|null}
 */
function validateFeedbackComponents(scenario, runId) {
  if (!scenario || !runId) return 'Missing required fields: scenario and runId';
  try {
    sanitizeFilename(scenario);
    sanitizeFilename(runId);
  } catch (err) {
    return err.message;
  }
  return null;
}

function feedbackFilePath(projectRoot, scenario, runId) {
  return path.join(projectRoot, eval_.RESULTS_DIR, scenario, runId, 'feedback.json');
}

function handleGetFeedback(res, projectRoot, query) {
  const { scenario, runId } = query;
  const err = validateFeedbackComponents(scenario, runId);
  if (err) return sendError(res, 400, err);

  const fPath = feedbackFilePath(projectRoot, scenario, runId);
  if (!fs.existsSync(fPath)) return sendJson(res, {});

  try {
    sendJson(res, JSON.parse(fs.readFileSync(fPath, 'utf8')));
  } catch {
    sendJson(res, {});
  }
}

function handlePostFeedback(req, res, projectRoot) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return sendError(res, 400, 'Invalid JSON body');
    }

    const { scenario, runId, trialId, feedback } = body;
    if (!trialId || feedback === undefined) {
      return sendError(res, 400, 'Missing required fields: trialId and feedback');
    }

    const err = validateFeedbackComponents(scenario, runId);
    if (err) return sendError(res, 400, err);

    const fPath = feedbackFilePath(projectRoot, scenario, runId);
    const dir = path.dirname(fPath);
    fs.mkdirSync(dir, { recursive: true });

    let existing = {};
    if (fs.existsSync(fPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(fPath, 'utf8'));
      } catch {
        existing = {};
      }
    }
    existing[trialId] = feedback;
    existing.last_saved = new Date().toISOString();
    fs.writeFileSync(fPath, JSON.stringify(existing, null, 2));
    sendJson(res, { ok: true });
  });
}

// ── Router ────────────────────────────────────────────────────

function createRouter(projectRoot, cachedHtml) {
  return (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams);
    const method = req.method || 'GET';

    if (pathname === '/' || pathname === '/index.html') {
      return sendHtml(res, cachedHtml);
    }

    if (pathname === '/api/events') return addSseClient(res);
    if (pathname === '/api/scenarios') return handleApiScenarios(res, projectRoot);
    if (pathname === '/api/benchmark') return handleApiBenchmark(res, projectRoot);

    const scenarioMatch = pathname.match(/^\/api\/scenario\/(.+)$/);
    if (scenarioMatch) {
      return handleApiScenario(res, projectRoot, decodeURIComponent(scenarioMatch[1]));
    }

    const runsMatch = pathname.match(/^\/api\/runs\/(.+)$/);
    if (runsMatch) return handleApiRuns(res, projectRoot, decodeURIComponent(runsMatch[1]));

    const resultsMatch = pathname.match(/^\/api\/results\/(.+)$/);
    if (resultsMatch) {
      return handleApiResults(res, projectRoot, decodeURIComponent(resultsMatch[1]), query);
    }

    const compareMatch = pathname.match(/^\/api\/compare\/(.+)$/);
    if (compareMatch) {
      return handleApiCompare(res, projectRoot, decodeURIComponent(compareMatch[1]), query);
    }

    if (pathname === '/api/transcript') return handleApiTranscript(res, projectRoot, query);

    if (pathname === '/feedback') {
      if (method === 'POST') return handlePostFeedback(req, res, projectRoot);
      return handleGetFeedback(res, projectRoot, query);
    }

    sendError(res, 404, 'Not found');
  };
}

// ── Server Entry Point ────────────────────────────────────────

function startServer(projectRoot, options = {}) {
  const { port = 3333 } = options;

  const htmlPath = path.join(__dirname, 'eval-dashboard-ui.html');
  if (!fs.existsSync(htmlPath)) {
    console.error(`Error: dashboard UI not found at ${htmlPath}`);
    process.exit(1);
  }
  const cachedHtml = fs.readFileSync(htmlPath, 'utf8');

  const handler = createRouter(projectRoot, cachedHtml);
  const server = http.createServer((req, res) => {
    try {
      handler(req, res);
    } catch (err) {
      sendError(res, 500, err.message);
    }
  });

  const watcher = setupWatchers(projectRoot);

  server.listen(port, () => {
    console.log(`Eval dashboard: http://localhost:${port}`);
    console.log('Press Ctrl+C to stop');
  });

  const shutdown = () => {
    watcher.close();
    for (const client of sseClients) client.end();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { startServer, createRouter, handleApiTranscript, sseClients, addSseClient };
