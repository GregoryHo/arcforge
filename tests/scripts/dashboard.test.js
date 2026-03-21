const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { createRouter } = require('../../scripts/dashboard');
const { RESULTS_DIR, SCENARIOS_DIR, BENCHMARKS_DIR } = require('../../scripts/lib/eval');

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
  const jsonl = results.map((r) => JSON.stringify(r)).join('\n') + '\n';
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
      expect(data.verdict).toBe('IMPROVED');
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
});
