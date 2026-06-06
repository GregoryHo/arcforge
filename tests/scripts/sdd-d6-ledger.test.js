/**
 * sdd-d6-ledger.test.js — Tests for T3: parseDecisionLedger + validateDecisionLedger.
 *
 * T3 covers:
 *   parseDecisionLedger: parse decisions.yml (YAML sequence) into structured entries.
 *   validateDecisionLedger: pure function enforcing append-only + immutability rules.
 *   getHeadLedgerContent: git helper — returns content of path at HEAD, or null.
 *
 * S3: validateDecisionLedger is a PURE function; git helper is separate.
 * S4: per-D-id alignment, git edge cases, HEAD-relative semantics (S8 documented).
 *
 * git-in-tempdir pattern (first sdd test using git fixtures):
 *   uses mkdtempSync + execFileSync('git', ...) from coordinator-test-helpers pattern.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  parseDecisionLedger,
  parseDecisionLedgerContent,
  validateDecisionLedger,
  getHeadLedgerContent,
} = require('../../scripts/lib/sdd-utils');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENTRY_D001 = `- D-id: D-001
  date: 2026-06-06
  spec_version: v1
  status: proposed
  decision: Use JWT for authentication.
  why: Stateless, widely supported.
  authorized_values: []
`;

const ENTRY_D002 = `- D-id: D-002
  date: 2026-06-07
  spec_version: v1
  status: proposed
  decision: Use Redis for session cache.
  why: Low latency, high throughput.
  authorized_values: []
`;

const LEDGER_TWO_ENTRIES = ENTRY_D001 + ENTRY_D002;

const LEDGER_D001_ONLY = ENTRY_D001;

// ---------------------------------------------------------------------------
// Helpers for git fixture (first sdd git-in-tempdir test)
// ---------------------------------------------------------------------------

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-d6-ledger-'));
}

function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Create a git repo with decisions.yml committed at HEAD, then optionally
 * modify the working tree. Returns { root, decPath }. */
function setupGitRepo(headContent, workingContent = null) {
  const root = makeTmpDir();
  runGit(['init', '-q', '-b', 'main'], root);
  runGit(['config', 'user.email', 'test@example.com'], root);
  runGit(['config', 'user.name', 'Test User'], root);

  const specDir = path.join(root, 'specs', 'my-spec');
  fs.mkdirSync(specDir, { recursive: true });
  const decPath = path.join(specDir, 'decisions.yml');

  // If headContent is provided, commit it
  if (headContent !== null) {
    fs.writeFileSync(decPath, headContent, 'utf8');
    runGit(['add', '-A'], root);
    runGit(['commit', '-q', '-m', 'init ledger'], root);
  } else {
    // New repo with nothing committed (for new-file-not-in-HEAD test)
    fs.writeFileSync(path.join(root, 'README.md'), 'init\n');
    runGit(['add', '-A'], root);
    runGit(['commit', '-q', '-m', 'init'], root);
  }

  // If workingContent is provided, overwrite working tree (not committed)
  if (workingContent !== null) {
    fs.writeFileSync(decPath, workingContent, 'utf8');
  }

  return { root, decPath };
}

// ---------------------------------------------------------------------------
// parseDecisionLedger
// ---------------------------------------------------------------------------

describe('parseDecisionLedger (T3)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => cleanupDir(tmpDir));

  it('parses a valid two-entry ledger', () => {
    const filePath = path.join(tmpDir, 'decisions.yml');
    fs.writeFileSync(filePath, LEDGER_TWO_ENTRIES);
    const result = parseDecisionLedger(filePath);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]['D-id']).toBe('D-001');
    expect(result[1]['D-id']).toBe('D-002');
  });

  it('returns null for missing file', () => {
    const result = parseDecisionLedger(path.join(tmpDir, 'missing.yml'));
    expect(result).toBeNull();
  });

  it('returns null for empty file', () => {
    const filePath = path.join(tmpDir, 'decisions.yml');
    fs.writeFileSync(filePath, '');
    const result = parseDecisionLedger(filePath);
    expect(result).toBeNull();
  });

  it('parses optional fields when present', () => {
    const content = `- D-id: D-001
  date: 2026-06-06
  spec_version: v1
  status: superseded-by:D-002
  decision: Old decision.
  why: Old reason.
  authorized_values: []
  supersedes: null
  ratified_by: null
  principle_ref: P-1
`;
    const filePath = path.join(tmpDir, 'decisions.yml');
    fs.writeFileSync(filePath, content);
    const result = parseDecisionLedger(filePath);
    expect(result[0].principle_ref).toBe('P-1');
    // status with colon-in-value must round-trip through YAML parser intact.
    expect(result[0].status).toBe('superseded-by:D-002');
  });
});

// ---------------------------------------------------------------------------
// validateDecisionLedger (pure function)
// ---------------------------------------------------------------------------

