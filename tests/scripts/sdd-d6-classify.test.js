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

describe('mechanicalAuthorizationCheck — decision trace authorization (T4/P3)', () => {
  it('decision trace with D-id present but proposed (no ratify) is unauthorized (P3 semantics)', () => {
    // P3 upgrade: existence-only is no longer sufficient. proposed entries do not authorize.
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'D-014:window=60s' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null, LEDGER_WITH_D014);
    expect(result.valid).toBe(false);
    expect(result.unauthorized_traces).toHaveLength(1);
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

// ---------------------------------------------------------------------------
// mechanicalAuthorizationCheck — P3: authorization semantics (Task 1)
// §4.3 a-d + §4.5: exact-match authorized_values, ratified_by required,
// status===accepted required. The keystone: value-blind leak BLOCKED.
// ---------------------------------------------------------------------------

// Shared ledger fixtures for Task 1 tests
const LEDGER_D014_ACCEPTED = [
  {
    'D-id': 'D-014',
    date: '2026-06-06',
    spec_version: 'v1',
    status: 'accepted',
    decision: 'Use window=60s for rate limiting. Considered 30s-600s range.',
    why: 'Balances security and usability.',
    authorized_values: ['window=60s'],
    ratified_by: 'alice@2026-06-06T10:00:00Z',
  },
];

const LEDGER_D014_PROPOSED = [
  {
    'D-id': 'D-014',
    date: '2026-06-06',
    spec_version: 'v1',
    status: 'proposed',
    decision: 'Use window=60s for rate limiting.',
    why: 'Balances security and usability.',
    authorized_values: ['window=60s'],
  },
];

const LEDGER_D014_ACCEPTED_NO_RATIFY = [
  {
    'D-id': 'D-014',
    date: '2026-06-06',
    spec_version: 'v1',
    status: 'accepted',
    decision: 'Use window=60s.',
    why: 'Reason.',
    authorized_values: ['window=60s'],
    // no ratified_by
  },
];

describe('mechanicalAuthorizationCheck — P3: authorization semantics (Task 1)', () => {
  // KEYSTONE TEST: value-blind leak blocked
  // "MUST window=600s" against ledger with authorized_values=["window=60s"] must ERROR
  it('KEYSTONE: value-blind leak blocked — wrong value 600s is unauthorized', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_CONTENT);
    // Criterion says window=600s; ledger only authorizes window=60s
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'D-014:window=600s' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null, LEDGER_D014_ACCEPTED);
    expect(result.valid).toBe(false);
    expect(result.unauthorized_traces).toHaveLength(1);
    expect(result.unauthorized_traces[0].trace_value).toBe('D-014:window=600s');
  });

  // KEYSTONE POSITIVE: legitimate authorized value passes
  it('KEYSTONE: legitimate value window=60s is authorized', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'D-014:window=60s' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null, LEDGER_D014_ACCEPTED);
    expect(result.valid).toBe(true);
    expect(result.unauthorized_traces).toHaveLength(0);
  });

  // D-014 status=proposed (not ratified) → ERROR
  it('proposed status (not accepted) is unauthorized', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'D-014:window=60s' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null, LEDGER_D014_PROPOSED);
    expect(result.valid).toBe(false);
    expect(result.unauthorized_traces).toHaveLength(1);
    expect(result.unauthorized_traces[0].reason).toMatch(/accepted/i);
  });

  // D-014 accepted but no ratified_by → ERROR
  it('accepted without ratified_by is unauthorized', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'D-014:window=60s' }]);
    const result = mechanicalAuthorizationCheck(
      spec,
      designPath,
      null,
      LEDGER_D014_ACCEPTED_NO_RATIFY,
    );
    expect(result.valid).toBe(false);
    expect(result.unauthorized_traces).toHaveLength(1);
    expect(result.unauthorized_traces[0].reason).toMatch(/ratified_by/i);
  });

  // Substring must NOT pass: authorized_values=["window=60s"], cited "60s" → ERROR
  it('substring of authorized value is NOT authorized (exact match required)', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'D-014:60s' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null, LEDGER_D014_ACCEPTED);
    expect(result.valid).toBe(false);
    expect(result.unauthorized_traces).toHaveLength(1);
  });

  // Regression: existing date/q_id/REQ-F traces still authorize exactly as before
  const DESIGN_RICH_P3 = `
## Architecture

Some architecture details here.
Rate limit is 60 requests per minute.
`;

  it('regression: design trace still authorized when section appears in design', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_RICH_P3);
    const spec = makeSpec([
      { req: 'fr-001', crit: 'fr-001-ac1', trace: '2026-06-06:Architecture' },
    ]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null, LEDGER_D014_ACCEPTED);
    expect(result.valid).toBe(true);
  });

  it('regression: qa trace still authorized when content in user_answer_verbatim', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_RICH_P3);
    const DECISION_LOG_YAML = `
- q_id: q1
  question: What is the rate limit?
  user_answer_verbatim: 60 requests per minute
  deferral_signal: false
`;
    const logPath = writeFile(tmpDir, 'decision-log-p3.yaml', DECISION_LOG_YAML);
    const spec = makeSpec([
      { req: 'fr-001', crit: 'fr-001-ac1', trace: 'q1:60 requests per minute' },
    ]);
    const result = mechanicalAuthorizationCheck(spec, designPath, logPath, LEDGER_D014_ACCEPTED);
    expect(result.valid).toBe(true);
  });

  it('regression: REQ-F* legacy trace still skipped (not flagged)', () => {
    const designPath = writeFile(tmpDir, 'design.md', DESIGN_RICH_P3);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'REQ-F010' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null, LEDGER_D014_ACCEPTED);
    expect(result.valid).toBe(true);
  });
});
