// tests/scripts/reflect-save-instinct.test.js

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock session-utils to redirect paths to temp directories
// Variables prefixed with "mock" are allowed in jest.mock() factories
let mockInstinctsDir;
let mockGlobalInstinctsDir;
let mockGlobalIndex;

jest.mock('../../scripts/lib/session-utils', () => ({
  getInstinctsDir: jest.fn(() => mockInstinctsDir),
  getGlobalInstinctsDir: jest.fn(() => mockGlobalInstinctsDir),
  getInstinctsGlobalIndex: jest.fn(() => mockGlobalIndex),
  // Include other functions that might be needed
  getProcessedLogPath: jest.fn(),
  scanDiaries: jest.fn(() => []),
  determineReflectStrategy: jest.fn(() => 'standard'),
  updateProcessedLog: jest.fn()
}));

const { saveInstinct } = require('../../scripts/lib/instinct-writer');
const { REFLECT_MAX_CONFIDENCE, parseConfidenceFrontmatter } = require('../../scripts/lib/confidence');

describe('reflect save-instinct', () => {
  const testDir = path.join(os.tmpdir(), 'reflect-instinct-test-' + Date.now());

  beforeEach(() => {
    mockInstinctsDir = path.join(testDir, 'instincts');
    mockGlobalInstinctsDir = path.join(testDir, 'global');
    mockGlobalIndex = path.join(testDir, 'index.jsonl');
    fs.mkdirSync(mockInstinctsDir, { recursive: true });
    fs.mkdirSync(path.dirname(mockGlobalIndex), { recursive: true });
  });

  afterEach(() => {
    // Clean up all test dirs
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should cap confidence at REFLECT_MAX_CONFIDENCE (0.85)', () => {
    // With high evidenceCount, confidence should be capped
    const result = saveInstinct({
      id: 'test-pattern',
      trigger: 'when testing',
      action: 'do test thing',
      project: 'test-project',
      domain: 'reflection',
      source: 'reflection',
      evidence: 'saw this in session',
      maxConfidence: REFLECT_MAX_CONFIDENCE,
      evidenceCount: 20  // Would push way above cap
    });

    expect(result.confidence).toBeLessThanOrEqual(REFLECT_MAX_CONFIDENCE);
    expect(result.isNew).toBe(true);
    expect(fs.existsSync(result.path)).toBe(true);
  });

  it('should set source to reflection in frontmatter', () => {
    const result = saveInstinct({
      id: 'reflect-source-test',
      trigger: 'when reflecting',
      action: 'save pattern',
      project: 'test-project',
      domain: 'reflection',
      source: 'reflection',
      evidence: 'from diary analysis',
      maxConfidence: REFLECT_MAX_CONFIDENCE,
      evidenceCount: 1
    });

    const content = fs.readFileSync(result.path, 'utf-8');
    const { frontmatter } = parseConfidenceFrontmatter(content);
    expect(frontmatter.source).toBe('reflection');
  });

  it('should calculate confidence based on evidenceCount', () => {
    // INITIAL (0.5) + 0.05 * evidenceCount, capped at maxConfidence
    const result1 = saveInstinct({
      id: 'evidence-1',
      trigger: 'one evidence',
      action: 'do thing',
      project: 'test-project',
      domain: 'reflection',
      source: 'reflection',
      evidence: '',
      maxConfidence: REFLECT_MAX_CONFIDENCE,
      evidenceCount: 1
    });
    expect(result1.confidence).toBeCloseTo(0.55); // 0.5 + 0.05 * 1

    const result3 = saveInstinct({
      id: 'evidence-3',
      trigger: 'three evidence',
      action: 'do thing',
      project: 'test-project',
      domain: 'reflection',
      source: 'reflection',
      evidence: '',
      maxConfidence: REFLECT_MAX_CONFIDENCE,
      evidenceCount: 3
    });
    expect(result3.confidence).toBeCloseTo(0.65); // 0.5 + 0.05 * 3
  });

  it('should handle dedup via same id', () => {
    // First save
    const r1 = saveInstinct({
      id: 'dedup-test',
      trigger: 'when duplicating',
      action: 'handle gracefully',
      project: 'test-project',
      domain: 'reflection',
      source: 'reflection',
      evidence: '',
      maxConfidence: REFLECT_MAX_CONFIDENCE,
      evidenceCount: 1
    });
    expect(r1.isNew).toBe(true);

    // Second save with same id — should update, not create new
    const r2 = saveInstinct({
      id: 'dedup-test',
      trigger: 'when duplicating again',
      action: 'handle gracefully again',
      project: 'test-project',
      domain: 'reflection',
      source: 'reflection',
      evidence: '',
      maxConfidence: REFLECT_MAX_CONFIDENCE,
      evidenceCount: 2
    });
    expect(r2.isNew).toBe(false);
  });

  it('should include domain in frontmatter', () => {
    const result = saveInstinct({
      id: 'domain-test',
      trigger: 'when testing domain',
      action: 'use correct domain',
      project: 'test-project',
      domain: 'error-handling',
      source: 'reflection',
      evidence: '',
      maxConfidence: REFLECT_MAX_CONFIDENCE,
      evidenceCount: 1
    });

    const content = fs.readFileSync(result.path, 'utf-8');
    const { frontmatter } = parseConfidenceFrontmatter(content);
    expect(frontmatter.domain).toBe('error-handling');
  });

  it('should use REFLECT_MAX_CONFIDENCE value of 0.85', () => {
    expect(REFLECT_MAX_CONFIDENCE).toBe(0.85);
  });
});
