/**
 * sdd-writer.test.js — TDD tests for writeConflictMarker (fr-rf-015).
 *
 * Tests the new writer function that refiner calls on R3 axis-1/2/3 block.
 * Verifies the round-trip contract with parseConflictMarker (fr-cc-if-007),
 * schema validation, atomic write, path correctness, and re-export from sdd-utils.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Test both import paths: direct from sdd-validators and re-exported from sdd-utils.
const { writeConflictMarker } = require('../../scripts/lib/sdd-validators');
const sddUtils = require('../../scripts/lib/sdd-utils');
const { parseConflictMarker, PENDING_CONFLICT_RULES } = sddUtils;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeValidConflict() {
  return {
    axis_fired: '1',
    conflict_description: 'design.md lines 32-35 contradict lines 78-81.',
    candidate_resolutions: ['(a) Adopt the 60-second window.', '(b) Adopt the 5-minute window.'],
    user_action_prompt: 'Run /arc-brainstorming iterate my-spec to resolve this conflict.',
  };
}

// ---------------------------------------------------------------------------
// Re-export from sdd-utils
// ---------------------------------------------------------------------------

describe('writeConflictMarker re-exported from sdd-utils', () => {
  it('is callable from sdd-utils (re-export is present)', () => {
    expect(typeof sddUtils.writeConflictMarker).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// Path correctness
// ---------------------------------------------------------------------------

describe('writeConflictMarker — path correctness', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-writer-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes the file at <projectRoot>/specs/<specId>/_pending-conflict.md', () => {
    const specId = 'my-spec';
    const expectedPath = path.join(tmpDir, 'specs', specId, '_pending-conflict.md');
    const returned = writeConflictMarker(specId, makeValidConflict(), tmpDir);
    expect(returned).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it('returns the absolute path of the written file', () => {
    const specId = 'other-spec';
    const returned = writeConflictMarker(specId, makeValidConflict(), tmpDir);
    expect(path.isAbsolute(returned)).toBe(true);
  });

  it('creates intermediate directories if they do not exist', () => {
    const specId = 'brand-new-spec';
    const specDir = path.join(tmpDir, 'specs', specId);
    expect(fs.existsSync(specDir)).toBe(false);
    writeConflictMarker(specId, makeValidConflict(), tmpDir);
    expect(fs.existsSync(specDir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Round-trip test (write → parseConflictMarker)
// ---------------------------------------------------------------------------

describe('writeConflictMarker — round-trip with parseConflictMarker', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-roundtrip-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips a valid conflict: write then parse returns matching fields', () => {
    const input = makeValidConflict();
    const filePath = writeConflictMarker('round-trip-spec', input, tmpDir);
    const parsed = parseConflictMarker(filePath);
    expect(parsed).not.toBeNull();
    expect(parsed.axis_fired).toBe(input.axis_fired);
    expect(parsed.conflict_description).toBe(input.conflict_description);
    expect(parsed.candidate_resolutions).toEqual(input.candidate_resolutions);
    expect(parsed.user_action_prompt).toBe(input.user_action_prompt);
  });

  it('round-trips with axis_fired "2"', () => {
    const input = {
      axis_fired: '2',
      conflict_description: 'design says windowSec; Q&A says windowMs.',
      candidate_resolutions: ['(a) Keep design wording.'],
      user_action_prompt: 'Run /arc-brainstorming iterate test-spec.',
    };
    const filePath = writeConflictMarker('axis2-spec', input, tmpDir);
    const parsed = parseConflictMarker(filePath);
    expect(parsed).not.toBeNull();
    expect(parsed.axis_fired).toBe('2');
    expect(parsed.candidate_resolutions).toHaveLength(1);
  });

  it('round-trips with 3 candidate resolutions', () => {
    const input = {
      axis_fired: '3',
      conflict_description: 'Criterion cannot be traced.',
      candidate_resolutions: [
        '(a) Downgrade to SHOULD.',
        '(b) Leave axis unbound.',
        '(c) Ask user in new brainstorm.',
      ],
      user_action_prompt: 'Run /arc-brainstorming iterate spec-three.',
    };
    const filePath = writeConflictMarker('three-res-spec', input, tmpDir);
    const parsed = parseConflictMarker(filePath);
    expect(parsed).not.toBeNull();
    expect(parsed.candidate_resolutions).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Schema validation — missing required fields
// ---------------------------------------------------------------------------

describe('writeConflictMarker — missing required field throws', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-missing-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws when axis_fired is missing, including field name in error', () => {
    const data = { ...makeValidConflict() };
    delete data.axis_fired;
    expect(() => writeConflictMarker('missing-spec', data, tmpDir)).toThrow(/axis_fired/);
  });

  it('throws when conflict_description is missing, including field name in error', () => {
    const data = { ...makeValidConflict() };
    delete data.conflict_description;
    expect(() => writeConflictMarker('missing-spec', data, tmpDir)).toThrow(/conflict_description/);
  });

  it('throws when candidate_resolutions is missing, including field name in error', () => {
    const data = { ...makeValidConflict() };
    delete data.candidate_resolutions;
    expect(() => writeConflictMarker('missing-spec', data, tmpDir)).toThrow(
      /candidate_resolutions/,
    );
  });

  it('throws when user_action_prompt is missing, including field name in error', () => {
    const data = { ...makeValidConflict() };
    delete data.user_action_prompt;
    expect(() => writeConflictMarker('missing-spec', data, tmpDir)).toThrow(/user_action_prompt/);
  });
});

// ---------------------------------------------------------------------------
// candidate_resolutions length validation (fr-sd-012-ac1, fr-cc-if-007-ac2)
// ---------------------------------------------------------------------------

describe('writeConflictMarker — candidate_resolutions length', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-reslen-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws the exact error message when candidate_resolutions is empty', () => {
    const data = { ...makeValidConflict(), candidate_resolutions: [] };
    expect(() => writeConflictMarker('empty-res-spec', data, tmpDir)).toThrow(
      '_pending-conflict.md MUST contain at least one candidate resolution',
    );
  });

  it('throws when candidate_resolutions has more than 3 entries', () => {
    const data = {
      ...makeValidConflict(),
      candidate_resolutions: ['(a)', '(b)', '(c)', '(d) Too many.'],
    };
    expect(() => writeConflictMarker('too-many-spec', data, tmpDir)).toThrow();
  });

  it('accepts exactly 1 candidate resolution (min boundary)', () => {
    const data = { ...makeValidConflict(), candidate_resolutions: ['(a) Single option.'] };
    expect(() => writeConflictMarker('one-res-spec', data, tmpDir)).not.toThrow();
  });

  it('accepts exactly 3 candidate resolutions (max boundary)', () => {
    const data = {
      ...makeValidConflict(),
      candidate_resolutions: ['(a) First.', '(b) Second.', '(c) Third.'],
    };
    expect(() => writeConflictMarker('three-res-spec', data, tmpDir)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PENDING_CONFLICT_RULES integration (no local literal field names — fr-sd-014-ac4)
// ---------------------------------------------------------------------------

describe('writeConflictMarker — schema driven by PENDING_CONFLICT_RULES', () => {
  it('PENDING_CONFLICT_RULES.required_fields contains all four expected field keys', () => {
    const keys = PENDING_CONFLICT_RULES.required_fields.map((f) => f.key);
    expect(keys).toContain('axis_fired');
    expect(keys).toContain('conflict_description');
    expect(keys).toContain('candidate_resolutions');
    expect(keys).toContain('user_action_prompt');
  });

  it('candidate_resolutions rule in PENDING_CONFLICT_RULES has min_length=1 and max_length=3', () => {
    const rule = PENDING_CONFLICT_RULES.required_fields.find(
      (r) => r.key === 'candidate_resolutions',
    );
    expect(rule).toBeDefined();
    expect(rule.min_length).toBe(1);
    expect(rule.max_length).toBe(3);
  });
});
