const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  DESIGN_DOC_RULES,
  SPEC_HEADER_RULES,
  PENDING_CONFLICT_RULES,
  DECISION_LOG_RULES,
  parseDesignDoc,
  validateDesignDoc,
  parseSpecHeader,
  validateSpecHeader,
  parseConflictMarker,
  parseDecisionLog,
  validateDecisionLog,
  mechanicalAuthorizationCheck,
} = require('../../scripts/lib/sdd-utils');
const {
  renderDesignHuman,
  renderSpecHuman,
  jsonifyRules,
} = require('../../scripts/lib/print-schema');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeFile(dir, relPath, content) {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}

const SUBSTANTIVE_CONTENT = `
## Problem

This system currently has no authentication. All requests are anonymous,
making it impossible to audit actions or enforce access control.

## Proposed Solution

Implement a stateless JWT-based authentication system with short-lived
access tokens and long-lived refresh tokens.

## Requirements

Support registration, login, logout, email verification, and password reset.
Passwords must be hashed with bcrypt. All endpoints must be rate-limited.

## Scope

Includes: registration, login, logout, email verification, password reset.
Excludes: OAuth, MFA, admin impersonation.
`;

// ---------------------------------------------------------------------------
// parseDesignDoc
// ---------------------------------------------------------------------------

