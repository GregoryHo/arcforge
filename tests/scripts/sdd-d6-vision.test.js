/**
 * sdd-d6-vision.test.js — Tests for T2: parseVision + validateVision.
 *
 * parseVision: parses product/vision.md or specs/<id>/vision.md.
 * validateVision: two-layer cross-file validation — validates per-spec principle_refs
 *   resolve to P-n identifiers present in product/vision.md.
 *
 * Files are date-less and outside DESIGN_DOC_RULES.path_regex (regression tested here).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { parseVision, validateVision, DESIGN_DOC_RULES } = require('../../scripts/lib/sdd-utils');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-d6-vision-'));
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

const PRODUCT_VISION_CONTENT = `# Product Vision

P-1. Simplicity first — prefer composable, minimal solutions.
P-2. Security by default — fail-safe, no implicit trust.
P-3. Transparency — every decision traceable to a rationale.
`;

const SPEC_VISION_CONTENT = `# Spec Vision

This spec scopes to principles P-1 and P-3.

principle_ref: P-1
principle_ref: P-3
`;

const SPEC_VISION_NO_REFS = `# Spec Vision

No principle references here.
`;

// ---------------------------------------------------------------------------
// parseVision — product/vision.md
// ---------------------------------------------------------------------------

describe('parseVision — product/vision.md (T2)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => cleanupDir(tmpDir));

  it('parses P-n principle identifiers from product vision', () => {
    const filePath = writeFile(tmpDir, 'product/vision.md', PRODUCT_VISION_CONTENT);
    const result = parseVision(filePath, { type: 'product' });
    expect(result).not.toBeNull();
    expect(result.principles).toContain('P-1');
    expect(result.principles).toContain('P-2');
    expect(result.principles).toContain('P-3');
  });

  it('returns null for non-existent file', () => {
    const result = parseVision(path.join(tmpDir, 'missing.md'), { type: 'product' });
    expect(result).toBeNull();
  });

  it('returns empty principles array for vision with no P-n markers', () => {
    const filePath = writeFile(tmpDir, 'product/vision.md', '# Vision\n\nNo principles here.\n');
    const result = parseVision(filePath, { type: 'product' });
    expect(result).not.toBeNull();
    expect(result.principles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseVision — specs/<id>/vision.md
// ---------------------------------------------------------------------------

describe('parseVision — specs/<id>/vision.md (T2)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => cleanupDir(tmpDir));

  it('parses principle_ref values from spec vision', () => {
    const filePath = writeFile(tmpDir, 'specs/my-spec/vision.md', SPEC_VISION_CONTENT);
    const result = parseVision(filePath, { type: 'spec' });
    expect(result).not.toBeNull();
    expect(result.principle_refs).toContain('P-1');
    expect(result.principle_refs).toContain('P-3');
  });

  it('returns empty principle_refs for spec vision with none', () => {
    const filePath = writeFile(tmpDir, 'specs/my-spec/vision.md', SPEC_VISION_NO_REFS);
    const result = parseVision(filePath, { type: 'spec' });
    expect(result).not.toBeNull();
    expect(result.principle_refs).toEqual([]);
  });

  it('returns null for non-existent file', () => {
    const result = parseVision(path.join(tmpDir, 'missing.md'), { type: 'spec' });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateVision — cross-file validation
// ---------------------------------------------------------------------------

describe('validateVision — cross-file (T2)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => cleanupDir(tmpDir));

  it('passes when all spec principle_refs resolve to product P-n', () => {
    const productParsed = { principles: ['P-1', 'P-2', 'P-3'] };
    const specParsed = { principle_refs: ['P-1', 'P-3'] };
    const result = validateVision(productParsed, specParsed);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('errors when spec principle_ref does not exist in product vision', () => {
    const productParsed = { principles: ['P-1', 'P-2'] };
    const specParsed = { principle_refs: ['P-99'] };
    const result = validateVision(productParsed, specParsed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('P-99'))).toBe(true);
  });

  it('errors for each missing principle_ref', () => {
    const productParsed = { principles: ['P-1'] };
    const specParsed = { principle_refs: ['P-2', 'P-3'] };
    const result = validateVision(productParsed, specParsed);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('passes when spec has no principle_refs (absence is benign)', () => {
    const productParsed = { principles: ['P-1', 'P-2'] };
    const specParsed = { principle_refs: [] };
    const result = validateVision(productParsed, specParsed);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('errors when product/vision.md is null (absent) but spec has principle_refs', () => {
    // Contract: if spec has principle_refs but product vision is absent, refs are unresolvable → ERROR.
    const specParsed = { principle_refs: ['P-1'] };
    const result = validateVision(null, specParsed);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('passes when product/vision.md is absent and spec has no principle_refs', () => {
    // Contract: no refs to resolve → absence is benign.
    const specParsed = { principle_refs: [] };
    const result = validateVision(null, specParsed);
    expect(result.valid).toBe(true);
  });

  it('accepts null specVision (spec file not present is benign)', () => {
    // Per-spec vision is optional — its absence doesn't fail validation.
    const productParsed = { principles: ['P-1', 'P-2'] };
    const result = validateVision(productParsed, null);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression — validateDesignDoc must NOT touch vision.md paths
// ---------------------------------------------------------------------------

describe('vision paths are outside DESIGN_DOC_RULES.path_regex (regression)', () => {
  it('product/vision.md does not match path_regex', () => {
    expect(DESIGN_DOC_RULES.path_regex.test('product/vision.md')).toBe(false);
  });

  it('specs/my-spec/vision.md does not match path_regex', () => {
    expect(DESIGN_DOC_RULES.path_regex.test('specs/my-spec/vision.md')).toBe(false);
  });
});
