const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createRouter } = require('../eval-dashboard');
const { RESULTS_DIR, SCENARIOS_DIR, BENCHMARKS_DIR } = require('../../../../scripts/lib/eval');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-dashboard-'));
}

function writeScenario(dir, filename, content) {
  const scenariosDir = path.join(dir, SCENARIOS_DIR);
  fs.mkdirSync(scenariosDir, { recursive: true });
  fs.writeFileSync(path.join(scenariosDir, filename), content);
}

function writeResult(dir, scenarioName, runId, condition, results) {
  const runDir = path.join(dir, RESULTS_DIR, scenarioName, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const jsonl = `${results.map((r) => JSON.stringify(r)).join('\n')}\n`;
  fs.writeFileSync(path.join(runDir, `${condition}.jsonl`), jsonl);
}

function writeTranscript(dir, scenarioName, runId, filename, content) {
  const transcriptsDir = path.join(dir, RESULTS_DIR, scenarioName, runId, 'transcripts');
  fs.mkdirSync(transcriptsDir, { recursive: true });
  fs.writeFileSync(path.join(transcriptsDir, filename), content);
}

function mockReqRes(url) {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body || '';
    },
    write() {},
    on() {},
  };
  const req = { url, headers: { host: 'localhost:3333' } };
  return { req, res };
}

function callRouter(router, url) {
  const { req, res } = mockReqRes(url);
  router(req, res);
  return {
    status: res.statusCode,
    json: () => JSON.parse(res.body),
    text: () => res.body,
  };
}