describe('validateDecisionLedger — pure function (T3, S3)', () => {
  it('passes a valid single-entry ledger with no previous', () => {
    const current = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'Use JWT.',
        why: 'Stateless.',
        authorized_values: [],
      },
    ];
    const result = validateDecisionLedger(current, null);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passes a valid two-entry ledger with no previous', () => {
    const current = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'Decision 1.',
        why: 'Why 1.',
        authorized_values: [],
      },
      {
        'D-id': 'D-002',
        date: '2026-06-07',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'Decision 2.',
        why: 'Why 2.',
        authorized_values: [],
      },
    ];
    const result = validateDecisionLedger(current, null);
    expect(result.valid).toBe(true);
  });

  // --- Monotonicity + uniqueness ---

  it('errors on duplicate D-id', () => {
    const current = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'A.',
        why: 'B.',
        authorized_values: [],
      },
      {
        'D-id': 'D-001',
        date: '2026-06-07',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'C.',
        why: 'D.',
        authorized_values: [],
      },
    ];
    const result = validateDecisionLedger(current, null);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.toLowerCase().includes('duplicate') || e.includes('D-001')),
    ).toBe(true);
  });

  it('errors on non-monotonic D-id (D-002 before D-001)', () => {
    const current = [
      {
        'D-id': 'D-002',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'A.',
        why: 'B.',
        authorized_values: [],
      },
      {
        'D-id': 'D-001',
        date: '2026-06-07',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'C.',
        why: 'D.',
        authorized_values: [],
      },
    ];
    const result = validateDecisionLedger(current, null);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // --- Missing required fields ---

  it('errors when a required field is missing (decision)', () => {
    const current = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        why: 'Some why.',
        authorized_values: [],
      },
      // decision is missing
    ];
    const result = validateDecisionLedger(current, null);
    expect(result.valid).toBe(false);
  });

  // --- Immutability (per-D-id diff against previous) --- S4

  it('passes when appending a new entry without editing existing', () => {
    const previous = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'Use JWT.',
        why: 'Stateless.',
        authorized_values: [],
      },
    ];
    const current = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'Use JWT.',
        why: 'Stateless.',
        authorized_values: [],
      },
      {
        'D-id': 'D-002',
        date: '2026-06-07',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'Use Redis.',
        why: 'Low latency.',
        authorized_values: [],
      },
    ];
    const result = validateDecisionLedger(current, previous);
    expect(result.valid).toBe(true);
  });

  it('errors when decision text is edited in existing entry (S4)', () => {
    const previous = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'Use JWT.',
        why: 'Stateless.',
        authorized_values: [],
      },
    ];
    const current = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'Use OAuth.', // changed!
        why: 'Stateless.',
        authorized_values: [],
      },
    ];
    const result = validateDecisionLedger(current, previous);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('D-001') && e.toLowerCase().includes('decision')),
    ).toBe(true);
  });

  it('errors when why text is edited in existing entry (S4)', () => {
    const previous = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'Use JWT.',
        why: 'Stateless.',
        authorized_values: [],
      },
    ];
    const current = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'Use JWT.',
        why: 'Different reason.', // changed!
        authorized_values: [],
      },
    ];
    const result = validateDecisionLedger(current, previous);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('D-001') && e.toLowerCase().includes('why'))).toBe(
      true,
    );
  });

  it('allows only status changes that go through supersede (S4 status transitions)', () => {
    // Valid: accepted -> superseded-by:D-002 when D-002 exists with supersedes: D-001
    const previous = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'accepted',
        decision: 'Use JWT.',
        why: 'Stateless.',
        authorized_values: ['window=60s'],
        ratified_by: 'human@2026-06-06',
      },
    ];
    const current = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'superseded-by:D-002',
        decision: 'Use JWT.',
        why: 'Stateless.',
        authorized_values: ['window=60s'],
        ratified_by: 'human@2026-06-06',
      },
      {
        'D-id': 'D-002',
        date: '2026-06-07',
        spec_version: 'v2',
        status: 'proposed',
        decision: 'Use OAuth.',
        why: 'Better flow.',
        authorized_values: [],
        supersedes: 'D-001',
      },
    ];
    const result = validateDecisionLedger(current, previous);
    expect(result.valid).toBe(true);
  });

  it('errors on invalid status transition without matching supersedes entry', () => {
    const previous = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'accepted',
        decision: 'Use JWT.',
        why: 'Stateless.',
        authorized_values: ['window=60s'],
      },
    ];
    const current = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'superseded-by:D-002',
        decision: 'Use JWT.',
        why: 'Stateless.',
        authorized_values: ['window=60s'],
      },
      // Missing D-002 with supersedes: D-001
    ];
    const result = validateDecisionLedger(current, previous);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('D-001'))).toBe(true);
  });

  it('passes when new ledger (previous is null) — all entries are new', () => {
    const current = [
      {
        'D-id': 'D-001',
        date: '2026-06-06',
        spec_version: 'v1',
        status: 'proposed',
        decision: 'A.',
        why: 'B.',
        authorized_values: [],
      },
    ];
    const result = validateDecisionLedger(current, null);
    expect(result.valid).toBe(true);
  });

  it('passes when current is empty array', () => {
    const result = validateDecisionLedger([], null);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getHeadLedgerContent — git helper (S3 seam)
// ---------------------------------------------------------------------------

describe('getHeadLedgerContent — git helper (T3, S3, S4)', () => {
  it('returns content when file exists at HEAD', () => {
    const { root, decPath } = setupGitRepo(LEDGER_D001_ONLY);
    const content = getHeadLedgerContent(decPath, root);
    expect(content).not.toBeNull();
    expect(typeof content).toBe('string');
    expect(content).toContain('D-001');
    cleanupDir(root);
  });

  it('returns null when file is not tracked at HEAD (new file)', () => {
    // HEAD has no decisions.yml — it's a brand-new file in the working tree.
    const { root, decPath } = setupGitRepo(null);
    fs.mkdirSync(path.dirname(decPath), { recursive: true });
    fs.writeFileSync(decPath, LEDGER_D001_ONLY);
    const content = getHeadLedgerContent(decPath, root);
    expect(content).toBeNull();
    cleanupDir(root);
  });

  it('returns HEAD content not the working-tree version', () => {
    // HEAD has D-001 only; working tree has D-001 + D-002.
    const { root, decPath } = setupGitRepo(LEDGER_D001_ONLY, LEDGER_TWO_ENTRIES);
    const content = getHeadLedgerContent(decPath, root);
    expect(content).toContain('D-001');
    expect(content).not.toContain('D-002');
    cleanupDir(root);
  });

  it('returns null when not in a git repo (documented advisory no-op)', () => {
    // Non-repo directory: git binary fails, helper returns null (no-op).
    const tmpDir2 = makeTmpDir();
    const filePath = path.join(tmpDir2, 'decisions.yml');
    fs.writeFileSync(filePath, LEDGER_D001_ONLY);
    const content = getHeadLedgerContent(filePath, tmpDir2);
    expect(content).toBeNull();
    cleanupDir(tmpDir2);
  });
});

// ---------------------------------------------------------------------------
// parseDecisionLedgerContent — content-based parse (S3 seam)
// ---------------------------------------------------------------------------

describe('parseDecisionLedgerContent (T3, S3)', () => {
  it('parses a valid YAML sequence from content string', () => {
    const result = parseDecisionLedgerContent(LEDGER_D001_ONLY);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]['D-id']).toBe('D-001');
  });

  it('returns null for empty content', () => {
    expect(parseDecisionLedgerContent('')).toBeNull();
    expect(parseDecisionLedgerContent('   ')).toBeNull();
  });

  it('returns null for unparseable content', () => {
    expect(parseDecisionLedgerContent('not: yaml: at: all: {')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// End-to-end: getHeadLedgerContent → parseDecisionLedgerContent → validateDecisionLedger
// ---------------------------------------------------------------------------

describe('end-to-end: git helper → parse → validate (T3, S3)', () => {
  it('detects edited decision text vs HEAD (immutability violation)', () => {
    // Commit D-001, then modify decision text in working tree without committing.
    const { root, decPath } = setupGitRepo(LEDGER_D001_ONLY);
    // Tamper: overwrite decision field in working tree.
    const tampered = ENTRY_D001.replace('Use JWT for authentication.', 'Use OAuth instead.');
    fs.writeFileSync(decPath, tampered, 'utf8');

    // Compose: git helper → parse → validate.
    const headContent = getHeadLedgerContent(decPath, root);
    expect(headContent).not.toBeNull();
    const previous = parseDecisionLedgerContent(headContent);
    const current = parseDecisionLedgerContent(fs.readFileSync(decPath, 'utf8'));
    const result = validateDecisionLedger(current, previous);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('D-001') && e.toLowerCase().includes('decision')),
    ).toBe(true);

    cleanupDir(root);
  });

  it('passes when appending a new entry (clean append, no edit)', () => {
    // Commit D-001, then append D-002 in working tree.
    const { root, decPath } = setupGitRepo(LEDGER_D001_ONLY, LEDGER_TWO_ENTRIES);

    const headContent = getHeadLedgerContent(decPath, root);
    expect(headContent).not.toBeNull();
    const previous = parseDecisionLedgerContent(headContent);
    const current = parseDecisionLedgerContent(fs.readFileSync(decPath, 'utf8'));
    const result = validateDecisionLedger(current, previous);

    expect(result.valid).toBe(true);

    cleanupDir(root);
  });
});
