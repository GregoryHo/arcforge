const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  parseDesignDoc,
  validateDesignDoc,
  parseSpecHeader,
  validateSpecHeader,
} = require('../../scripts/lib/sdd-utils');

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

  it('detects initial mode when specs/<spec-id>/spec.xml does not exist', () => {
    const filePath = writeFile(
      tmpDir,
      'docs/plans/auth-system/2026-03-15/design.md',
      SUBSTANTIVE_CONTENT,
    );
    const result = parseDesignDoc(filePath, { cwd: tmpDir });
    expect(result.mode).toBe('initial');
  });

  it('detects iteration mode when specs/<spec-id>/spec.xml exists', () => {
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
    expect(result.mode).toBe('iteration');
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
      mode: 'initial',
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

  it('passes a valid initial mode doc with substantive content', () => {
    const parsed = {
      spec_id: 'auth-system',
      iteration: '2026-03-15',
      mode: 'initial',
      hasContext: false,
      hasChangeIntent: false,
      hasSubstantiveContent: true,
      specDesignIteration: null,
    };
    const result = validateDesignDoc(parsed);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });

  it('requires Context heading in iteration mode (ERROR, field: Context)', () => {
    const parsed = {
      spec_id: 'auth-system',
      iteration: '2026-03-15',
      mode: 'iteration',
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

  it('requires Change Intent heading in iteration mode (ERROR, field: Change Intent)', () => {
    const parsed = {
      spec_id: 'auth-system',
      iteration: '2026-03-15',
      mode: 'iteration',
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
      mode: 'iteration',
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

  it('passes a valid iteration mode doc with both required headings', () => {
    const parsed = {
      spec_id: 'auth-system',
      iteration: '2026-03-15',
      mode: 'iteration',
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
    expect(result.delta).not.toBeNull();
    expect(result.delta.version).toBe('2');
    expect(result.delta.added).toHaveLength(1);
    expect(result.delta.modified).toHaveLength(1);
    expect(result.delta.removed).toHaveLength(0);
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
      delta: null,
    };
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const fields = result.issues.filter((i) => i.level === 'ERROR').map((i) => i.field);
    expect(fields).toContain('spec_version');
    expect(fields).toContain('status');
    expect(fields).toContain('source/design_path');
    expect(fields).toContain('source/design_iteration');
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
      delta: null,
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
      delta: null,
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
      delta: null,
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
      delta: null,
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
      delta: null,
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
      delta: null,
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
      delta: null,
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
      delta: {
        version: '2',
        iteration: '2026-04-16',
        added: [{ ref: 'fr-oauth-001', text: 'OAuth support' }],
        modified: [],
        removed: [],
        renamed: [],
      },
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
    expect(result.delta.removed).toHaveLength(1);
    expect(result.delta.removed[0].ref).toBe('fr-login-legacy');
    expect(result.delta.removed[0].reason).toBe('');
    expect(result.delta.removed[0].text).toBe('');
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
    expect(result.delta.removed).toHaveLength(1);
    expect(result.delta.removed[0].ref).toBe('fr-password-reset');
    expect(result.delta.removed[0].text).toBe('Replaced by OAuth flow');
    expect(result.delta.removed[0].reason).toBe('Replaced by OAuth flow');
    expect(result.delta.removed[0].migration).toBe('');
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
    expect(result.delta.removed).toHaveLength(1);
    const rem = result.delta.removed[0];
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
    expect(result.delta.removed).toHaveLength(1);
    const rem = result.delta.removed[0];
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
      delta: {
        version: '2',
        iteration: '2026-04-16',
        added: [],
        modified: [],
        removed: [],
        renamed: [],
      },
      ...overrides,
    };
  }

  it('flags removed entry with no reason and no text as ERROR on delta/removed', () => {
    const parsed = baseParsed({
      delta: {
        version: '2',
        iteration: '2026-04-16',
        added: [],
        modified: [],
        removed: [{ ref: 'fr-legacy-001', reason: '', text: '', migration: '' }],
        renamed: [],
      },
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'delta/removed');
    expect(err).toBeDefined();
    expect(err.message).toMatch(/reason/i);
  });

  it('passes removed entry with reason set via new structured format', () => {
    const parsed = baseParsed({
      delta: {
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
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'ERROR')).toHaveLength(0);
  });

  it('passes removed entry with reason from legacy text content', () => {
    const parsed = baseParsed({
      delta: {
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
    expect(result.delta.renamed).toHaveLength(1);
    const ren = result.delta.renamed[0];
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
    expect(result.delta.renamed).toHaveLength(1);
    const ren = result.delta.renamed[0];
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
    expect(result.delta.renamed).toHaveLength(0);
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
      delta: {
        version: '2',
        iteration: '2026-04-16',
        added: [],
        modified: [],
        removed: [],
        renamed: [],
      },
      ...overrides,
    };
  }

  it('flags renamed entry with missing ref_old as ERROR on delta/renamed', () => {
    const parsed = baseParsed({
      delta: {
        version: '2',
        iteration: '2026-04-16',
        added: [],
        modified: [],
        removed: [],
        renamed: [{ ref_old: '', ref_new: 'fr-jwt-001', reason: '' }],
      },
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'delta/renamed');
    expect(err).toBeDefined();
    expect(err.message).toMatch(/ref_old/i);
  });

  it('flags renamed entry with missing ref_new as ERROR on delta/renamed', () => {
    const parsed = baseParsed({
      delta: {
        version: '2',
        iteration: '2026-04-16',
        added: [],
        modified: [],
        removed: [],
        renamed: [{ ref_old: 'fr-auth-001', ref_new: '', reason: '' }],
      },
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.valid).toBe(false);
    const err = result.issues.find((i) => i.level === 'ERROR' && i.field === 'delta/renamed');
    expect(err).toBeDefined();
    expect(err.message).toMatch(/ref_new/i);
  });

  it('passes valid renamed entry with both refs present', () => {
    const parsed = baseParsed({
      delta: {
        version: '2',
        iteration: '2026-04-16',
        added: [],
        modified: [],
        removed: [],
        renamed: [{ ref_old: 'fr-auth-001', ref_new: 'fr-jwt-001', reason: '' }],
      },
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
      delta: {
        version: '2',
        iteration: '2026-05-10',
        added: [{ ref: 'fr-x-001', text: 'New' }],
        modified: [],
        removed: [],
        renamed: [],
      },
      ...overrides,
    };
  }

  it('flags missing delta for v2+ as ERROR', () => {
    const parsed = makeV2Parsed({ delta: null });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const deltaErrors = result.issues.filter((i) => i.level === 'ERROR' && i.field === 'delta');
    expect(deltaErrors.length).toBeGreaterThan(0);
  });

  it('does not require delta for v1 specs', () => {
    const parsed = makeV2Parsed({
      spec_version: 1,
      supersedes: null,
      delta: null,
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    const deltaPresenceErrors = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field === 'delta',
    );
    expect(deltaPresenceErrors).toHaveLength(0);
  });

  it('flags delta.version mismatch with spec_version as ERROR', () => {
    const parsed = makeV2Parsed({
      delta: {
        version: '3', // mismatched
        iteration: '2026-05-10',
        added: [],
        modified: [],
        removed: [],
        renamed: [],
      },
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ level: 'ERROR', field: 'delta/version' })]),
    );
  });

  it('flags delta.iteration mismatch with design_iteration as ERROR', () => {
    const parsed = makeV2Parsed({
      delta: {
        version: '2',
        iteration: '2026-06-01', // mismatched
        added: [],
        modified: [],
        removed: [],
        renamed: [],
      },
    });
    const result = validateSpecHeader(parsed, { cwd: tmpDir });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 'ERROR', field: 'delta/iteration' }),
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

  it('accepts delta.iteration with suffix (matching design_iteration exactly)', () => {
    // Compare as strings — suffix like "-v2" is allowed as long as both match
    const parsed = makeV2Parsed({
      design_iteration: '2026-04-16-v2',
      delta: {
        version: '2',
        iteration: '2026-04-16-v2',
        added: [],
        modified: [],
        removed: [],
        renamed: [],
      },
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
// parseSpecHeader integration with real artifacts
// ---------------------------------------------------------------------------

describe('parseSpecHeader integration with real artifacts', () => {
  it('parses specs/spec-driven-refine/spec.xml with delta present', () => {
    const xmlPath = path.join(process.cwd(), 'specs/spec-driven-refine/spec.xml');
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const parsed = parseSpecHeader(xml);

    expect(parsed).not.toBeNull();
    expect(parsed.spec_id).toBe('spec-driven-refine');
    expect(parsed.spec_version).toBe(2);
    expect(parsed.delta).not.toBeNull();
    expect(parsed.delta.version).toBe('2');
    expect(parsed.delta.iteration).toBe('2026-04-16-v2');
    expect(parsed.delta.modified.length).toBeGreaterThan(0);
    expect(parsed.delta.removed.length).toBeGreaterThan(0);
    // renamed array should exist (added by enhancement 5) — may be empty
    expect(Array.isArray(parsed.delta.renamed)).toBe(true);
  });

  it('validates specs/spec-driven-refine/spec.xml with zero ERROR issues', () => {
    const xmlPath = path.join(process.cwd(), 'specs/spec-driven-refine/spec.xml');
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const parsed = parseSpecHeader(xml);

    const result = validateSpecHeader(parsed, { cwd: process.cwd() });
    // Filter out the known adjacent design_iteration suffix issue:
    // validateSpecHeader's /^\d{4}-\d{2}-\d{2}$/ regex rejects '2026-04-16-v2' (suffix form),
    // but parseDesignDoc's DESIGN_PATH_RE accepts it. This inconsistency is a separate issue
    // from delta placement — see "Known Adjacent Issue" in the task spec.
    const errors = result.issues.filter(
      (i) => i.level === 'ERROR' && i.field !== 'source/design_iteration',
    );
    if (errors.length > 0) {
      // Diagnostic output on failure
      console.error('Validation errors:', errors);
    }
    expect(errors).toHaveLength(0);
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
      delta: null,
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
