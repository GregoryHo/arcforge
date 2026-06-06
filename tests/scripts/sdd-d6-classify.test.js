/**
 * sdd-d6-classify.test.js — Tests for T4: classifyTrace decision branch +
 *   mechanicalAuthorizationCheck decision-trace existence check.
 *
 * T4 adds TRACE_DECISION_RE = /^(D-\d+):(.+)$/ and inserts a decision branch
 * in classifyTrace AFTER design, BEFORE qa (fixing the ordering bug where
 * D-014:… was misclassified as qa by TRACE_QA_RE).
 *
 * mechanicalAuthorizationCheck: decision-trace branch is EXISTENCE-ONLY for P1
 * (verify D-id exists in ledger; ERROR if not). No authorization semantics in P1.
 *
 * Regression: existing date/q_id/REQ-F* traces classify and authorize exactly as before.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// classifyTrace and TRACE_DECISION_RE exported for testing (see T4 implementation).
const {
  classifyTrace,
  TRACE_DECISION_RE,
  mechanicalAuthorizationCheck,
} = require('../../scripts/lib/sdd-validators');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir;

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-d6-classify-'));
}
function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}
function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  return full;
}

beforeEach(() => {
  tmpDir = makeTmpDir();
});
afterEach(() => cleanupDir(tmpDir));

// ---------------------------------------------------------------------------
// TRACE_DECISION_RE constant
// ---------------------------------------------------------------------------

describe('TRACE_DECISION_RE (T4)', () => {
  it('is exported from sdd-validators', () => {
    expect(TRACE_DECISION_RE).toBeDefined();
    expect(TRACE_DECISION_RE instanceof RegExp).toBe(true);
  });

  it('matches D-NNN:content pattern', () => {
    expect(TRACE_DECISION_RE.test('D-014:window=60s')).toBe(true);
    expect(TRACE_DECISION_RE.test('D-001:some content')).toBe(true);
    expect(TRACE_DECISION_RE.test('D-999:x')).toBe(true);
  });

  it('does not match qa-style patterns like q1:content', () => {
    expect(TRACE_DECISION_RE.test('q1:content')).toBe(false);
    expect(TRACE_DECISION_RE.test('q14:value')).toBe(false);
  });

  it('does not match date-style patterns', () => {
    expect(TRACE_DECISION_RE.test('2026-06-06:section')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyTrace — decision branch ordering fix
// ---------------------------------------------------------------------------

describe('classifyTrace — decision branch (T4)', () => {
  it('classifies D-014:window=60s as decision (not qa)', () => {
    const result = classifyTrace('D-014:window=60s');
    expect(result.type).toBe('decision');
    expect(result.d_id).toBe('D-014');
  });

  it('classifies D-001:something as decision', () => {
    const result = classifyTrace('D-001:something');
    expect(result.type).toBe('decision');
    expect(result.d_id).toBe('D-001');
  });

  it('classifies D-999:x as decision', () => {
    const result = classifyTrace('D-999:x');
    expect(result.type).toBe('decision');
    expect(result.d_id).toBe('D-999');
  });
});

// ---------------------------------------------------------------------------
// classifyTrace — regression: existing classifications unchanged
// ---------------------------------------------------------------------------

describe('classifyTrace — regression: existing trace types unchanged (T4)', () => {
  it('still classifies 2026-06-06:Architecture as design', () => {
    const result = classifyTrace('2026-06-06:Architecture');
    expect(result.type).toBe('design');
    expect(result.cited).toBe('Architecture');
  });

  it('still classifies q1:some content as qa', () => {
    const result = classifyTrace('q1:some content');
    expect(result.type).toBe('qa');
    expect(result.q_id).toBe('q1');
  });

  it('still classifies REQ-F010 as legacy', () => {
    const result = classifyTrace('REQ-F010');
    expect(result.type).toBe('legacy');
  });

  it('still classifies plain identifier without colon as legacy', () => {
    const result = classifyTrace('some-plain-id');
    expect(result.type).toBe('legacy');
  });

  it('still classifies 2026-04-27:some section as design', () => {
    const result = classifyTrace('2026-04-27:some section');
    expect(result.type).toBe('design');
    expect(result.cited).toBe('some section');
  });
});

// ---------------------------------------------------------------------------
// mechanicalAuthorizationCheck — decision trace: existence-only (P1)
// ---------------------------------------------------------------------------

const DESIGN_CONTENT = `
## Architecture

Some architecture details here.
`;

const LEDGER_WITH_D014 = [
  {
    'D-id': 'D-014',
    date: '2026-06-06',
    spec_version: 'v1',
    status: 'proposed',
    decision: 'Use window=60s.',
    why: 'Fits rate limits.',
    authorized_values: ['window=60s'],
  },
];

function makeSpec(traces) {
  const traceXml = traces
    .map(
      ({ req, crit, trace }) =>
        `<requirement id="${req}"><criterion id="${crit}"><trace>${trace}</trace></criterion></requirement>`,
    )
    .join('\n');
  return `<spec>${traceXml}</spec>`;
}

describe('mechanicalAuthorizationCheck — decision trace existence-only (T4)', () => {
  it('decision trace with D-id present in ledger passes (existence-only)', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'D-014:window=60s' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null, LEDGER_WITH_D014);
    expect(result.valid).toBe(true);
    expect(result.unauthorized_traces).toHaveLength(0);
  });

  it('decision trace with D-id NOT in ledger is flagged as unauthorized', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'D-999:some value' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null, LEDGER_WITH_D014);
    expect(result.valid).toBe(false);
    expect(result.unauthorized_traces).toHaveLength(1);
    expect(result.unauthorized_traces[0].trace_value).toContain('D-999');
  });

  it('decision trace with no ledger provided is flagged as unauthorized', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'D-014:window=60s' }]);
    // 4th arg omitted (no ledger)
    const result = mechanicalAuthorizationCheck(spec, designPath, null);
    expect(result.valid).toBe(false);
    expect(result.unauthorized_traces).toHaveLength(1);
  });

  it('decision trace with empty ledger is flagged as unauthorized', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'D-014:window=60s' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null, []);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mechanicalAuthorizationCheck — regression: existing behaviors unchanged
// ---------------------------------------------------------------------------

describe('mechanicalAuthorizationCheck — regression: existing behaviors (T4)', () => {
  const DESIGN_RICH = `
## Architecture

Some architecture details here.
Rate limit is 60 requests per minute.
`;

  const DECISION_LOG_YAML = `
- q_id: q1
  question: What is the rate limit?
  user_answer_verbatim: 60 requests per minute
  deferral_signal: false
`;

  it('design trace still authorized when section appears in design', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_RICH);
    const spec = makeSpec([
      { req: 'fr-001', crit: 'fr-001-ac1', trace: '2026-06-06:Architecture' },
    ]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null);
    expect(result.valid).toBe(true);
  });

  it('qa trace still authorized when content appears in user_answer_verbatim', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_RICH);
    const logPath = writeFile(tmpDir, 'decision-log.yaml', DECISION_LOG_YAML);
    const spec = makeSpec([
      { req: 'fr-001', crit: 'fr-001-ac1', trace: 'q1:60 requests per minute' },
    ]);
    const result = mechanicalAuthorizationCheck(spec, designPath, logPath);
    expect(result.valid).toBe(true);
  });

  it('REQ-F* legacy trace still skipped (not flagged)', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_RICH);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'REQ-F010' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null);
    expect(result.valid).toBe(true);
  });
});
