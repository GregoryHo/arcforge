const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseDesignDoc, validateDesignDoc } = require('../../scripts/lib/sdd-utils');

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
