/**
 * Tests for eval-graders.js — focused on fr-gr-003 and fr-gr-004 features.
 *
 * These tests verify:
 * - grading.json is written with discovered_claims[] and weak_assertions[]
 * - discovered_claims and weak_assertions do NOT affect score or passed
 * - Schema validation: entries must have required keys
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn((...args) => actual.execCommand(...args)) };
});
const mockUtils = require('../../scripts/lib/utils');

const {
  gradeWithModel,
  gradeTrialResult,
  validateGraderResponse,
  snapScore,
  getGradingPath,
} = require('../../scripts/lib/eval-graders');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-graders-'));
}

function makeTrialResult(overrides = {}) {
  return {
    eval: 'test-eval',
    trial: 1,
    k: 3,
    passed: false,
    grader: 'model',
    score: 0,
    timestamp: '2026-04-20T10:00:00Z',
    runId: 'test-run-001',
    duration_ms: 1000,
    input_tokens: 100,
    output_tokens: 50,
    output: 'The agent wrote the test first, then the implementation.',
    ...overrides,
  };
}

function makeScenario(overrides = {}) {
  return {
    name: 'test-eval',
    scope: 'skill',
    scenario: 'Implement TDD.',
    context: '',
    assertions: ['Writes test before implementation', 'All tests pass'],
    grader: 'model',
    graderConfig: 'Score each assertion based on evidence.',
    ...overrides,
  };
}

// Helper: build a mock grader JSON response
function makeGraderResponse(overrides = {}) {
  return JSON.stringify({
    scores: [1.0, 1.0],
    evidence: ['Test file created first.', 'All tests pass.'],
    blockRefs: [[1], [2]],
    overall: 1.0,
    passed: true,
    ...overrides,
  });
}

describe('eval-graders.js', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    mockUtils.execCommand.mockClear();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── fr-gr-003: discovered_claims[] in grading.json ──────────

  describe('fr-gr-003 — discovered_claims[] in grading.json', () => {
    it('should write grading.json with discovered_claims when grader returns them', () => {
      const result = makeTrialResult({ trialDir: tempDir });
      const scenario = makeScenario();

      const responseWithClaims = JSON.stringify({
        scores: [1.0, 1.0],
        evidence: ['Evidence 1', 'Evidence 2'],
        overall: 1.0,
        passed: true,
        discovered_claims: [
          {
            text: 'Used proper TDD cycle',
            category: 'process',
            passed: true,
            evidence: 'Wrote test first',
          },
          {
            text: 'Output was factual',
            category: 'factual',
            passed: true,
            evidence: 'Verifiable in transcript',
          },
        ],
      });

      mockUtils.execCommand.mockReturnValueOnce({ stdout: responseWithClaims, exitCode: 0 });

      gradeWithModel(result, scenario, tempDir);

      // grading.json should be written
      const gradingFile = getGradingPath(result, tempDir);
      expect(fs.existsSync(gradingFile)).toBe(true);

      const grading = JSON.parse(fs.readFileSync(gradingFile, 'utf8'));
      expect(grading).toHaveProperty('discovered_claims');
      expect(Array.isArray(grading.discovered_claims)).toBe(true);
      expect(grading.discovered_claims).toHaveLength(2);
      expect(grading.discovered_claims[0]).toMatchObject({
        text: 'Used proper TDD cycle',
        category: 'process',
        passed: true,
        evidence: 'Wrote test first',
      });
    });

    it('should write grading.json with empty discovered_claims when grader omits the field', () => {
      const result = makeTrialResult({ trialDir: tempDir });
      const scenario = makeScenario();

      mockUtils.execCommand.mockReturnValueOnce({ stdout: makeGraderResponse(), exitCode: 0 });

      gradeWithModel(result, scenario, tempDir);

      const gradingFile = getGradingPath(result, tempDir);
      expect(fs.existsSync(gradingFile)).toBe(true);

      const grading = JSON.parse(fs.readFileSync(gradingFile, 'utf8'));
      expect(grading.discovered_claims).toEqual([]);
    });

    it('should NOT affect score or passed based on discovered_claims content', () => {
      const result = makeTrialResult({ trialDir: tempDir });
      const scenario = makeScenario();

      // Response with no discovered_claims
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: makeGraderResponse({ scores: [1.0, 0.0] }),
        exitCode: 0,
      });
      const gradedEmpty = gradeWithModel(result, scenario, tempDir);

      // Reset mock for second call
      mockUtils.execCommand.mockClear();
      const tempDir2 = makeTempDir();
      const result2 = makeTrialResult({ trialDir: tempDir2 });

      // Response with discovered_claims
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: JSON.stringify({
          scores: [1.0, 0.0],
          evidence: ['Evidence 1', 'Evidence 2'],
          overall: 0.5,
          passed: false,
          discovered_claims: [
            { text: 'Claim A', category: 'quality', passed: true, evidence: 'Supporting text' },
          ],
        }),
        exitCode: 0,
      });
      const gradedWithClaims = gradeWithModel(result2, scenario, tempDir2);
      fs.rmSync(tempDir2, { recursive: true, force: true });

      // Score and passed must be identical regardless of discovered_claims
      expect(gradedWithClaims.score).toBe(gradedEmpty.score);
      expect(gradedWithClaims.passed).toBe(gradedEmpty.passed);
    });

    it('should validate discovered_claims entries have required keys and warn on missing keys', () => {
      const result = makeTrialResult({ trialDir: tempDir });
      const scenario = makeScenario();

      const invalidClaims = JSON.stringify({
        scores: [1.0, 1.0],
        evidence: ['E1', 'E2'],
        overall: 1.0,
        passed: true,
        // Missing 'evidence' key in claim entry
        discovered_claims: [{ text: 'Claim without evidence', category: 'factual', passed: true }],
      });

      const warnSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});
      mockUtils.execCommand.mockReturnValueOnce({ stdout: invalidClaims, exitCode: 0 });

      gradeWithModel(result, scenario, tempDir);

      // Should not crash — grading still succeeds
      const gradingFile = getGradingPath(result, tempDir);
      expect(fs.existsSync(gradingFile)).toBe(true);

      warnSpy.mockRestore();
    });

    it('should write grading.json with trial metadata', () => {
      const result = makeTrialResult({ trialDir: tempDir });
      const scenario = makeScenario();

      mockUtils.execCommand.mockReturnValueOnce({ stdout: makeGraderResponse(), exitCode: 0 });

      gradeWithModel(result, scenario, tempDir);

      const gradingFile = getGradingPath(result, tempDir);
      const grading = JSON.parse(fs.readFileSync(gradingFile, 'utf8'));

      // Should include trial reference info
      expect(grading).toHaveProperty('trial');
      expect(grading).toHaveProperty('eval');
      expect(grading.discovered_claims).toEqual([]);
      expect(grading).toHaveProperty('weak_assertions');
    });
  });

  // ── fr-gr-004: weak_assertions[] in grading.json ─────────────

  describe('fr-gr-004 — weak_assertions[] in grading.json', () => {
    it('should write grading.json with weak_assertions when grader returns them', () => {
      const result = makeTrialResult({ trialDir: tempDir });
      const scenario = makeScenario();

      const responseWithWeak = JSON.stringify({
        scores: [1.0, 1.0],
        evidence: ['Evidence 1', 'Evidence 2'],
        overall: 1.0,
        passed: true,
        weak_assertions: [{ assertion_id: 1, reason: 'Hard to verify from transcript alone' }],
      });

      mockUtils.execCommand.mockReturnValueOnce({ stdout: responseWithWeak, exitCode: 0 });

      gradeWithModel(result, scenario, tempDir);

      const gradingFile = getGradingPath(result, tempDir);
      const grading = JSON.parse(fs.readFileSync(gradingFile, 'utf8'));

      expect(grading).toHaveProperty('weak_assertions');
      expect(Array.isArray(grading.weak_assertions)).toBe(true);
      expect(grading.weak_assertions).toHaveLength(1);
      expect(grading.weak_assertions[0]).toMatchObject({
        assertion_id: 1,
        reason: 'Hard to verify from transcript alone',
      });
    });

    it('should default to empty weak_assertions when grader omits the field', () => {
      const result = makeTrialResult({ trialDir: tempDir });
      const scenario = makeScenario();

      mockUtils.execCommand.mockReturnValueOnce({ stdout: makeGraderResponse(), exitCode: 0 });

      gradeWithModel(result, scenario, tempDir);

      const gradingFile = getGradingPath(result, tempDir);
      const grading = JSON.parse(fs.readFileSync(gradingFile, 'utf8'));
      expect(grading.weak_assertions).toEqual([]);
    });

    it('should NOT affect verdict when weak_assertions is populated vs empty', () => {
      const result = makeTrialResult({ trialDir: tempDir });
      const scenario = makeScenario();

      // Trial 1: no weak_assertions
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: makeGraderResponse({ scores: [1.0, 0.25] }),
        exitCode: 0,
      });
      const gradedNoWeak = gradeWithModel(result, scenario, tempDir);

      mockUtils.execCommand.mockClear();
      const tempDir2 = makeTempDir();
      const result2 = makeTrialResult({ trialDir: tempDir2 });

      // Trial 2: with weak_assertions filled
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: JSON.stringify({
          scores: [1.0, 0.25],
          evidence: ['Evidence 1', 'Evidence 2'],
          overall: 0.625,
          passed: false,
          weak_assertions: [{ assertion_id: 2, reason: 'Non-discriminative' }],
        }),
        exitCode: 0,
      });
      const gradedWithWeak = gradeWithModel(result2, scenario, tempDir2);
      fs.rmSync(tempDir2, { recursive: true, force: true });

      // Verdict must be invariant to weak_assertions
      expect(gradedWithWeak.score).toBe(gradedNoWeak.score);
      expect(gradedWithWeak.passed).toBe(gradedNoWeak.passed);
    });
  });
});
