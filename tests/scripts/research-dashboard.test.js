const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  createRouter,
  parseTsv,
  parseConfig,
  computeSummary,
  createSseManager,
} = require('../../scripts/lib/research-dashboard');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-research-dashboard-'));
}

function writeFile(dir, filename, content) {
  fs.writeFileSync(path.join(dir, filename), content);
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
  const req = { url, headers: { host: 'localhost:3000' } };
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

// ── TSV Parser ──────────────────────────────────────────────

describe('parseTsv', () => {
  it('should parse valid TSV with header and data rows', () => {
    const tsv =
      'commit\tmetric_value\tstatus\tdescription\na1b2c3d\t0.997\tbaseline\tInitial baseline';
    const result = parseTsv(tsv);
    expect(result).toHaveLength(1);
    expect(result[0].commit).toBe('a1b2c3d');
    expect(result[0].metric_value).toBe(0.997);
    expect(result[0].status).toBe('baseline');
    expect(result[0].description).toBe('Initial baseline');
  });

  it('should return empty array for empty input', () => {
    expect(parseTsv('')).toEqual([]);
    expect(parseTsv(null)).toEqual([]);
    expect(parseTsv(undefined)).toEqual([]);
  });

  it('should return empty array for header-only TSV', () => {
    expect(parseTsv('commit\tmetric_value\tstatus\tdescription')).toEqual([]);
  });

  it('should parse multiple rows', () => {
    const tsv = [
      'commit\tmetric_value\tstatus\tdescription',
      'a1b2c3d\t0.997\tbaseline\tBaseline',
      'b2c3d4e\t0.891\tkeep\tReduced LR',
      'c3d4e5f\t0.912\tdiscard\tRegression',
    ].join('\n');
    const result = parseTsv(tsv);
    expect(result).toHaveLength(3);
    expect(result[1].metric_value).toBe(0.891);
    expect(result[1].status).toBe('keep');
  });

  it('should handle NaN metric values (crashes)', () => {
    const tsv = 'commit\tmetric_value\tstatus\tdescription\nd4e5f6g\tNaN\tcrash\tSegfault';
    const result = parseTsv(tsv);
    expect(result).toHaveLength(1);
    expect(result[0].metric_value).toBeNull();
    expect(result[0].status).toBe('crash');
  });

  it('should handle extra whitespace', () => {
    const tsv = '  commit \t metric_value \t status \n a1b \t 1.5 \t keep ';
    const result = parseTsv(tsv);
    expect(result).toHaveLength(1);
    expect(result[0].commit).toBe('a1b');
    expect(result[0].metric_value).toBe(1.5);
  });

  it('should handle missing values in row', () => {
    const tsv = 'commit\tmetric_value\tstatus\tdescription\na1b\t0.5\tkeep';
    const result = parseTsv(tsv);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('');
  });
});

// ── Config Parser ───────────────────────────────────────────

describe('parseConfig', () => {
  const sampleConfig = [
    '# Research Config: Build Time Optimization',
    '',
    '## Scope',
    'CAN modify: src/',
    'CANNOT modify: tests/',
    '',
    '## Goal',
    'Metric: build_time_seconds',
    'Direction: lower-is-better',
    'Target: < 30s',
    '',
    '## Evaluation',
    'Run command: npm run build 2>&1',
    'Extract metric: grep -oP "Time: \\K[\\d.]+" build.log',
    'Timeout: 300',
    '',
    '## Constraints',
    'Soft constraints: keep memory under 4GB',
    '',
    '## Autonomy',
    'Mode: run-until-interrupted',
    '',
    '## Simplicity Criterion',
    'Fewer lines changed from baseline.',
  ].join('\n');

  it('should extract target from title', () => {
    const config = parseConfig(sampleConfig);
    expect(config.target).toBe('Build Time Optimization');
  });

  it('should extract metric name and direction', () => {
    const config = parseConfig(sampleConfig);
    expect(config.metric_name).toBe('build_time_seconds');
    expect(config.direction).toBe('lower-is-better');
  });

  it('should extract goal section', () => {
    const config = parseConfig(sampleConfig);
    expect(config.goal).toContain('Metric: build_time_seconds');
    expect(config.goal).toContain('Direction: lower-is-better');
  });

  it('should extract scope section', () => {
    const config = parseConfig(sampleConfig);
    expect(config.scope).toContain('CAN modify: src/');
    expect(config.scope).toContain('CANNOT modify: tests/');
  });

  it('should extract evaluation section', () => {
    const config = parseConfig(sampleConfig);
    expect(config.evaluation).toContain('Run command: npm run build 2>&1');
  });

  it('should extract autonomy section', () => {
    const config = parseConfig(sampleConfig);
    expect(config.autonomy).toContain('Mode: run-until-interrupted');
  });

  it('should return empty object for empty input', () => {
    expect(parseConfig('')).toEqual({});
    expect(parseConfig(null)).toEqual({});
  });

  it('should handle missing optional sections', () => {
    const minimal = '# Research Config: Test\n\n## Goal\nMetric: foo\nDirection: higher-is-better';
    const config = parseConfig(minimal);
    expect(config.target).toBe('Test');
    expect(config.metric_name).toBe('foo');
    expect(config.scope).toBeUndefined();
  });
});

// ── Summary Computation ─────────────────────────────────────

describe('computeSummary', () => {
  it('should compute summary for lower-is-better', () => {
    const experiments = [
      { status: 'baseline', metric_value: 1.0 },
      { status: 'keep', metric_value: 0.8 },
      { status: 'discard', metric_value: 1.1 },
      { status: 'crash', metric_value: null },
    ];
    const summary = computeSummary(experiments, { direction: 'lower-is-better' });
    expect(summary.baseline).toBe(1.0);
    expect(summary.best).toBe(0.8);
    expect(summary.total).toBe(4);
    expect(summary.kept).toBe(1);
    expect(summary.discarded).toBe(1);
    expect(summary.crashed).toBe(1);
    expect(summary.improvement).toBe(20);
  });

  it('should compute summary for higher-is-better', () => {
    const experiments = [
      { status: 'baseline', metric_value: 0.5 },
      { status: 'keep', metric_value: 0.8 },
    ];
    const summary = computeSummary(experiments, { direction: 'higher-is-better' });
    expect(summary.best).toBe(0.8);
    expect(summary.improvement).toBe(60);
  });

  it('should handle empty experiments', () => {
    const summary = computeSummary([], {});
    expect(summary.baseline).toBeNull();
    expect(summary.best).toBeNull();
    expect(summary.total).toBe(0);
  });

  it('should handle all crashes', () => {
    const experiments = [
      { status: 'crash', metric_value: null },
      { status: 'crash', metric_value: null },
    ];
    const summary = computeSummary(experiments, {});
    expect(summary.best).toBeNull();
    expect(summary.crashed).toBe(2);
  });
});

// ── SSE Manager ─────────────────────────────────────────────

describe('createSseManager', () => {
  it('should create an SSE manager with add/broadcast/closeAll', () => {
    const sse = createSseManager();
    expect(typeof sse.add).toBe('function');
    expect(typeof sse.broadcast).toBe('function');
    expect(typeof sse.closeAll).toBe('function');
  });

  it('should track clients', () => {
    const sse = createSseManager();
    const fakeRes = {
      writeHead() {},
      on() {},
      write() {},
      end() {},
    };
    sse.add(fakeRes);
    expect(sse.clients.size).toBe(1);
  });

  it('should broadcast to all clients', () => {
    const sse = createSseManager();
    const messages = [];
    const fakeRes = {
      writeHead() {},
      on() {},
      write(msg) {
        messages.push(msg);
      },
      end() {},
    };
    sse.add(fakeRes);
    sse.broadcast('test-event', { foo: 'bar' });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('event: test-event');
    expect(messages[0]).toContain('"foo":"bar"');
  });
});

// ── Router ──────────────────────────────────────────────────

describe('router', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should serve HTML at /', () => {
    const resultsPath = path.join(tempDir, 'results.tsv');
    const configPath = path.join(tempDir, 'config.md');
    const router = createRouter(resultsPath, configPath, '<html>test</html>');
    const result = callRouter(router, '/');
    expect(result.status).toBe(200);
    expect(result.text()).toBe('<html>test</html>');
  });

  it('should return 404 for unknown routes', () => {
    const router = createRouter('', '', '');
    const result = callRouter(router, '/unknown');
    expect(result.status).toBe(404);
    expect(result.json().error).toBe('Not found');
  });

  it('should return experiment data at /api/data', () => {
    const resultsPath = path.join(tempDir, 'results.tsv');
    const configPath = path.join(tempDir, 'config.md');
    writeFile(
      tempDir,
      'results.tsv',
      'commit\tmetric_value\tstatus\tdescription\na1b\t1.0\tbaseline\tInit',
    );
    writeFile(
      tempDir,
      'config.md',
      '# Research Config: Test\n\n## Goal\nMetric: val\nDirection: lower-is-better',
    );

    const router = createRouter(resultsPath, configPath, '');
    const result = callRouter(router, '/api/data');
    const data = result.json();

    expect(result.status).toBe(200);
    expect(data.experiments).toHaveLength(1);
    expect(data.experiments[0].commit).toBe('a1b');
    expect(data.summary.baseline).toBe(1.0);
    expect(data.summary.total).toBe(1);
  });

  it('should return empty data when results file does not exist', () => {
    const router = createRouter(
      path.join(tempDir, 'missing.tsv'),
      path.join(tempDir, 'missing.md'),
      '',
    );
    const result = callRouter(router, '/api/data');
    const data = result.json();
    expect(data.experiments).toEqual([]);
    expect(data.summary.total).toBe(0);
  });

  it('should return config at /api/config', () => {
    const configPath = path.join(tempDir, 'config.md');
    writeFile(
      tempDir,
      'config.md',
      '# Research Config: My Target\n\n## Goal\nMetric: speed\nDirection: higher-is-better',
    );

    const router = createRouter('', configPath, '');
    const result = callRouter(router, '/api/config');
    const data = result.json();

    expect(result.status).toBe(200);
    expect(data.target).toBe('My Target');
    expect(data.metric_name).toBe('speed');
    expect(data.direction).toBe('higher-is-better');
  });

  it('should return empty config when file does not exist', () => {
    const router = createRouter('', path.join(tempDir, 'nope.md'), '');
    const result = callRouter(router, '/api/config');
    expect(result.status).toBe(200);
    expect(result.json()).toEqual({});
  });
});