describe('parseDesignDoc', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-utils-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null for a missing file', () => {
    const missingPath = path.join(tmpDir, 'docs/plans/my-spec/2026-01-01/design.md');
    const result = parseDesignDoc(missingPath, { cwd: tmpDir });
    expect(result).toBeNull();
  });

  it('extracts spec_id and iteration from a canonical path', () => {
    const filePath = writeFile(
      tmpDir,
      'docs/plans/auth-system/2026-03-15/design.md',
      SUBSTANTIVE_CONTENT,
    );
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result).not.toBeNull();
    expect(result.spec_id).toBe('auth-system');
    expect(result.iteration).toBe('2026-03-15');
  });

  it('returns hasPriorSpec=false when specs/<spec-id>/spec.xml does not exist', () => {
    const filePath = writeFile(
      tmpDir,
      'docs/plans/auth-system/2026-03-15/design.md',
      SUBSTANTIVE_CONTENT,
    );
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.hasPriorSpec).toBe(false);
  });

  it('returns hasPriorSpec=true when specs/<spec-id>/spec.xml exists', () => {
    const filePath = writeFile(
      tmpDir,
      'docs/plans/auth-system/2026-03-15/design.md',
      SUBSTANTIVE_CONTENT,
    );
    writeFile(
      tmpDir,
      'specs/auth-system/spec.xml',
      '<spec><overview><design_iteration>2026-01-01</design_iteration></overview></spec>',
    );
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.hasPriorSpec).toBe(true);
  });

  it('detects Context heading (case-insensitive, any heading level)', () => {
    const content =
      '# Title\n\n## CONTEXT\n\nSome context here.\n\n## Change Intent\n\nSome intent here.\n';
    const filePath = writeFile(tmpDir, 'docs/plans/auth-system/2026-03-15/design.md', content);
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.hasContext).toBe(true);
  });

  it('detects Change Intent heading (case-insensitive, any heading level)', () => {
    const content =
      '# Title\n\n## Context\n\nSome context here.\n\n### change intent\n\nSome intent here.\n';
    const filePath = writeFile(tmpDir, 'docs/plans/auth-system/2026-03-15/design.md', content);
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.hasChangeIntent).toBe(true);
  });

  it('detects missing Context heading', () => {
    const content = '# Title\n\n## Change Intent\n\nSome intent here.\n';
    const filePath = writeFile(tmpDir, 'docs/plans/auth-system/2026-03-15/design.md', content);
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.hasContext).toBe(false);
  });

  it('detects missing Change Intent heading', () => {
    const content = '# Title\n\n## Context\n\nSome context here.\n';
    const filePath = writeFile(tmpDir, 'docs/plans/auth-system/2026-03-15/design.md', content);
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.hasChangeIntent).toBe(false);
  });

  // The 2026-04-19 "Context heading" bug: the skill template instructed
  // "## Context (from spec v1)" but the validator regex rejected anything
  // after the keyword. These tests lock in the wider match form that
  // tolerates a suffix while still rejecting prefix-word collisions.
  it('accepts Context heading with parenthetical suffix (## Context (from spec v1))', () => {
    const content =
      '# Title\n\n## Context (from spec v1)\n\nBody text long enough to be substantive content for a design doc.\n\n## Change Intent\n\nSome intent.\n';
    const filePath = writeFile(tmpDir, 'docs/plans/auth-system/2026-03-15/design.md', content);
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.hasContext).toBe(true);
  });

  it('accepts Context heading with em-dash suffix (## Context — 2026-04-19)', () => {
    const content =
      '# Title\n\n## Context — 2026-04-19\n\nBody text long enough to be substantive content for a design doc.\n\n## Change Intent — OAuth\n\nSome intent.\n';
    const filePath = writeFile(tmpDir, 'docs/plans/auth-system/2026-03-15/design.md', content);
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.hasContext).toBe(true);
    expect(result.hasChangeIntent).toBe(true);
  });

  it('rejects prefix-word collisions (## Contextual Factors, ## Change Intentions)', () => {
    const content =
      '# Title\n\n## Contextual Factors\n\nPrefix-word heading body text content.\n\n## Change Intentions\n\nSuffix heading body text content.\n';
    const filePath = writeFile(tmpDir, 'docs/plans/auth-system/2026-03-15/design.md', content);
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.hasContext).toBe(false);
    expect(result.hasChangeIntent).toBe(false);
  });

  it('returns null for a non-standard path (not matching docs/plans/.../design.md)', () => {
    const filePath = writeFile(tmpDir, 'some/other/location/design.md', SUBSTANTIVE_CONTENT);
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result).toBeNull();
  });

  it('detects empty/stub content as non-substantive (less than 50 chars of non-heading content)', () => {
    const stubContent = '# Auth System\n\nTODO\n';
    const filePath = writeFile(tmpDir, 'docs/plans/auth-system/2026-03-15/design.md', stubContent);
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.hasSubstantiveContent).toBe(false);
  });

  it('detects substantive content (>= 50 chars of non-heading content)', () => {
    const filePath = writeFile(
      tmpDir,
      'docs/plans/auth-system/2026-03-15/design.md',
      SUBSTANTIVE_CONTENT,
    );
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.hasSubstantiveContent).toBe(true);
  });

  it('reads specDesignIteration from existing spec.xml in iteration mode', () => {
    const filePath = writeFile(
      tmpDir,
      'docs/plans/auth-system/2026-03-15/design.md',
      SUBSTANTIVE_CONTENT,
    );
    writeFile(
      tmpDir,
      'specs/auth-system/spec.xml',
      '<?xml version="1.0"?><spec><overview><design_iteration>2026-01-10</design_iteration></overview></spec>',
    );
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.specDesignIteration).toBe('2026-01-10');
  });

  it('specDesignIteration is null in initial mode', () => {
    const filePath = writeFile(
      tmpDir,
      'docs/plans/auth-system/2026-03-15/design.md',
      SUBSTANTIVE_CONTENT,
    );
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.specDesignIteration).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateDesignDoc
// ---------------------------------------------------------------------------

describe('validateDesignDoc', () => {
  it('returns ERROR for null input, field: file', () => {
    const result = validateDesignDoc(null);
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'file');
    expect(err).toBeDefined();
    expect(err.message).toMatch(/brainstorming/i);
  });

  it('returns ERROR for empty/stub content, field: content', () => {
    const parsed = {
      spec_id: 'auth-system',
      iteration: '2026-03-15',
      hasPriorSpec: false,
      hasContext: false,
      hasChangeIntent: false,
      hasSubstantiveContent: false,
      specDesignIteration: null,
    };
    const result = validateDesignDoc(parsed);
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'content');
    expect(err).toBeDefined();
  });

  it('passes a valid doc without a prior spec (new-spec case)', () => {
    const parsed = {
      spec_id: 'auth-system',
      iteration: '2026-03-15',
      hasPriorSpec: false,
      hasContext: false,
      hasChangeIntent: false,
      hasSubstantiveContent: true,
      specDesignIteration: null,
    };
    const result = validateDesignDoc(parsed);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });

  it('requires Context heading when a prior spec exists (ERROR, field: Context)', () => {
    const parsed = {
      spec_id: 'auth-system',
      iteration: '2026-03-15',
      hasPriorSpec: true,
      hasContext: false,
      hasChangeIntent: true,
      hasSubstantiveContent: true,
      specDesignIteration: '2026-01-10',
    };
    const result = validateDesignDoc(parsed);
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'Context');
    expect(err).toBeDefined();
  });

  it('requires Change Intent heading when a prior spec exists (ERROR, field: Change Intent)', () => {
    const parsed = {
      spec_id: 'auth-system',
      iteration: '2026-03-15',
      hasPriorSpec: true,
      hasContext: true,
      hasChangeIntent: false,
      hasSubstantiveContent: true,
      specDesignIteration: '2026-01-10',
    };
    const result = validateDesignDoc(parsed);
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'Change Intent');
    expect(err).toBeDefined();
  });

  it('warns on stale iteration date (WARNING, field: iteration) — valid remains true', () => {
    const parsed = {
      spec_id: 'auth-system',
      // iteration <= specDesignIteration triggers WARNING
      iteration: '2026-01-10',
      hasPriorSpec: true,
      hasContext: true,
      hasChangeIntent: true,
      hasSubstantiveContent: true,
      specDesignIteration: '2026-01-10',
    };
    const result = validateDesignDoc(parsed);
    expect(result.valid).toBe(true);
    const warn = result.issues.find((i) => i.level === 'WARNING' && i.field === 'iteration');
    expect(warn).toBeDefined();
  });

  it('passes a valid iteration doc (prior spec + both required headings)', () => {
    const parsed = {
      spec_id: 'auth-system',
      iteration: '2026-03-15',
      hasPriorSpec: true,
      hasContext: true,
      hasChangeIntent: true,
      hasSubstantiveContent: true,
      specDesignIteration: '2026-01-10',
    };
    const result = validateDesignDoc(parsed);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseSpecHeader
// ---------------------------------------------------------------------------

const V1_XML = `<spec><overview>
  <spec_id>auth</spec_id>
  <spec_version>1</spec_version>
  <status>active</status>
  <title>Auth System</title>
  <description>Per-user authentication</description>
  <source>
    <design_path>docs/plans/auth/2026-04-01/design.md</design_path>
    <design_iteration>2026-04-01</design_iteration>
  </source>
  <scope>
    <includes>
      <feature id="login">User login</feature>
    </includes>
    <excludes>
      <reason>OAuth deferred</reason>
    </excludes>
  </scope>
</overview></spec>`;

const V2_XML = `<spec><overview>
  <spec_id>auth</spec_id>
  <spec_version>2</spec_version>
  <status>active</status>
  <supersedes>auth:v1</supersedes>
  <title>Auth System</title>
  <description>Auth with OAuth</description>
  <source>
    <design_path>docs/plans/auth/2026-04-16/design.md</design_path>
    <design_iteration>2026-04-16</design_iteration>
  </source>
  <scope>
    <includes>
      <feature id="login">User login</feature>
      <feature id="oauth">OAuth support</feature>
    </includes>
  </scope>
  <delta version="2" iteration="2026-04-16">
    <added ref="fr-oauth-001">OAuth integration</added>
    <modified ref="fr-login-001">Updated login flow</modified>
  </delta>
</overview></spec>`;

describe('parseSpecHeader', () => {
  it('returns null for empty string input', () => {
    expect(parseSpecHeader('')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parseSpecHeader(null)).toBeNull();
  });

  it('returns null for XML without <overview> element', () => {
    expect(parseSpecHeader('<spec><body>no overview here</body></spec>')).toBeNull();
  });

  it('parses v1 spec header — all fields correct', () => {
    const result = parseSpecHeader(V1_XML);
    expect(result).not.toBeNull();
    expect(result.spec_id).toBe('auth');
    expect(result.spec_version).toBe(1);
    expect(result.status).toBe('active');
    expect(result.title).toBe('Auth System');
    expect(result.description).toBe('Per-user authentication');
    expect(result.design_path).toBe('docs/plans/auth/2026-04-01/design.md');
    expect(result.design_iteration).toBe('2026-04-01');
    expect(result.supersedes).toBeNull();
    expect(result.scope.includes).toHaveLength(1);
    expect(result.scope.includes[0]).toEqual({ id: 'login', description: 'User login' });
    expect(result.scope.excludes).toHaveLength(1);
    expect(result.scope.excludes[0]).toBe('OAuth deferred');
  });

  it('parses v2 spec with supersedes and delta', () => {
    const result = parseSpecHeader(V2_XML);
    expect(result).not.toBeNull();
    expect(result.spec_version).toBe(2);
    expect(result.supersedes).toBe('auth:v1');
    expect(result.scope.includes).toHaveLength(2);
    expect(result.deltas).toHaveLength(1);
    expect(result.latest_delta).not.toBeNull();
    expect(result.latest_delta.version).toBe('2');
    expect(result.latest_delta.added).toHaveLength(1);
    expect(result.latest_delta.modified).toHaveLength(1);
    expect(result.latest_delta.removed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateSpecHeader
// ---------------------------------------------------------------------------

describe('validateSpecHeader', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-spec-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns ERROR for null input, field: overview', () => {
    const result = validateSpecHeader(null);
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'overview');
    expect(err).toBeDefined();
  });

  it('flags missing required fields', () => {
    const parsed = {
      spec_id: 'auth',
      spec_version: null,
      status: null,
      title: null,
      description: null,
      design_path: null,
      design_iteration: null,
      supersedes: null,
      scope: { includes: [], excludes: [] },
      deltas: [],
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const fields = result.issues.filter((i) => i.level === 'ERROR').map((i) => i.field);
    expect(fields).toContain('spec_version');
    expect(fields).toContain('status');
    expect(fields).toContain('source/design_path');
    expect(fields).toContain('source/design_iteration');
  });

  it('flags empty-string required fields (Codex #3106859044)', () => {
    // parseSpecHeader returns "" (trimmed empty string) for <title></title>,
    // <status></status>, etc. The required-field check must treat
    // whitespace-only strings as missing, not just null/undefined. Without
    // this, the validator advertised as "single source of truth" in CHANGELOG
    // silently accepts malformed identity headers.
    const parsed = {
      spec_id: 'auth',
      spec_version: 1,
      status: '',
      title: '   ',
      description: 'desc',
      design_path: '',
      design_iteration: '',
      supersedes: null,
      scope: { includes: [{ id: 'login', description: 'User login' }], excludes: [] },
      deltas: [],
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const fields = result.issues.filter((i) => i.level === 'ERROR').map((i) => i.field);
    expect(fields).toContain('status');
    expect(fields).toContain('title');
    expect(fields).toContain('source/design_path');
    expect(fields).toContain('source/design_iteration');
  });

  it('rejects non-numeric spec_version like "2a" (Codex #3106887867)', () => {
    // parseSpecHeader uses parseInt which coerces "2a" → 2. The validator
    // then passes it as a valid positive integer. This must be caught —
    // require the raw string to be strictly digits before conversion.
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>2a</spec_version>
      <status>active</status>
      <title>Auth</title>
      <source>
        <design_path>docs/plans/auth/2026-04-16/design.md</design_path>
        <design_iteration>2026-04-16</design_iteration>
      </source>
      <scope><includes><feature id="x">y</feature></includes></scope>
    </overview></spec>`;
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-04-16/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
    const parsed = parseSpecHeader(xml);
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const versionErrors = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field === 'spec_version',
    );
    expect(versionErrors.length).toBeGreaterThan(0);
  });

  it('rejects status values outside the declared enum (Codex #3106887869)', () => {
    // SPEC_HEADER_RULES declares status: enum (currently: "active"). The
    // validator must enforce the allowed set — "draft" / "retired" etc.
    // should not pass.
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-04-01/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
    const parsed = {
      spec_id: 'auth',
      spec_version: 1,
      status: 'draft',
      title: 'Auth System',
      description: 'desc',
      design_path: 'docs/plans/auth/2026-04-01/design.md',
      design_iteration: '2026-04-01',
      supersedes: null,
      scope: { includes: [{ id: 'login', description: 'User login' }], excludes: [] },
      deltas: [],
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const statusErrors = result.issues.filter((i) => i.level === 'ERROR' && i.field === 'status');
    expect(statusErrors.length).toBeGreaterThan(0);
  });

  it('flags non-positive spec_version (0)', () => {
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-04-01/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
    const parsed = {
      spec_id: 'auth',
      spec_version: 0,
      status: 'active',
      title: 'Auth System',
      description: 'desc',
      design_path: 'docs/plans/auth/2026-04-01/design.md',
      design_iteration: '2026-04-01',
      supersedes: null,
      scope: { includes: [{ id: 'login', description: 'User login' }], excludes: [] },
      deltas: [],
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'spec_version');
    expect(err).toBeDefined();
  });

  it('flags broken design_path — points to non-existent file', () => {
    const parsed = {
      spec_id: 'auth',
      spec_version: 1,
      status: 'active',
      title: 'Auth System',
      description: 'desc',
      design_path: 'docs/plans/auth/2026-04-01/design.md',
      design_iteration: '2026-04-01',
      supersedes: null,
      scope: { includes: [{ id: 'login', description: 'User login' }], excludes: [] },
      deltas: [],
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'source/design_path');
    expect(err).toBeDefined();
  });

  it('flags invalid date format in design_iteration', () => {
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-04-01/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
    const parsed = {
      spec_id: 'auth',
      spec_version: 1,
      status: 'active',
      title: 'Auth System',
      description: 'desc',
      design_path: 'docs/plans/auth/2026-04-01/design.md',
      design_iteration: 'april-16',
      supersedes: null,
      scope: { includes: [{ id: 'login', description: 'User login' }], excludes: [] },
      deltas: [],
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const err = result.issues.find(
      (i) => i.level === 'ERROR' && i.field === 'source/design_iteration',
    );
    expect(err).toBeDefined();
  });

  it('flags missing supersedes for v2+', () => {
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-04-16/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
    const parsed = {
      spec_id: 'auth',
      spec_version: 2,
      status: 'active',
      title: 'Auth System',
      description: 'desc',
      design_path: 'docs/plans/auth/2026-04-16/design.md',
      design_iteration: '2026-04-16',
      supersedes: null,
      scope: { includes: [{ id: 'login', description: 'User login' }], excludes: [] },
      deltas: [],
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'supersedes');
    expect(err).toBeDefined();
  });

  it('flags invalid supersedes format', () => {
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-04-16/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
    const parsed = {
      spec_id: 'auth',
      spec_version: 2,
      status: 'active',
      title: 'Auth System',
      description: 'desc',
      design_path: 'docs/plans/auth/2026-04-16/design.md',
      design_iteration: '2026-04-16',
      supersedes: 'auth-v1',
      scope: { includes: [{ id: 'login', description: 'User login' }], excludes: [] },
      deltas: [],
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'supersedes');
    expect(err).toBeDefined();
  });

  it('warns on empty scope includes — valid remains true', () => {
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-04-01/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
    const parsed = {
      spec_id: 'auth',
      spec_version: 1,
      status: 'active',
      title: 'Auth System',
      description: 'desc',
      design_path: 'docs/plans/auth/2026-04-01/design.md',
      design_iteration: '2026-04-01',
      supersedes: null,
      scope: { includes: [], excludes: [] },
      deltas: [],
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(true);
    const warn = result.issues.find((i) => i.level === 'WARNING' && i.field === 'scope/includes');
    expect(warn).toBeDefined();
  });

  it('passes valid v1 header — all fields correct, zero ERRORs', () => {
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-04-01/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
    const parsed = {
      spec_id: 'auth',
      spec_version: 1,
      status: 'active',
      title: 'Auth System',
      description: 'desc',
      design_path: 'docs/plans/auth/2026-04-01/design.md',
      design_iteration: '2026-04-01',
      supersedes: null,
      scope: { includes: [{ id: 'login', description: 'User login' }], excludes: [] },
      deltas: [],
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });

  it('passes valid v2 header with supersedes — zero ERRORs', () => {
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-04-16/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
    const parsed = {
      spec_id: 'auth',
      spec_version: 2,
      status: 'active',
      title: 'Auth System',
      description: 'desc',
      design_path: 'docs/plans/auth/2026-04-16/design.md',
      design_iteration: '2026-04-16',
      supersedes: 'auth:v1',
      scope: { includes: [{ id: 'login', description: 'User login' }], excludes: [] },
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [{ ref: 'fr-oauth-001', text: 'OAuth support' }],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseSpecHeader — Enhancement 3: removed backward compat + new format
// ---------------------------------------------------------------------------

describe('parseSpecHeader — removed element formats', () => {
  it('parses old-format removed (self-closing) — reason and text are empty strings', () => {
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>2</spec_version>
      <status>active</status>
      <supersedes>auth:v1</supersedes>
      <title>Auth System</title>
      <description>Auth with OAuth</description>
      <source>
        <design_path>docs/plans/auth/2026-04-16/design.md</design_path>
        <design_iteration>2026-04-16</design_iteration>
      </source>
      <scope><includes><feature id="login">User login</feature></includes></scope>
      <delta version="2" iteration="2026-04-16">
        <removed ref="fr-login-legacy" />
      </delta>
    </overview></spec>`;
    const result = parseSpecHeader(xml);
    expect(result.latest_delta.removed).toHaveLength(1);
    expect(result.latest_delta.removed[0].ref).toBe('fr-login-legacy');
    expect(result.latest_delta.removed[0].reason).toBe('');
    expect(result.latest_delta.removed[0].text).toBe('');
  });

  it('parses old-format removed (text content) — text preserved, reason set to text', () => {
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>2</spec_version>
      <status>active</status>
      <supersedes>auth:v1</supersedes>
      <title>Auth System</title>
      <description>Auth with OAuth</description>
      <source>
        <design_path>docs/plans/auth/2026-04-16/design.md</design_path>
        <design_iteration>2026-04-16</design_iteration>
      </source>
      <scope><includes><feature id="login">User login</feature></includes></scope>
      <delta version="2" iteration="2026-04-16">
        <removed ref="fr-password-reset">Replaced by OAuth flow</removed>
      </delta>
    </overview></spec>`;
    const result = parseSpecHeader(xml);
    expect(result.latest_delta.removed).toHaveLength(1);
    expect(result.latest_delta.removed[0].ref).toBe('fr-password-reset');
    expect(result.latest_delta.removed[0].text).toBe('Replaced by OAuth flow');
    expect(result.latest_delta.removed[0].reason).toBe('Replaced by OAuth flow');
    expect(result.latest_delta.removed[0].migration).toBe('');
  });

  it('parses new-format removed (structured reason + migration)', () => {
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>3</spec_version>
      <status>active</status>
      <supersedes>auth:v2</supersedes>
      <title>Auth System</title>
      <description>Auth v3</description>
      <source>
        <design_path>docs/plans/auth/2026-05-01/design.md</design_path>
        <design_iteration>2026-05-01</design_iteration>
      </source>
      <scope><includes><feature id="login">User login</feature></includes></scope>
      <delta version="3" iteration="2026-05-01">
        <removed ref="fr-legacy-session">
          <reason>Session tokens replaced by JWT — no stateful sessions needed</reason>
          <migration>Existing session tokens expire naturally; clients must re-authenticate</migration>
        </removed>
      </delta>
    </overview></spec>`;
    const result = parseSpecHeader(xml);
    expect(result.latest_delta.removed).toHaveLength(1);
    const rem = result.latest_delta.removed[0];
    expect(rem.ref).toBe('fr-legacy-session');
    expect(rem.reason).toBe('Session tokens replaced by JWT — no stateful sessions needed');
    expect(rem.migration).toBe(
      'Existing session tokens expire naturally; clients must re-authenticate',
    );
  });

  it('parses new-format removed without migration — migration is empty string', () => {
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>3</spec_version>
      <status>active</status>
      <supersedes>auth:v2</supersedes>
      <title>Auth System</title>
      <description>Auth v3</description>
      <source>
        <design_path>docs/plans/auth/2026-05-01/design.md</design_path>
        <design_iteration>2026-05-01</design_iteration>
      </source>
      <scope><includes><feature id="login">User login</feature></includes></scope>
      <delta version="3" iteration="2026-05-01">
        <removed ref="fr-debug-endpoint">
          <reason>Debug endpoint removed for security — no migration path exists</reason>
        </removed>
      </delta>
    </overview></spec>`;
    const result = parseSpecHeader(xml);
    expect(result.latest_delta.removed).toHaveLength(1);
    const rem = result.latest_delta.removed[0];
    expect(rem.ref).toBe('fr-debug-endpoint');
    expect(rem.reason).toBe('Debug endpoint removed for security — no migration path exists');
    expect(rem.migration).toBe('');
  });
});

// ---------------------------------------------------------------------------
// validateSpecHeader — Enhancement 3: missing removed reason → ERROR
// ---------------------------------------------------------------------------

describe('validateSpecHeader — removed reason validation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-removed-test-'));
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-04-16/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function baseParsed(overrides = {}) {
    return {
      spec_id: 'auth',
      spec_version: 2,
      status: 'active',
      title: 'Auth System',
      description: 'desc',
      design_path: 'docs/plans/auth/2026-04-16/design.md',
      design_iteration: '2026-04-16',
      supersedes: 'auth:v1',
      scope: { includes: [{ id: 'login', description: 'User login' }], excludes: [] },
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
      ...overrides,
    };
  }

  it('flags removed entry with no reason and no text as ERROR on delta/removed', () => {
    const parsed = baseParsed({
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [{ ref: 'fr-legacy-001', reason: '', text: '', migration: '' }],
          renamed: [],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'deltas/removed');
    expect(err).toBeDefined();
    expect(err.message).toMatch(/reason/i);
  });

  it('passes removed entry with reason set via new structured format', () => {
    const parsed = baseParsed({
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [
            {
              ref: 'fr-legacy-001',
              reason: 'Session tokens replaced by JWT',
              text: '',
              migration: '',
            },
          ],
          renamed: [],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });

  it('passes removed entry with reason from legacy text content', () => {
    const parsed = baseParsed({
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [
            {
              ref: 'fr-password-reset',
              reason: 'Replaced by OAuth flow',
              text: 'Replaced by OAuth flow',
              migration: '',
            },
          ],
          renamed: [],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// parseSpecHeader — Enhancement 5: renamed element
// ---------------------------------------------------------------------------

describe('parseSpecHeader — renamed element', () => {
  it('parses renamed element with reason', () => {
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>2</spec_version>
      <status>active</status>
      <supersedes>auth:v1</supersedes>
      <title>Auth System</title>
      <description>Auth v2</description>
      <source>
        <design_path>docs/plans/auth/2026-04-16/design.md</design_path>
        <design_iteration>2026-04-16</design_iteration>
      </source>
      <scope><includes><feature id="login">User login</feature></includes></scope>
      <delta version="2" iteration="2026-04-16">
        <renamed ref_old="fr-auth-001" ref_new="fr-jwt-001">
          <reason>Renamed to reflect broader scope after OAuth iteration</reason>
        </renamed>
      </delta>
    </overview></spec>`;
    const result = parseSpecHeader(xml);
    expect(result.latest_delta.renamed).toHaveLength(1);
    const ren = result.latest_delta.renamed[0];
    expect(ren.ref_old).toBe('fr-auth-001');
    expect(ren.ref_new).toBe('fr-jwt-001');
    expect(ren.reason).toBe('Renamed to reflect broader scope after OAuth iteration');
  });

  it('parses renamed element without reason — reason is empty string', () => {
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>2</spec_version>
      <status>active</status>
      <supersedes>auth:v1</supersedes>
      <title>Auth System</title>
      <description>Auth v2</description>
      <source>
        <design_path>docs/plans/auth/2026-04-16/design.md</design_path>
        <design_iteration>2026-04-16</design_iteration>
      </source>
      <scope><includes><feature id="login">User login</feature></includes></scope>
      <delta version="2" iteration="2026-04-16">
        <renamed ref_old="fr-login-001" ref_new="fr-auth-login-001" />
      </delta>
    </overview></spec>`;
    const result = parseSpecHeader(xml);
    expect(result.latest_delta.renamed).toHaveLength(1);
    const ren = result.latest_delta.renamed[0];
    expect(ren.ref_old).toBe('fr-login-001');
    expect(ren.ref_new).toBe('fr-auth-login-001');
    expect(ren.reason).toBe('');
  });

  it('delta with no renamed elements returns empty renamed array', () => {
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>2</spec_version>
      <status>active</status>
      <supersedes>auth:v1</supersedes>
      <title>Auth System</title>
      <description>Auth v2</description>
      <source>
        <design_path>docs/plans/auth/2026-04-16/design.md</design_path>
        <design_iteration>2026-04-16</design_iteration>
      </source>
      <scope><includes><feature id="login">User login</feature></includes></scope>
      <delta version="2" iteration="2026-04-16">
        <added ref="fr-oauth-001" />
      </delta>
    </overview></spec>`;
    const result = parseSpecHeader(xml);
    expect(result.latest_delta.renamed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateSpecHeader — Enhancement 5: renamed validation
// ---------------------------------------------------------------------------

describe('validateSpecHeader — renamed validation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-renamed-test-'));
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-04-16/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function baseParsed(overrides = {}) {
    return {
      spec_id: 'auth',
      spec_version: 2,
      status: 'active',
      title: 'Auth System',
      description: 'desc',
      design_path: 'docs/plans/auth/2026-04-16/design.md',
      design_iteration: '2026-04-16',
      supersedes: 'auth:v1',
      scope: { includes: [{ id: 'login', description: 'User login' }], excludes: [] },
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
      ...overrides,
    };
  }

  it('flags renamed entry with missing ref_old as ERROR on delta/renamed', () => {
    const parsed = baseParsed({
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [],
          renamed: [{ ref_old: '', ref_new: 'fr-jwt-001', reason: '' }],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'deltas/renamed');
    expect(err).toBeDefined();
    expect(err.message).toMatch(/ref_old/i);
  });

  it('flags renamed entry with missing ref_new as ERROR on delta/renamed', () => {
    const parsed = baseParsed({
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [],
          renamed: [{ ref_old: 'fr-auth-001', ref_new: '', reason: '' }],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'deltas/renamed');
    expect(err).toBeDefined();
    expect(err.message).toMatch(/ref_new/i);
  });

  it('passes valid renamed entry with both refs present', () => {
    const parsed = baseParsed({
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [],
          renamed: [{ ref_old: 'fr-auth-001', ref_new: 'fr-jwt-001', reason: '' }],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });

  it('passes delta with no renamed entries — valid', () => {
    const parsed = baseParsed();
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateSpecHeader — delta placement consistency
// ---------------------------------------------------------------------------

describe('validateSpecHeader — delta placement consistency', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-delta-'));
    const designDir = path.join(tmpDir, 'docs/plans/test/2026-05-10');
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'design.md'),
      '# Test\n\nContent for valid design doc over fifty characters so substantive.',
    );
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  function makeV2Parsed(overrides = {}) {
    return {
      spec_id: 'test',
      spec_version: 2,
      status: 'active',
      title: 'Test',
      description: 'Test spec',
      design_path: 'docs/plans/test/2026-05-10/design.md',
      design_iteration: '2026-05-10',
      supersedes: 'test:v1',
      scope: { includes: [{ id: 'x', description: 'y' }], excludes: [] },
      deltas: [
        {
          version: '2',
          iteration: '2026-05-10',
          added: [{ ref: 'fr-x-001', text: 'New' }],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
      ...overrides,
    };
  }

  it('flags missing delta for v2+ as ERROR', () => {
    const parsed = makeV2Parsed({ deltas: [] });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const deltaErrors = result.issues.filter((i) => i.level === 'ERROR' && i.field === 'deltas');
    expect(deltaErrors.length).toBeGreaterThan(0);
  });

  it('does not require delta for v1 specs', () => {
    const parsed = makeV2Parsed({
      spec_version: 1,
      supersedes: null,
      deltas: [],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const deltaPresenceErrors = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field === 'deltas',
    );
    expect(deltaPresenceErrors).toHaveLength(0);
  });

  it('flags delta.version mismatch with spec_version as ERROR', () => {
    const parsed = makeV2Parsed({
      deltas: [
        {
          version: '3', // mismatched
          iteration: '2026-05-10',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'ERROR', field: 'deltas/latest/version' }),
      ]),
    );
  });

  it('flags delta.iteration mismatch with design_iteration as ERROR', () => {
    const parsed = makeV2Parsed({
      deltas: [
        {
          version: '2',
          iteration: '2026-06-01', // mismatched
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'ERROR', field: 'deltas/latest/iteration' }),
      ]),
    );
  });

  it('accepts delta with version and iteration matching', () => {
    const parsed = makeV2Parsed();
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const deltaErrors = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field.startsWith('delta'),
    );
    expect(deltaErrors).toHaveLength(0);
  });

  it('flags non-numeric delta.version in single-delta spec (Codex #3106859045)', () => {
    // With only one delta, the ascending-order loop (i=1) never runs, and
    // the latest-version equality check explicitly skipped !Number.isNaN
    // values — so <delta version="abc"> passed validation cleanly. The
    // validator must reject non-numeric version strings up front.
    const parsed = makeV2Parsed({
      deltas: [
        {
          version: 'abc',
          iteration: '2026-05-10',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const versionErrors = result.issues.filter(
      (i) => i.level === 'ERROR' && /deltas\[0\]\/version|deltas\/latest\/version/.test(i.field),
    );
    expect(versionErrors.length).toBeGreaterThan(0);
  });

  it('accepts delta.iteration with suffix (matching design_iteration exactly)', () => {
    // Compare as strings — suffix like "-v2" is allowed as long as both match
    const parsed = makeV2Parsed({
      design_iteration: '2026-04-16-v2',
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16-v2',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    // Only assert on delta-related errors. design_iteration format may fail
    // a separate regex check — see "Known Adjacent Issue".
    const deltaErrors = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field.startsWith('delta'),
    );
    expect(deltaErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// validateSpecHeader — design_iteration identifier format
// ---------------------------------------------------------------------------

describe('validateSpecHeader — design_iteration identifier format', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-iter-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  function makeValidV1Parsed(iteration) {
    const designDir = path.join(tmpDir, 'docs/plans/auth', iteration);
    fs.mkdirSync(designDir, { recursive: true });
    fs.writeFileSync(
      path.join(designDir, 'design.md'),
      'Substantive design content over fifty characters to pass.',
    );
    return {
      spec_id: 'auth',
      spec_version: 1,
      status: 'active',
      title: 'Auth',
      description: 'Auth spec',
      design_path: `docs/plans/auth/${iteration}/design.md`,
      design_iteration: iteration,
      supersedes: null,
      scope: { includes: [{ id: 'x', description: 'y' }], excludes: [] },
      deltas: [],
    };
  }

  it.each([
    '2026-04-16',
    '2026-04-16-v2',
    '2026-04-16-v10',
    '2026-04-16-rework',
    '2026-04-16-oauth-pivot',
    '2026-04-16-post-review-round-3',
  ])('accepts valid iteration identifier: %s', (iteration) => {
    const parsed = makeValidV1Parsed(iteration);
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const iterErrors = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field === 'source/design_iteration',
    );
    expect(iterErrors).toHaveLength(0);
  });

  it.each([
    'april-16',
    '2026-04-116',
    'v2-2026-04-16',
    '2026-04-16v2',
    '2026-4-16',
    '2026-04',
    '',
  ])('rejects invalid iteration identifier: %s', (iteration) => {
    const parsed = makeValidV1Parsed('2026-04-16');
    parsed.design_iteration = iteration;
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const iterErrors = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field === 'source/design_iteration',
    );
    expect(iterErrors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// parseSpecHeader — multi-delta accumulation (Phase 2 SDD v2 realignment)
// ---------------------------------------------------------------------------

describe('parseSpecHeader — multi-delta accumulation', () => {
  it('returns empty deltas array for v1 spec (no <delta> elements)', () => {
    const result = parseSpecHeader(V1_XML);
    expect(result.deltas).toEqual([]);
    expect(result.latest_delta).toBeNull();
  });

  it('returns deltas array of length 1 for v2 spec (one <delta>)', () => {
    const result = parseSpecHeader(V2_XML);
    expect(result.deltas).toHaveLength(1);
    expect(result.latest_delta).toBe(result.deltas[0]);
    expect(result.latest_delta.version).toBe('2');
  });

  it('parses v3 spec with v2 + v3 deltas accumulated', () => {
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>3</spec_version>
      <status>active</status>
      <supersedes>auth:v2</supersedes>
      <title>Auth System</title>
      <description>Auth v3</description>
      <source>
        <design_path>docs/plans/auth/2026-06-01/design.md</design_path>
        <design_iteration>2026-06-01</design_iteration>
      </source>
      <scope><includes><feature id="login">User login</feature></includes></scope>
      <delta version="2" iteration="2026-04-16">
        <added ref="fr-oauth-001" />
        <modified ref="fr-login-001" />
      </delta>
      <delta version="3" iteration="2026-06-01">
        <added ref="fr-device-001" />
        <removed ref="fr-legacy-001">
          <reason>Replaced in v3 by device-trust scoring</reason>
        </removed>
      </delta>
    </overview></spec>`;
    const result = parseSpecHeader(xml);
    expect(result.deltas).toHaveLength(2);
    expect(result.deltas[0].version).toBe('2');
    expect(result.deltas[1].version).toBe('3');
    expect(result.latest_delta.version).toBe('3');
    expect(result.latest_delta.added[0].ref).toBe('fr-device-001');
    expect(result.latest_delta.removed[0].ref).toBe('fr-legacy-001');
    // v2 delta is preserved verbatim
    expect(result.deltas[0].added[0].ref).toBe('fr-oauth-001');
    expect(result.deltas[0].modified[0].ref).toBe('fr-login-001');
  });

  it('preserves source order of <delta> children (does not sort)', () => {
    // Out-of-order deltas: v3 appears before v2 in source.
    // parseSpecHeader keeps source order so the validator can flag the violation.
    const xml = `<spec><overview>
      <spec_id>auth</spec_id>
      <spec_version>3</spec_version>
      <status>active</status>
      <supersedes>auth:v2</supersedes>
      <title>Auth System</title>
      <description>Auth v3</description>
      <source>
        <design_path>docs/plans/auth/2026-06-01/design.md</design_path>
        <design_iteration>2026-06-01</design_iteration>
      </source>
      <scope><includes><feature id="login">User login</feature></includes></scope>
      <delta version="3" iteration="2026-06-01">
        <added ref="fr-device-001" />
      </delta>
      <delta version="2" iteration="2026-04-16">
        <added ref="fr-oauth-001" />
      </delta>
    </overview></spec>`;
    const result = parseSpecHeader(xml);
    expect(result.deltas[0].version).toBe('3');
    expect(result.deltas[1].version).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// validateSpecHeader — multi-delta rules (Phase 2 SDD v2 realignment)
// ---------------------------------------------------------------------------

describe('validateSpecHeader — multi-delta rules', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-multi-delta-'));
    const designPath = path.join(tmpDir, 'docs/plans/auth/2026-06-01/design.md');
    fs.mkdirSync(path.dirname(designPath), { recursive: true });
    fs.writeFileSync(designPath, '# Auth', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeV3Parsed(overrides = {}) {
    return {
      spec_id: 'auth',
      spec_version: 3,
      status: 'active',
      title: 'Auth',
      description: 'Auth v3',
      design_path: 'docs/plans/auth/2026-06-01/design.md',
      design_iteration: '2026-06-01',
      supersedes: 'auth:v2',
      scope: { includes: [{ id: 'login', description: 'login' }], excludes: [] },
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [{ ref: 'fr-oauth-001', text: '' }],
          modified: [],
          removed: [],
          renamed: [],
        },
        {
          version: '3',
          iteration: '2026-06-01',
          added: [{ ref: 'fr-device-001', text: '' }],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
      ...overrides,
    };
  }

  it('passes v3 spec with two correctly ordered deltas', () => {
    const parsed = makeV3Parsed();
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const errors = result.issues.filter((i) => i.level === 'ERROR');
    expect(errors).toHaveLength(0);
  });

  it('flags out-of-order deltas as ERROR on deltas/order', () => {
    const parsed = makeV3Parsed({
      deltas: [
        {
          version: '3',
          iteration: '2026-06-01',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const orderErrs = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field === 'deltas/order',
    );
    expect(orderErrs.length).toBeGreaterThan(0);
  });

  it('flags duplicate delta versions as ERROR on deltas/order', () => {
    const parsed = makeV3Parsed({
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
        {
          version: '2',
          iteration: '2026-05-10',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
        {
          version: '3',
          iteration: '2026-06-01',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const orderErrs = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field === 'deltas/order',
    );
    expect(orderErrs.length).toBeGreaterThan(0);
  });

  it('does NOT validate earlier deltas iteration against current design_iteration', () => {
    // v2's iteration "2026-04-16" differs from current design_iteration "2026-06-01" —
    // this is correct (historical record). Only the LAST delta's iteration is checked.
    const parsed = makeV3Parsed();
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const iterErrs = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field.startsWith('deltas') && i.field.includes('iteration'),
    );
    expect(iterErrs).toHaveLength(0);
  });

  it('flags last delta version mismatch (v3 spec but last delta is v2)', () => {
    const parsed = makeV3Parsed({
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const verErrs = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field === 'deltas/latest/version',
    );
    expect(verErrs.length).toBeGreaterThan(0);
  });

  it('flags malformed historical delta (removed without reason in v2 delta of v3 spec)', () => {
    const parsed = makeV3Parsed({
      deltas: [
        {
          version: '2',
          iteration: '2026-04-16',
          added: [],
          modified: [],
          removed: [{ ref: 'fr-old-001', reason: '', text: '', migration: '' }],
          renamed: [],
        },
        {
          version: '3',
          iteration: '2026-06-01',
          added: [],
          modified: [],
          removed: [],
          renamed: [],
        },
      ],
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const remErrs = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field === 'deltas/removed',
    );
    expect(remErrs.length).toBeGreaterThan(0);
    expect(remErrs[0].message).toMatch(/v2/);
  });
});

// ---------------------------------------------------------------------------
// checkDagStatus — refiner gate helper (Phase 2 SDD v2 realignment, fr-rf-012)
// ---------------------------------------------------------------------------

const { checkDagStatus } = require('../../scripts/lib/sdd-utils');

describe('checkDagStatus', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-dag-status-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when dag.yaml does not exist', () => {
    const result = checkDagStatus(path.join(tmpDir, 'specs/auth/dag.yaml'));
    expect(result).toBeNull();
  });

  it('returns all-completed counts for a fully completed sprint', () => {
    const dagPath = path.join(tmpDir, 'specs/auth/dag.yaml');
    fs.mkdirSync(path.dirname(dagPath), { recursive: true });
    fs.writeFileSync(
      dagPath,
      [
        'epics:',
        '  - id: epic-a',
        '    name: Epic A',
        '    status: completed',
        '    spec_path: specs/auth/epics/epic-a/epic.md',
        '    depends_on: []',
        '    features: []',
        '  - id: epic-b',
        '    name: Epic B',
        '    status: completed',
        '    spec_path: specs/auth/epics/epic-b/epic.md',
        '    depends_on: []',
        '    features: []',
        '',
      ].join('\n'),
    );
    const result = checkDagStatus(dagPath);
    expect(result.total).toBe(2);
    expect(result.completed).toBe(2);
    expect(result.incomplete).toBe(0);
    expect(result.incompleteEpics).toEqual([]);
  });

  it('returns incomplete list with id and status when any epic is not completed', () => {
    const dagPath = path.join(tmpDir, 'specs/auth/dag.yaml');
    fs.mkdirSync(path.dirname(dagPath), { recursive: true });
    fs.writeFileSync(
      dagPath,
      [
        'epics:',
        '  - id: epic-a',
        '    name: Epic A',
        '    status: completed',
        '    spec_path: specs/auth/epics/epic-a/epic.md',
        '    depends_on: []',
        '    features: []',
        '  - id: epic-b',
        '    name: Epic B',
        '    status: in_progress',
        '    spec_path: specs/auth/epics/epic-b/epic.md',
        '    depends_on: []',
        '    features: []',
        '  - id: epic-c',
        '    name: Epic C',
        '    status: pending',
        '    spec_path: specs/auth/epics/epic-c/epic.md',
        '    depends_on: []',
        '    features: []',
        '',
      ].join('\n'),
    );
    const result = checkDagStatus(dagPath);
    expect(result.total).toBe(3);
    expect(result.completed).toBe(1);
    expect(result.incomplete).toBe(2);
    expect(result.incompleteEpics).toEqual([
      { id: 'epic-b', status: 'in_progress' },
      { id: 'epic-c', status: 'pending' },
    ]);
  });

  it('returns zero counts for a dag.yaml with no epics', () => {
    const dagPath = path.join(tmpDir, 'specs/auth/dag.yaml');
    fs.mkdirSync(path.dirname(dagPath), { recursive: true });
    fs.writeFileSync(dagPath, 'epics: []\n');
    const result = checkDagStatus(dagPath);
    expect(result.total).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.incomplete).toBe(0);
    expect(result.incompleteEpics).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Schema SoT + drift-detection tests (fr-sd-010, fr-sd-011)
// ---------------------------------------------------------------------------
//
// These tests lock in the structural invariant that prevents the class of bug
// found on 2026-04-19: skill template said "## Context (from spec v1)" but
// validator rejected it. The fix is to have validators consume exported rule
// constants, and to have the print-schema CLI derive its output from the same
// constants. These tests verify that structure.

describe('schema SoT invariants', () => {
  it('exports a frozen DESIGN_DOC_RULES with all fr-sd-010-ac1 required keys', () => {
    expect(Object.isFrozen(DESIGN_DOC_RULES)).toBe(true);
    expect(DESIGN_DOC_RULES.canonical_path).toBeTruthy();
    expect(DESIGN_DOC_RULES.path_regex).toBeInstanceOf(RegExp);
    expect(DESIGN_DOC_RULES.substantive_min_chars).toBeGreaterThan(0);
    expect(DESIGN_DOC_RULES.section_regex.Context).toBeInstanceOf(RegExp);
    expect(DESIGN_DOC_RULES.section_regex.ChangeIntent).toBeInstanceOf(RegExp);
    expect(Array.isArray(DESIGN_DOC_RULES.iteration.required_sections)).toBe(true);
    expect(Array.isArray(DESIGN_DOC_RULES.iteration.forbidden_section_keywords)).toBe(true);
    expect(Array.isArray(DESIGN_DOC_RULES.initial.required_prose_elements)).toBe(true);
  });

  it('exports a frozen SPEC_HEADER_RULES with all fr-sd-010-ac2 required keys', () => {
    expect(Object.isFrozen(SPEC_HEADER_RULES)).toBe(true);
    expect(SPEC_HEADER_RULES.design_iteration_regex).toBeInstanceOf(RegExp);
    expect(SPEC_HEADER_RULES.supersedes_regex).toBeInstanceOf(RegExp);
    expect(Array.isArray(SPEC_HEADER_RULES.required_fields)).toBe(true);
    expect(SPEC_HEADER_RULES.delta.last_delta_invariants.version).toBeTruthy();
    expect(SPEC_HEADER_RULES.delta.child_element_rules.added).toBeTruthy();
  });

  it('validator rejects a doc whose section heading does not match DESIGN_DOC_RULES.section_regex.Context', () => {
    // This test locks in the invariant that the validator and the exported
    // regex are the same thing. If someone ever reintroduces a local regex
    // literal inside parseDesignDoc, mutating DESIGN_DOC_RULES.section_regex
    // here would stop affecting the validator and this test would flag it.
    const bad =
      '# Title\n\n## Contextual\n\nSome body content long enough to pass substantive check.\n\n## Change Intent\n\nBody.\n';
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-schema-sot-'));
    try {
      const filePath = writeFile(tmpDir, 'docs/plans/auth-system/2026-03-15/design.md', bad);
      writeFile(tmpDir, 'specs/auth-system/spec.xml', '<spec><overview/></spec>');
      const parsed = parseDesignDoc(filePath, { cwd: tmpDir });
      expect(parsed.hasContext).toBe(false);
      // Confirm the rule's regex agrees when tested directly on the same string
      expect(DESIGN_DOC_RULES.section_regex.Context.test(bad)).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('print-schema CLI drift detection', () => {
  // Per fr-sd-011-ac2, print-schema derives all output from the exported
  // rule constants. These tests verify that the output contains the actual
  // regex sources from the rules — a hand-authored template would not.
  it('design human-readable output embeds the actual Context regex source', () => {
    const out = renderDesignHuman();
    expect(out).toContain(DESIGN_DOC_RULES.section_regex.Context.source);
    expect(out).toContain(DESIGN_DOC_RULES.section_regex.ChangeIntent.source);
    expect(out).toContain(DESIGN_DOC_RULES.path_regex.source);
    expect(out).toContain(String(DESIGN_DOC_RULES.substantive_min_chars));
  });

  it('spec human-readable output embeds the actual design_iteration regex source', () => {
    const out = renderSpecHuman();
    expect(out).toContain(SPEC_HEADER_RULES.design_iteration_regex.source);
    expect(out).toContain(SPEC_HEADER_RULES.supersedes_regex.source);
  });

  it('jsonifyRules encodes RegExp values as <regex>...</regex> strings', () => {
    const out = jsonifyRules(DESIGN_DOC_RULES);
    expect(typeof out.path_regex).toBe('string');
    expect(out.path_regex.startsWith('<regex>')).toBe(true);
    expect(out.path_regex.endsWith('</regex>')).toBe(true);
    // Round-trip: the encoded string must contain the actual regex source.
    expect(out.path_regex).toContain(DESIGN_DOC_RULES.path_regex.source);
  });
});

// ---------------------------------------------------------------------------
// PENDING_CONFLICT_RULES — fr-sd-012-ac1 schema constant invariants
// ---------------------------------------------------------------------------

describe('PENDING_CONFLICT_RULES schema constant (fr-sd-012-ac1)', () => {
  it('is exported from sdd-utils', () => {
    expect(PENDING_CONFLICT_RULES).toBeDefined();
  });

  it('top-level object is frozen', () => {
    expect(Object.isFrozen(PENDING_CONFLICT_RULES)).toBe(true);
  });

  it('has canonical_path equal to "specs/<spec-id>/_pending-conflict.md"', () => {
    expect(PENDING_CONFLICT_RULES.canonical_path).toBe('specs/<spec-id>/_pending-conflict.md');
  });

  it('has required_fields describing axis_fired', () => {
    const fields = PENDING_CONFLICT_RULES.required_fields;
    expect(fields).toBeDefined();
    const axisFired = Array.isArray(fields)
      ? fields.find((f) => f.key === 'axis_fired')
      : fields.axis_fired;
    expect(axisFired).toBeDefined();
  });

  it('has required_fields describing conflict_description', () => {
    const fields = PENDING_CONFLICT_RULES.required_fields;
    const conflictDescription = Array.isArray(fields)
      ? fields.find((f) => f.key === 'conflict_description')
      : fields.conflict_description;
    expect(conflictDescription).toBeDefined();
  });

  it('has required_fields describing candidate_resolutions', () => {
    const fields = PENDING_CONFLICT_RULES.required_fields;
    const candidateResolutions = Array.isArray(fields)
      ? fields.find((f) => f.key === 'candidate_resolutions')
      : fields.candidate_resolutions;
    expect(candidateResolutions).toBeDefined();
  });

  it('has required_fields describing user_action_prompt', () => {
    const fields = PENDING_CONFLICT_RULES.required_fields;
    const userActionPrompt = Array.isArray(fields)
      ? fields.find((f) => f.key === 'user_action_prompt')
      : fields.user_action_prompt;
    expect(userActionPrompt).toBeDefined();
  });

  it('has lifecycle describing ephemeral semantics', () => {
    const lifecycle = PENDING_CONFLICT_RULES.lifecycle;
    expect(lifecycle).toBeDefined();
    // lifecycle must mention "ephemeral" (the key property per fr-sd-012-ac1)
    const lifecycleStr = JSON.stringify(lifecycle).toLowerCase();
    expect(lifecycleStr).toContain('ephemeral');
  });

  it('has lifecycle describing deletion by brainstorming on new-design write', () => {
    const lifecycle = PENDING_CONFLICT_RULES.lifecycle;
    const lifecycleStr = JSON.stringify(lifecycle).toLowerCase();
    // Must encode the "deleted by brainstorming on new-design write" semantics
    expect(lifecycleStr).toContain('brainstorming');
  });

  it('nested required_fields array/object is also frozen (deep freeze)', () => {
    expect(Object.isFrozen(PENDING_CONFLICT_RULES.required_fields)).toBe(true);
  });

  it('nested lifecycle object is also frozen (deep freeze)', () => {
    expect(Object.isFrozen(PENDING_CONFLICT_RULES.lifecycle)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DECISION_LOG_RULES — fr-sd-013-ac1/ac2 schema constant invariants
// ---------------------------------------------------------------------------

describe('DECISION_LOG_RULES schema constant (fr-sd-013-ac1)', () => {
  it('is exported from sdd-utils', () => {
    expect(DECISION_LOG_RULES).toBeDefined();
  });

  it('top-level object is frozen', () => {
    expect(Object.isFrozen(DECISION_LOG_RULES)).toBe(true);
  });

  it('has canonical_path as a string referencing brainstorming output directory', () => {
    expect(typeof DECISION_LOG_RULES.canonical_path).toBe('string');
    expect(DECISION_LOG_RULES.canonical_path.length).toBeGreaterThan(0);
  });

  it('required_fields_per_row contains exactly four field entries: q_id, question, user_answer_verbatim, deferral_signal', () => {
    const fields = DECISION_LOG_RULES.required_fields_per_row;
    expect(Array.isArray(fields)).toBe(true);
    expect(fields).toHaveLength(4);
    const keys = fields.map((f) => f.key);
    expect(keys).toContain('q_id');
    expect(keys).toContain('question');
    expect(keys).toContain('user_answer_verbatim');
    expect(keys).toContain('deferral_signal');
  });

  it('required_fields_per_row entries are {key, type, description} objects (uniform shape with PENDING_CONFLICT_RULES.required_fields)', () => {
    for (const f of DECISION_LOG_RULES.required_fields_per_row) {
      expect(typeof f.key).toBe('string');
      expect(f.key.length).toBeGreaterThan(0);
      expect(typeof f.type).toBe('string');
      expect(f.type.length).toBeGreaterThan(0);
      expect(typeof f.description).toBe('string');
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it('q_id_uniqueness descriptor is present and encodes per-session uniqueness', () => {
    expect(DECISION_LOG_RULES.q_id_uniqueness).toBeDefined();
    const uniquenessStr = JSON.stringify(DECISION_LOG_RULES.q_id_uniqueness).toLowerCase();
    expect(uniquenessStr).toContain('session');
  });

  it('deferral_signal_canonical_phrases is a frozen array containing at minimum the four canonical phrases', () => {
    const phrases = DECISION_LOG_RULES.deferral_signal_canonical_phrases;
    expect(Array.isArray(phrases)).toBe(true);
    expect(Object.isFrozen(phrases)).toBe(true);
    expect(phrases).toContain('use defaults');
    expect(phrases).toContain('covered.');
    expect(phrases).toContain('skip');
    expect(phrases).toContain('you decide');
    expect(phrases.length).toBeGreaterThanOrEqual(4);
  });

  it('encodes lookup-by-q_id addressability (fr-sd-013-ac2)', () => {
    // The constant must have a field (e.g. addressable_by) encoding that rows
    // are addressable by q_id deterministically.
    expect(DECISION_LOG_RULES.addressable_by).toBeDefined();
    expect(DECISION_LOG_RULES.addressable_by).toBe('q_id');
  });

  it('nested required_fields_per_row array is frozen (deep freeze)', () => {
    expect(Object.isFrozen(DECISION_LOG_RULES.required_fields_per_row)).toBe(true);
  });

  it('nested deferral_signal_canonical_phrases array is frozen (deep freeze)', () => {
    expect(Object.isFrozen(DECISION_LOG_RULES.deferral_signal_canonical_phrases)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseConflictMarker — fr-sd-014-ac1
// ---------------------------------------------------------------------------

describe('parseConflictMarker (fr-sd-014-ac1)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-conflict-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConflict(content) {
    const p = path.join(tmpDir, '_pending-conflict.md');
    fs.writeFileSync(p, content, 'utf8');
    return p;
  }

  const VALID_CONFLICT_YAML = [
    'axis_fired: "1"',
    'conflict_description: "design.md lines 32-35 contradict lines 78-81."',
    'candidate_resolutions:',
    '  - "(a) Adopt the 60-second window."',
    '  - "(b) Adopt the 5-minute window."',
    'user_action_prompt: "Run /arc-brainstorming iterate my-spec to resolve."',
  ].join('\n');

  it('returns null for a missing file', () => {
    const result = parseConflictMarker(path.join(tmpDir, 'does-not-exist.md'));
    expect(result).toBeNull();
  });

  it('parses a valid conflict marker and returns all four required fields', () => {
    const p = writeConflict(VALID_CONFLICT_YAML);
    const result = parseConflictMarker(p);
    expect(result).not.toBeNull();
    expect(result.axis_fired).toBeDefined();
    expect(result.conflict_description).toBeDefined();
    expect(result.candidate_resolutions).toBeDefined();
    expect(result.user_action_prompt).toBeDefined();
  });

  it('parses axis_fired correctly', () => {
    const p = writeConflict(VALID_CONFLICT_YAML);
    const result = parseConflictMarker(p);
    expect(result.axis_fired).toBe('1');
  });

  it('parses candidate_resolutions as an array', () => {
    const p = writeConflict(VALID_CONFLICT_YAML);
    const result = parseConflictMarker(p);
    expect(Array.isArray(result.candidate_resolutions)).toBe(true);
    expect(result.candidate_resolutions).toHaveLength(2);
  });

  it('returns null when a required field is missing (missing user_action_prompt)', () => {
    const missing = [
      'axis_fired: "1"',
      'conflict_description: "some conflict"',
      'candidate_resolutions:',
      '  - "(a) Option A."',
    ].join('\n');
    const p = writeConflict(missing);
    const result = parseConflictMarker(p);
    expect(result).toBeNull();
  });

  it('returns null when candidate_resolutions is empty (zero is an ERROR)', () => {
    const empty = [
      'axis_fired: "2"',
      'conflict_description: "some conflict"',
      'candidate_resolutions: []',
      'user_action_prompt: "Run brainstorming."',
    ].join('\n');
    const p = writeConflict(empty);
    const result = parseConflictMarker(p);
    expect(result).toBeNull();
  });

  it('field names checked against PENDING_CONFLICT_RULES.required_fields (no drift)', () => {
    // All field keys the parser checks must appear in PENDING_CONFLICT_RULES.required_fields
    const ruleKeys = PENDING_CONFLICT_RULES.required_fields.map((f) => f.key);
    // The four fields the spec mandates must all be in the rules constant
    const expectedFields = [
      'axis_fired',
      'conflict_description',
      'candidate_resolutions',
      'user_action_prompt',
    ];
    for (const field of expectedFields) {
      expect(ruleKeys).toContain(field);
    }
  });
});

// ---------------------------------------------------------------------------
// parseDecisionLog + validateDecisionLog — fr-sd-014-ac2
// ---------------------------------------------------------------------------

describe('parseDecisionLog (fr-sd-014-ac2)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-declog-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLog(content) {
    const p = path.join(tmpDir, 'decision-log.yaml');
    fs.writeFileSync(p, content, 'utf8');
    return p;
  }

  const VALID_3_ROW_LOG = [
    '- q_id: q1',
    '  question: "What rate limit?"',
    '  user_answer_verbatim: "60 requests per minute"',
    '  deferral_signal: false',
    '- q_id: q2',
    '  question: "Should auth be JWT?"',
    '  user_answer_verbatim: "use defaults"',
    '  deferral_signal: true',
    '- q_id: q3',
    '  question: "Error format?"',
    '  user_answer_verbatim: "JSON with code and message"',
    '  deferral_signal: false',
  ].join('\n');

  it('returns null for a missing file', () => {
    const result = parseDecisionLog(path.join(tmpDir, 'no-file.yaml'));
    expect(result).toBeNull();
  });

  it('parses a valid 3-row log into an array of 3 row objects', () => {
    const p = writeLog(VALID_3_ROW_LOG);
    const result = parseDecisionLog(p);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
  });

  it('each row has the four required fields', () => {
    const p = writeLog(VALID_3_ROW_LOG);
    const rows = parseDecisionLog(p);
    for (const row of rows) {
      expect(row.q_id).toBeDefined();
      expect(row.question).toBeDefined();
      expect(row.user_answer_verbatim).toBeDefined();
      expect(row).toHaveProperty('deferral_signal');
    }
  });

  it('parses deferral_signal as boolean', () => {
    const p = writeLog(VALID_3_ROW_LOG);
    const rows = parseDecisionLog(p);
    expect(typeof rows[0].deferral_signal).toBe('boolean');
    expect(rows[0].deferral_signal).toBe(false);
    expect(rows[1].deferral_signal).toBe(true);
  });
});

describe('validateDecisionLog (fr-sd-014-ac2)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-decval-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const VALID_ROWS = [
    { q_id: 'q1', question: 'Rate limit?', user_answer_verbatim: '60/min', deferral_signal: false },
    {
      q_id: 'q2',
      question: 'Auth type?',
      user_answer_verbatim: 'use defaults',
      deferral_signal: true,
    },
    { q_id: 'q3', question: 'Error format?', user_answer_verbatim: 'JSON', deferral_signal: false },
  ];

  it('returns valid=true for a well-formed set of rows', () => {
    const result = validateDecisionLog(VALID_ROWS);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('returns valid=false and issues=[{level:ERROR}] when parsed is null', () => {
    const result = validateDecisionLog(null);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.level === 'ERROR')).toBe(true);
  });

  it('flags duplicate q_id with ERROR', () => {
    const rows = [
      { q_id: 'q1', question: 'A?', user_answer_verbatim: 'x', deferral_signal: false },
      { q_id: 'q1', question: 'B?', user_answer_verbatim: 'y', deferral_signal: false },
    ];
    const result = validateDecisionLog(rows);
    expect(result.valid).toBe(false);
    const dupeIssue = result.issues.find(
      (i) => i.level === 'ERROR' && i.message.toLowerCase().includes('q_id'),
    );
    expect(dupeIssue).toBeDefined();
  });

  it('flags missing user_answer_verbatim with ERROR', () => {
    const rows = [{ q_id: 'q1', question: 'A?', deferral_signal: false }];
    const result = validateDecisionLog(rows);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.level === 'ERROR')).toBe(true);
  });

  it('flags non-boolean deferral_signal with ERROR', () => {
    const rows = [
      { q_id: 'q1', question: 'A?', user_answer_verbatim: 'yes', deferral_signal: 'true' },
    ];
    const result = validateDecisionLog(rows);
    expect(result.valid).toBe(false);
    const issue = result.issues.find(
      (i) => i.level === 'ERROR' && i.message.toLowerCase().includes('deferral'),
    );
    expect(issue).toBeDefined();
  });

  it('flags missing deferral_signal with ERROR', () => {
    const rows = [{ q_id: 'q1', question: 'A?', user_answer_verbatim: 'x' }];
    const result = validateDecisionLog(rows);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.level === 'ERROR')).toBe(true);
  });

  it('issues shape matches validateDesignDoc / validateSpecHeader: {level, field, message}', () => {
    const result = validateDecisionLog(null);
    for (const issue of result.issues) {
      expect(issue).toHaveProperty('level');
      expect(issue).toHaveProperty('field');
      expect(issue).toHaveProperty('message');
    }
  });

  it('error messages reference DECISION_LOG_RULES field names (no drift)', () => {
    // All required field names mentioned in error messages must come from the rules constant
    const rows = [{ q_id: 'q1', question: 'A?' }]; // missing user_answer_verbatim + deferral_signal
    const result = validateDecisionLog(rows);
    const errorMessages = result.issues.filter((i) => i.level === 'ERROR').map((i) => i.message);
    const ruleFieldKeys = DECISION_LOG_RULES.required_fields_per_row.map((f) => f.key);
    // At least one error message should mention a field in the rules constant
    const mentionsRuleField = errorMessages.some((msg) =>
      ruleFieldKeys.some((k) => msg.includes(k)),
    );
    expect(mentionsRuleField).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mechanicalAuthorizationCheck — fr-sd-014-ac3
// ---------------------------------------------------------------------------

describe('mechanicalAuthorizationCheck (fr-sd-014-ac3)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-auth-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relPath, content) {
    const full = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    return full;
  }

  const DESIGN_CONTENT = [
    '# Design',
    '',
    '## Context',
    '',
    'We need rate limiting at 60 requests per minute.',
    '',
    '## Architecture',
    '',
    'Use JWT tokens with short expiry.',
  ].join('\n');

  const DECISION_LOG_YAML = [
    '- q_id: q1',
    '  question: "Rate limit?"',
    '  user_answer_verbatim: "60 requests per minute"',
    '  deferral_signal: false',
    '- q_id: q2',
    '  question: "Auth type?"',
    '  user_answer_verbatim: "JWT only, no sessions"',
    '  deferral_signal: false',
  ].join('\n');

  function makeSpec(traces) {
    const traceXml = traces
      .map(
        ({ req, crit, trace }) =>
          `<requirement id="${req}"><criterion id="${crit}"><trace>${trace}</trace></criterion></requirement>`,
      )
      .join('\n');
    return `<spec>${traceXml}</spec>`;
  }

  it('returns valid=true when no traces in spec', () => {
    const designPath = writeFile('design.md', DESIGN_CONTENT);
    const result = mechanicalAuthorizationCheck('<spec></spec>', designPath, null);
    expect(result.valid).toBe(true);
    expect(result.unauthorized_traces).toHaveLength(0);
  });

  it('design trace whose cited section appears in design file is authorized', () => {
    const designPath = writeFile('design.md', DESIGN_CONTENT);
    const spec = makeSpec([
      { req: 'fr-001', crit: 'fr-001-ac1', trace: '2026-04-27:Architecture' },
    ]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null);
    expect(result.valid).toBe(true);
    expect(result.unauthorized_traces).toHaveLength(0);
  });

  it('design trace whose cited section is absent is flagged as unauthorized', () => {
    const designPath = writeFile('design.md', DESIGN_CONTENT);
    const spec = makeSpec([
      { req: 'fr-001', crit: 'fr-001-ac1', trace: '2026-04-27:NonExistentSection' },
    ]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null);
    expect(result.valid).toBe(false);
    expect(result.unauthorized_traces).toHaveLength(1);
    expect(result.unauthorized_traces[0].requirement_id).toBe('fr-001');
    expect(result.unauthorized_traces[0].criterion_id).toBe('fr-001-ac1');
    expect(result.unauthorized_traces[0].trace_value).toContain('NonExistentSection');
  });

  it('q_id trace where cited content matches user_answer_verbatim is authorized', () => {
    const designPath = writeFile('design.md', DESIGN_CONTENT);
    const logPath = writeFile('decision-log.yaml', DECISION_LOG_YAML);
    // trace format: q1:60 requests per minute
    const spec = makeSpec([
      { req: 'fr-001', crit: 'fr-001-ac1', trace: 'q1:60 requests per minute' },
    ]);
    const result = mechanicalAuthorizationCheck(spec, designPath, logPath);
    expect(result.valid).toBe(true);
    expect(result.unauthorized_traces).toHaveLength(0);
  });

  it('q_id trace where cited content does NOT match user_answer_verbatim is flagged', () => {
    const designPath = writeFile('design.md', DESIGN_CONTENT);
    const logPath = writeFile('decision-log.yaml', DECISION_LOG_YAML);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'q1:wrong content here' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, logPath);
    expect(result.valid).toBe(false);
    expect(result.unauthorized_traces).toHaveLength(1);
    expect(result.unauthorized_traces[0].trace_value).toContain('wrong content here');
  });

  it('legacy REQ-F* style traces are skipped (not flagged)', () => {
    const designPath = writeFile('design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'REQ-F010' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null);
    expect(result.valid).toBe(true);
    expect(result.unauthorized_traces).toHaveLength(0);
  });

  it('q_id trace with null decisionLogFilePath is flagged as unauthorized', () => {
    const designPath = writeFile('design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: 'q1:some content' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null);
    expect(result.valid).toBe(false);
    expect(result.unauthorized_traces).toHaveLength(1);
    expect(result.unauthorized_traces[0].reason).toBeDefined();
  });

  it('returns unauthorized_traces with {trace_value, requirement_id, criterion_id, reason}', () => {
    const designPath = writeFile('design.md', DESIGN_CONTENT);
    const spec = makeSpec([{ req: 'fr-001', crit: 'fr-001-ac1', trace: '2026-04-27:NoSection' }]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null);
    expect(result.unauthorized_traces).toHaveLength(1);
    const ut = result.unauthorized_traces[0];
    expect(ut).toHaveProperty('trace_value');
    expect(ut).toHaveProperty('requirement_id');
    expect(ut).toHaveProperty('criterion_id');
    expect(ut).toHaveProperty('reason');
  });

  it('multiple traces: mix of authorized and unauthorized returns correct counts', () => {
    const designPath = writeFile('design.md', DESIGN_CONTENT);
    const spec = makeSpec([
      { req: 'fr-001', crit: 'fr-001-ac1', trace: '2026-04-27:Architecture' }, // present
      { req: 'fr-002', crit: 'fr-002-ac1', trace: '2026-04-27:MissingSection' }, // absent
      { req: 'fr-003', crit: 'fr-003-ac1', trace: 'REQ-F999' }, // legacy, skipped
    ]);
    const result = mechanicalAuthorizationCheck(spec, designPath, null);
    expect(result.valid).toBe(false);
    expect(result.unauthorized_traces).toHaveLength(1);
    expect(result.unauthorized_traces[0].requirement_id).toBe('fr-002');
  });
});