describe('dashboard', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Route Matching ──────────────────────────────────────────

  describe('routing', () => {
    it('should serve HTML at /', () => {
      const router = createRouter(tempDir, '<html>test</html>');
      const result = callRouter(router, '/');
      expect(result.status).toBe(200);
      expect(result.text()).toBe('<html>test</html>');
    });

    it('should return 404 for unknown routes', () => {
      const router = createRouter(tempDir, '<html></html>');
      const result = callRouter(router, '/unknown/path');
      expect(result.status).toBe(404);
      expect(result.json().error).toBe('Not found');
    });
  });

  // ── /api/scenarios ──────────────────────────────────────────

  describe('GET /api/scenarios', () => {
    it('should return empty array when no scenarios exist', () => {
      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/scenarios');
      expect(result.status).toBe(200);
      expect(result.json().scenarios).toEqual([]);
    });

    it('should return scenario metadata with status', () => {
      writeScenario(
        tempDir,
        'test-eval.md',
        '# Eval: test-eval\n\n## Scope\nagent\n\n## Scenario\nDo something.\n\n## Grader\ncode\n',
      );
      writeResult(tempDir, 'test-eval', '20260320-100000', 'results', [
        {
          eval: 'test-eval',
          trial: 1,
          k: 1,
          passed: true,
          score: 1.0,
          grader: 'code',
          timestamp: '2026-03-20T10:00:00Z',
        },
      ]);

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/scenarios');
      const { scenarios } = result.json();

      expect(scenarios).toHaveLength(1);
      expect(scenarios[0].name).toBe('test-eval');
      expect(scenarios[0].scope).toBe('agent');
      expect(scenarios[0].status).toBe('SHIP');
      expect(scenarios[0].passRate).toBe(1);
    });
  });

  // ── /api/runs/:name ──────────────────────────────────────────

  describe('GET /api/runs/:name', () => {
    it('should return empty runs for non-existent scenario', () => {
      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/runs/nonexistent');
      expect(result.json().runs).toEqual([]);
    });

    it('should list runs with per-condition stats', () => {
      writeResult(tempDir, 'my-eval', '20260320-100000', 'baseline', [
        {
          eval: 'my-eval-baseline',
          trial: 1,
          k: 1,
          passed: false,
          score: 0.25,
          grader: 'model',
          timestamp: '2026-03-20T10:00:00Z',
        },
      ]);
      writeResult(tempDir, 'my-eval', '20260320-100000', 'treatment', [
        {
          eval: 'my-eval-treatment',
          trial: 1,
          k: 1,
          passed: true,
          score: 1.0,
          grader: 'model',
          timestamp: '2026-03-20T10:00:01Z',
        },
      ]);

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/runs/my-eval');
      const { runs } = result.json();

      expect(runs).toHaveLength(1);
      expect(runs[0].runId).toBe('20260320-100000');
      expect(runs[0].conditions).toContain('baseline');
      expect(runs[0].conditions).toContain('treatment');
      expect(runs[0].stats.baseline.passRate).toBe(0);
      expect(runs[0].stats.treatment.passRate).toBe(1);
    });
  });

  // ── /api/compare/:name ────────────────────────────────────────

  describe('GET /api/compare/:name', () => {
    it('should return 404 when no results exist', () => {
      const router = createRouter(tempDir, '');
      fs.mkdirSync(path.join(tempDir, RESULTS_DIR), { recursive: true });
      const result = callRouter(router, '/api/compare/nonexistent');
      expect(result.status).toBe(404);
    });

    it('should return A/B comparison with delta and verdict', () => {
      writeResult(tempDir, 'ab-eval', '20260320-100000', 'baseline', [
        {
          eval: 'ab-eval-baseline',
          trial: 1,
          k: 2,
          passed: false,
          score: 0.25,
          grader: 'model',
          timestamp: '2026-03-20T10:00:00Z',
        },
        {
          eval: 'ab-eval-baseline',
          trial: 2,
          k: 2,
          passed: false,
          score: 0.25,
          grader: 'model',
          timestamp: '2026-03-20T10:00:01Z',
        },
      ]);
      writeResult(tempDir, 'ab-eval', '20260320-100000', 'treatment', [
        {
          eval: 'ab-eval-treatment',
          trial: 1,
          k: 2,
          passed: true,
          score: 1.0,
          grader: 'model',
          timestamp: '2026-03-20T10:00:02Z',
        },
        {
          eval: 'ab-eval-treatment',
          trial: 2,
          k: 2,
          passed: true,
          score: 1.0,
          grader: 'model',
          timestamp: '2026-03-20T10:00:03Z',
        },
      ]);

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/compare/ab-eval');
      const data = result.json();

      expect(data.delta).toBe(0.75);
      // k=2 per condition is below the k>=5 threshold — verdict is INSUFFICIENT_DATA
      expect(data.verdict).toBe('INSUFFICIENT_DATA');
      expect(data.baseline.stats.avg).toBe(0.25);
      expect(data.treatment.stats.avg).toBe(1.0);
    });
  });

  // ── /api/transcript ────────────────────────────────────────────

  describe('GET /api/transcript', () => {
    it('should return transcript content', () => {
      writeTranscript(tempDir, 'test', '20260320-100000', 'trial-1.txt', 'Hello transcript');

      const router = createRouter(tempDir, '');
      const result = callRouter(
        router,
        '/api/transcript?path=test/20260320-100000/transcripts/trial-1.txt',
      );
      expect(result.status).toBe(200);
      expect(result.text()).toBe('Hello transcript');
    });

    it('should reject path traversal', () => {
      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/transcript?path=../../etc/passwd');
      expect(result.status).toBe(403);
    });

    it('should reject sibling-prefix traversal even when names share prefix (F10)', () => {
      // Regression: startsWith(resultsDir) used to accept paths under
      // sibling directories whose name shared the prefix — e.g.
      // /tmp/.../evals/results2 starts with /tmp/.../evals/results, so
      // a request for ../results2/secret would have leaked. Fix requires
      // a real path-segment boundary check (=== or + path.sep).
      const evalsDir = path.join(tempDir, 'evals');
      fs.mkdirSync(evalsDir, { recursive: true });
      // Create a sibling whose name starts with "results" — this is the
      // attack surface the prefix-only check was vulnerable to.
      const siblingDir = path.join(evalsDir, 'results2');
      fs.mkdirSync(siblingDir, { recursive: true });
      fs.writeFileSync(path.join(siblingDir, 'secret.txt'), 'should not be readable');

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/transcript?path=../results2/secret.txt');
      expect(result.status).toBe(403);
    });

    it('should return 400 when path missing', () => {
      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/transcript');
      expect(result.status).toBe(400);
    });

    it('should return 404 for non-existent transcript', () => {
      const router = createRouter(tempDir, '');
      fs.mkdirSync(path.join(tempDir, RESULTS_DIR), { recursive: true });
      const result = callRouter(router, '/api/transcript?path=missing.txt');
      expect(result.status).toBe(404);
    });
  });

  // ── /api/benchmark ────────────────────────────────────────────

  describe('GET /api/benchmark', () => {
    it('should return empty benchmark when no file exists', () => {
      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/benchmark');
      expect(result.json().generated).toBeNull();
    });

    it('should return benchmark data from latest.json', () => {
      const benchDir = path.join(tempDir, BENCHMARKS_DIR);
      fs.mkdirSync(benchDir, { recursive: true });
      fs.writeFileSync(
        path.join(benchDir, 'latest.json'),
        JSON.stringify({ generated: '2026-03-20T10:00:00Z', evals: {} }),
      );

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/benchmark');
      expect(result.json().generated).toBe('2026-03-20T10:00:00Z');
    });
  });

  // ── Feature: dashboard-scenario-fields ──────────────────────────

  describe('GET /api/scenario/:name — scenario fields', () => {
    it('should return pluginDir and maxTurns when present', () => {
      writeScenario(
        tempDir,
        'plugin-eval.md',
        [
          '# Eval: plugin-eval',
          '',
          '## Scope',
          'skill',
          '',
          '## Scenario',
          'Test plugin behavior.',
          '',
          '## Plugin Dir',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: literal placeholder for harness substitution
          '${PROJECT_ROOT}/.claude-plugin',
          '',
          '## Max Turns',
          '15',
          '',
          '## Grader',
          'code',
        ].join('\n'),
      );

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/scenario/plugin-eval');
      const data = result.json();

      expect(result.status).toBe(200);
      expect(data.pluginDir).toBeDefined();
      expect(data.maxTurns).toBe(15);
    });

    it('should omit pluginDir and maxTurns when absent', () => {
      writeScenario(
        tempDir,
        'simple-eval.md',
        '# Eval: simple-eval\n\n## Scope\nagent\n\n## Scenario\nDo something.\n\n## Grader\ncode\n',
      );

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/scenario/simple-eval');
      const data = result.json();

      expect(data.pluginDir).toBeUndefined();
      expect(data.maxTurns).toBeUndefined();
    });
  });

  // ── Feature: dashboard-behavioral-assertions ────────────────────

  describe('GET /api/scenario/:name — assertion types', () => {
    it('should classify assertions as behavioral or text', () => {
      writeScenario(
        tempDir,
        'mixed-assert.md',
        [
          '# Eval: mixed-assert',
          '',
          '## Scope',
          'agent',
          '',
          '## Scenario',
          'Test mixed assertions.',
          '',
          '## Assertions',
          '- [ ] [tool_called] Bash:npm test',
          '- [ ] Output should mention success',
          '- [ ] [tool_before] Read:package.json < Bash:npm test',
          '',
          '## Grader',
          'mixed',
        ].join('\n'),
      );

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/scenario/mixed-assert');
      const data = result.json();

      expect(data.assertionTypes).toEqual(['behavioral', 'text', 'behavioral']);
    });
  });

  // ── Feature: dashboard-turns-used ──────────────────────────────

  describe('GET /api/results/:name — turns used', () => {
    it('should include turnsUsed computed from actions', () => {
      writeResult(tempDir, 'turns-eval', '20260320-100000', 'results', [
        {
          eval: 'turns-eval',
          trial: 1,
          k: 1,
          passed: true,
          score: 1.0,
          grader: 'code',
          timestamp: '2026-03-20T10:00:00Z',
          actions: [
            { type: 'tool', name: 'Read', args: 'file.js', index: 0 },
            { type: 'text', content: 'Analyzing...', index: 1 },
            { type: 'tool', name: 'Bash', args: 'npm test', index: 2 },
          ],
        },
      ]);

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/results/turns-eval');
      const data = result.json();

      expect(data.results[0].turnsUsed).toBe(2);
    });

    it('should return null turnsUsed when no actions', () => {
      writeResult(tempDir, 'no-actions', '20260320-100000', 'results', [
        {
          eval: 'no-actions',
          trial: 1,
          k: 1,
          passed: true,
          score: 1.0,
          grader: 'code',
          timestamp: '2026-03-20T10:00:00Z',
        },
      ]);

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/results/no-actions');
      const data = result.json();

      expect(data.results[0].turnsUsed).toBeNull();
    });
  });

  // ── Feature: dashboard-action-log ──────────────────────────────

  describe('GET /api/results/:name — action log', () => {
    it('should include actions in trial results', () => {
      const actions = [
        { type: 'tool', name: 'Read', args: 'src/main.js', index: 0 },
        { type: 'tool', name: 'Edit', args: 'src/main.js (replace "old" → "new")', index: 1 },
      ];
      writeResult(tempDir, 'action-eval', '20260320-100000', 'results', [
        {
          eval: 'action-eval',
          trial: 1,
          k: 1,
          passed: true,
          score: 1.0,
          grader: 'code',
          timestamp: '2026-03-20T10:00:00Z',
          actions,
        },
      ]);

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/results/action-eval');
      const data = result.json();

      expect(data.results[0].actions).toHaveLength(2);
      expect(data.results[0].actions[0].name).toBe('Read');
      expect(data.results[0].actions[1].name).toBe('Edit');
    });
  });

  // ── Feature: dashboard-mixed-grading ──────────────────────────

  describe('GET /api/results/:name — mixed grading', () => {
    it('should include grader type in trial results', () => {
      writeResult(tempDir, 'mixed-eval', '20260320-100000', 'results', [
        {
          eval: 'mixed-eval',
          trial: 1,
          k: 1,
          passed: true,
          score: 0.8,
          grader: 'mixed',
          timestamp: '2026-03-20T10:00:00Z',
          assertionScores: [1, 0, 1, 1],
        },
      ]);

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/results/mixed-eval');
      const data = result.json();

      expect(data.results[0].grader).toBe('mixed');
      expect(data.results[0].assertionScores).toEqual([1, 0, 1, 1]);
    });
  });

  // ── fr-dash-002: POST /feedback ─────────────────────────────────

  describe('POST /feedback — auto-saving feedback', () => {
    function mockPostReqRes(url, body) {
      let closeHandler = null;
      const res = {
        statusCode: null,
        headers: {},
        body: '',
        writeHead(status, headers) {
          this.statusCode = status;
          this.headers = headers || {};
        },
        end(b) {
          this.body = b || '';
        },
        write() {},
        on(event, fn) {
          if (event === 'close') closeHandler = fn;
        },
      };
      const bodyBuf = Buffer.from(JSON.stringify(body));
      const req = {
        url,
        method: 'POST',
        headers: { host: 'localhost:3333', 'content-type': 'application/json', 'content-length': String(bodyBuf.length) },
        _body: bodyBuf,
      };
      return { req, res, triggerClose: () => closeHandler && closeHandler() };
    }

    function callPostRouter(router, url, body) {
      const { req, res } = mockPostReqRes(url, body);
      // Simulate streaming body
      let dataHandler = null;
      let endHandler = null;
      req.on = (event, fn) => {
        if (event === 'data') dataHandler = fn;
        if (event === 'end') endHandler = fn;
      };
      router(req, res);
      if (dataHandler) dataHandler(req._body);
      if (endHandler) endHandler();
      return {
        status: res.statusCode,
        json: () => JSON.parse(res.body),
        text: () => res.body,
      };
    }

    it('should write feedback.json for a valid trial', () => {
      const router = createRouter(tempDir, '');
      const result = callPostRouter(router, '/feedback', {
        scenario: 'test-eval',
        runId: '20260320-100000',
        trialId: 'trial-1',
        feedback: 'This response is good.',
      });
      expect(result.status).toBe(200);
      const feedbackPath = path.join(
        tempDir,
        RESULTS_DIR,
        'test-eval',
        '20260320-100000',
        'feedback.json',
      );
      expect(fs.existsSync(feedbackPath)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
      expect(saved['trial-1']).toBe('This response is good.');
      expect(saved.last_saved).toBeDefined();
    });

    it('should merge feedback for multiple trials without overwriting', () => {
      const router = createRouter(tempDir, '');
      callPostRouter(router, '/feedback', {
        scenario: 'test-eval',
        runId: '20260320-100000',
        trialId: 'trial-1',
        feedback: 'First trial feedback.',
      });
      callPostRouter(router, '/feedback', {
        scenario: 'test-eval',
        runId: '20260320-100000',
        trialId: 'trial-2',
        feedback: 'Second trial feedback.',
      });
      const feedbackPath = path.join(
        tempDir,
        RESULTS_DIR,
        'test-eval',
        '20260320-100000',
        'feedback.json',
      );
      const saved = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
      expect(saved['trial-1']).toBe('First trial feedback.');
      expect(saved['trial-2']).toBe('Second trial feedback.');
    });

    it('should reject path traversal in scenario', () => {
      const router = createRouter(tempDir, '');
      const result = callPostRouter(router, '/feedback', {
        scenario: '../evil',
        runId: '20260320-100000',
        trialId: 'trial-1',
        feedback: 'Bad input.',
      });
      expect(result.status).toBe(400);
    });

    it('should reject path traversal in runId', () => {
      const router = createRouter(tempDir, '');
      const result = callPostRouter(router, '/feedback', {
        scenario: 'test-eval',
        runId: '../../etc',
        trialId: 'trial-1',
        feedback: 'Bad input.',
      });
      expect(result.status).toBe(400);
    });

    it('should return 400 when required fields are missing', () => {
      const router = createRouter(tempDir, '');
      const result = callPostRouter(router, '/feedback', {
        scenario: 'test-eval',
        // runId missing
        trialId: 'trial-1',
        feedback: 'Bad input.',
      });
      expect(result.status).toBe(400);
    });
  });

  // ── fr-dash-002: GET /feedback ──────────────────────────────────

  describe('GET /feedback — feedback restoration', () => {
    it('should return existing feedback.json for a run', () => {
      const feedbackDir = path.join(tempDir, RESULTS_DIR, 'fb-eval', '20260320-100000');
      fs.mkdirSync(feedbackDir, { recursive: true });
      fs.writeFileSync(
        path.join(feedbackDir, 'feedback.json'),
        JSON.stringify({ 'trial-1': 'Prior feedback', last_saved: '2026-04-01T00:00:00Z' }),
      );

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/feedback?scenario=fb-eval&runId=20260320-100000');
      expect(result.status).toBe(200);
      const data = result.json();
      expect(data['trial-1']).toBe('Prior feedback');
    });

    it('should return empty object when no feedback.json exists', () => {
      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/feedback?scenario=nonexistent&runId=run-1');
      expect(result.status).toBe(200);
      expect(result.json()).toEqual({});
    });

    it('should reject path traversal in GET /feedback', () => {
      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/feedback?scenario=../evil&runId=run-1');
      expect(result.status).toBe(400);
    });
  });

  // ── fr-dash-004: SSE subscription cleanup ──────────────────────

  describe('SSE subscription cleanup (fr-dash-004-ac3)', () => {
    it('should remove client on disconnect', () => {
      const { sseClients, addSseClient } = require('../eval-dashboard');
      const countBefore = sseClients.size;
      let closeFn = null;
      const fakeRes = {
        writeHead() {},
        write() {},
        end() {},
        on(event, fn) {
          if (event === 'close') closeFn = fn;
        },
      };
      addSseClient(fakeRes);
      expect(sseClients.size).toBe(countBefore + 1);
      closeFn(); // simulate client disconnect
      expect(sseClients.size).toBe(countBefore);
    });
  });

  // ── fr-dash-001: /api/compare includes metric deltas ───────────

  describe('GET /api/compare/:name — metric deltas (fr-dash-001-ac3)', () => {
    it('should include metricDeltas when results carry duration_ms and tokens', () => {
      writeResult(tempDir, 'metrics-eval', '20260320-100000', 'baseline', [
        { eval: 'metrics-eval-baseline', trial: 1, k: 2, passed: true, score: 0.8, grader: 'code', timestamp: '2026-03-20T10:00:00Z', duration_ms: 1000, input_tokens: 100, output_tokens: 50 },
        { eval: 'metrics-eval-baseline', trial: 2, k: 2, passed: true, score: 0.8, grader: 'code', timestamp: '2026-03-20T10:00:01Z', duration_ms: 2000, input_tokens: 200, output_tokens: 80 },
      ]);
      writeResult(tempDir, 'metrics-eval', '20260320-100000', 'treatment', [
        { eval: 'metrics-eval-treatment', trial: 1, k: 2, passed: true, score: 1.0, grader: 'code', timestamp: '2026-03-20T10:00:02Z', duration_ms: 1500, input_tokens: 120, output_tokens: 60 },
        { eval: 'metrics-eval-treatment', trial: 2, k: 2, passed: true, score: 1.0, grader: 'code', timestamp: '2026-03-20T10:00:03Z', duration_ms: 2500, input_tokens: 220, output_tokens: 90 },
      ]);

      const router = createRouter(tempDir, '');
      const result = callRouter(router, '/api/compare/metrics-eval');
      const data = result.json();

      expect(data.metricDeltas).toBeDefined();
      // baseline mean duration = 1500ms, treatment mean = 2000ms → delta = +500
      expect(data.metricDeltas.durationDelta).toBe(500);
      // baseline mean input_tokens = 150, treatment mean = 170 → delta = +20
      expect(data.metricDeltas.inputTokensDelta).toBe(20);
    });
  });
});
