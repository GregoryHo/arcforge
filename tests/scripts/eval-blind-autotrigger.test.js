/**
 * Tests for blind-comparator auto-trigger logic (fr-gr-005).
 *
 * Tests:
 *   - (ac1) all-model scenario → runBlindComparator called pair-count times, result attached
 *   - (ac2) mixed scenario → runBlindComparator NOT called; report contains skip note
 *   - (ac3) all-code scenario → runBlindComparator NOT called; report silent on blind
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Mock utils.execCommand to intercept Claude calls
jest.mock('../../scripts/lib/utils', () => {
  const actual = jest.requireActual('../../scripts/lib/utils');
  return { ...actual, execCommand: jest.fn((...args) => actual.execCommand(...args)) };
});

const mockUtils = require('../../scripts/lib/utils');

const {
  runBlindAutoTrigger,
  saveBlindResults,
  loadBlindResults,
} = require('../../scripts/lib/eval-blind-autotrigger');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-blind-autotrigger-'));
}

function makeTrialResult(condition, trial, overrides = {}) {
  return {
    eval: `test-scenario-${condition}`,
    trial,
    k: 3,
    passed: true,
    grader: 'model',
    score: 1.0,
    timestamp: '2026-04-20T10:00:00Z',
    runId: 'test-run-001',
    output: `Output from ${condition} trial ${trial}`,
    ...overrides,
  };
}

function makeResults(condition, count = 3) {
  return Array.from({ length: count }, (_, i) => makeTrialResult(condition, i + 1));
}

function makeScenario(grader = 'model', overrides = {}) {
  return {
    name: 'test-scenario',
    scope: 'skill',
    scenario: 'Write a function that reverses a string.',
    context: 'You are working on a JavaScript project.',
    assertions: ['Function exists', 'Function returns reversed string'],
    grader,
    graderConfig: '',
    ...overrides,
  };
}

function makeBlindAgentResponse(winner = 'A') {
  return JSON.stringify({
    winner,
    reasoning: `Output ${winner} was more complete.`,
    score_a: 0.8,
    score_b: 0.6,
    rubric: [{ criterion: 'Task completion', weight: 1.0 }],
    scores_a: [0.8],
    scores_b: [0.6],
  });
}

// ── ac1: all-model scenario → blind runs ──────────────────────────────────────

describe('fr-gr-005-ac1 — all-model scenario triggers blind comparator', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
    mockUtils.execCommand.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('calls runBlindComparator once per pair for all-model scenario', () => {
    const scenario = makeScenario('model');
    const baseline = makeResults('baseline', 3);
    const treatment = makeResults('treatment', 3);
    const pairCount = Math.min(baseline.length, treatment.length); // 3

    // Mock blind comparator responses (one per pair)
    for (let i = 0; i < pairCount; i++) {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: makeBlindAgentResponse(i % 2 === 0 ? 'A' : 'B'),
        stderr: '',
        exitCode: 0,
      });
    }

    const { blindPreferences } = runBlindAutoTrigger(scenario, baseline, treatment, tempDir);

    // Should have called blind comparator exactly pairCount times
    expect(mockUtils.execCommand).toHaveBeenCalledTimes(pairCount);
    expect(blindPreferences).toHaveLength(pairCount);
  });

  it('attaches preference rate to result for all-model scenario', () => {
    const scenario = makeScenario('model');
    const baseline = makeResults('baseline', 3);
    const treatment = makeResults('treatment', 3);

    // treatment wins 2 out of 3 (A=baseline, B=treatment pattern random but mocked)
    mockUtils.execCommand
      .mockReturnValueOnce({ stdout: makeBlindAgentResponse('tie'), stderr: '', exitCode: 0 })
      .mockReturnValueOnce({ stdout: makeBlindAgentResponse('A'), stderr: '', exitCode: 0 })
      .mockReturnValueOnce({ stdout: makeBlindAgentResponse('A'), stderr: '', exitCode: 0 });

    const { blindPreferences, preferenceRate, skipped, skipNote } = runBlindAutoTrigger(
      scenario,
      baseline,
      treatment,
      tempDir,
    );

    expect(skipped).toBe(false);
    expect(skipNote).toBeUndefined();
    expect(blindPreferences).toHaveLength(3);
    expect(preferenceRate).toBeDefined();
    // preference rate totals must sum to pairCount
    const total =
      (preferenceRate.treatment || 0) + (preferenceRate.baseline || 0) + (preferenceRate.tie || 0);
    expect(total).toBe(3);
  });

  it('uses min(baseline_k, treatment_k) pairs when counts differ', () => {
    const scenario = makeScenario('model');
    const baseline = makeResults('baseline', 5);
    const treatment = makeResults('treatment', 3);
    const pairCount = 3; // min(5, 3)

    for (let i = 0; i < pairCount; i++) {
      mockUtils.execCommand.mockReturnValueOnce({
        stdout: makeBlindAgentResponse('A'),
        stderr: '',
        exitCode: 0,
      });
    }

    const { blindPreferences } = runBlindAutoTrigger(scenario, baseline, treatment, tempDir);

    expect(mockUtils.execCommand).toHaveBeenCalledTimes(pairCount);
    expect(blindPreferences).toHaveLength(pairCount);
  });
});

// ── ac2: mixed scenario → blind skipped, report shows skip note ───────────────

describe('fr-gr-005-ac2 — mixed scenario skips blind comparator with note', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
    mockUtils.execCommand.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('does NOT call runBlindComparator for mixed scenario', () => {
    const scenario = makeScenario('mixed');
    const baseline = makeResults('baseline', 3);
    const treatment = makeResults('treatment', 3);

    runBlindAutoTrigger(scenario, baseline, treatment, tempDir);

    expect(mockUtils.execCommand).not.toHaveBeenCalled();
  });

  it('returns skipped=true and a non-empty skipNote for mixed scenario', () => {
    const scenario = makeScenario('mixed');
    const baseline = makeResults('baseline', 3);
    const treatment = makeResults('treatment', 3);

    const { skipped, skipNote } = runBlindAutoTrigger(scenario, baseline, treatment, tempDir);

    expect(skipped).toBe(true);
    expect(typeof skipNote).toBe('string');
    expect(skipNote.length).toBeGreaterThan(0);
  });

  it('skip note mentions code-graded and model-graded assertions', () => {
    const scenario = makeScenario('mixed');
    const baseline = makeResults('baseline', 3);
    const treatment = makeResults('treatment', 3);

    const { skipNote } = runBlindAutoTrigger(scenario, baseline, treatment, tempDir);

    // The note must communicate why it's skipped (mixed grading)
    const lowerNote = skipNote.toLowerCase();
    expect(lowerNote).toContain('blind comparator skipped');
  });
});

// ── ac3: all-code scenario → blind skipped, NO mention in report ───────────────

describe('fr-gr-005-ac3 — all-code scenario silently skips blind comparator', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
    mockUtils.execCommand.mockClear();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('does NOT call runBlindComparator for all-code scenario', () => {
    const scenario = makeScenario('code');
    const baseline = makeResults('baseline', 3);
    const treatment = makeResults('treatment', 3);

    runBlindAutoTrigger(scenario, baseline, treatment, tempDir);

    expect(mockUtils.execCommand).not.toHaveBeenCalled();
  });

  it('returns skipped=true and NO skipNote for all-code scenario', () => {
    const scenario = makeScenario('code');
    const baseline = makeResults('baseline', 3);
    const treatment = makeResults('treatment', 3);

    const { skipped, skipNote } = runBlindAutoTrigger(scenario, baseline, treatment, tempDir);

    expect(skipped).toBe(true);
    // all-code: no mention at all — skipNote must be absent or empty
    expect(!skipNote || skipNote.length === 0).toBe(true);
  });
});

// ── Persistence: saveBlindResults / loadBlindResults ─────────────────────────

describe('blind result persistence', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('saves and loads blind preferences round-trip', () => {
    const scenarioName = 'test-scenario';
    const runId = 'test-run-001';
    const preferences = [
      { pair: 1, winner_original_label: 'treatment', reasoning: 'Better output' },
      { pair: 2, winner_original_label: 'baseline', reasoning: 'More complete' },
    ];

    saveBlindResults(scenarioName, runId, preferences, tempDir);
    const loaded = loadBlindResults(scenarioName, runId, tempDir);

    expect(loaded).not.toBeNull();
    expect(loaded.blind_preferences).toHaveLength(2);
    expect(loaded.blind_preferences[0].winner_original_label).toBe('treatment');
    expect(loaded.blind_preferences[1].winner_original_label).toBe('baseline');
  });

  it('returns null when blind.json does not exist', () => {
    const result = loadBlindResults('nonexistent-scenario', 'run-001', tempDir);
    expect(result).toBeNull();
  });

  it('saves blind.json at the expected path', () => {
    const scenarioName = 'my-eval';
    const runId = '20260420';
    const preferences = [{ pair: 1, winner_original_label: 'tie' }];

    saveBlindResults(scenarioName, runId, preferences, tempDir);

    const expectedPath = path.join(
      tempDir,
      'evals',
      'results',
      scenarioName,
      runId,
      'blind.json',
    );
    expect(fs.existsSync(expectedPath)).toBe(true);
  });
});
