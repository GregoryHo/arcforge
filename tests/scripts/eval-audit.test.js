/**
 * Tests for eval-audit.js
 *
 * Covers:
 * - collectGradingData: walks evals/results to gather discovered_claims and weak_assertions
 * - buildPromotionCandidates: sorts by descending frequency × failure_rate
 * - buildRetirementCandidates: buckets weak assertions by assertion_id
 * - runAudit: aggregates and emits candidates given ≥10 graded trials across multiple scenarios
 * - Read-only invariant: scenarios files unchanged after audit run
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  collectGradingData,
  buildPromotionCandidates,
  buildRetirementCandidates,
  runAudit,
} = require('../../scripts/lib/eval-audit');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-audit-'));
}

/**
 * Write a grading.json file at the canonical path structure:
 * evals/results/<scenario>/<runId>/grading/trial-<n>.json
 */
function writeGradingJson(dir, scenario, runId, trialNum, data) {
  const gradingDir = path.join(dir, 'evals', 'results', scenario, runId, 'grading');
  fs.mkdirSync(gradingDir, { recursive: true });
  fs.writeFileSync(path.join(gradingDir, `trial-${trialNum}.json`), JSON.stringify(data, null, 2));
}

function writeScenario(dir, name, content) {
  const scenariosDir = path.join(dir, 'evals', 'scenarios');
  fs.mkdirSync(scenariosDir, { recursive: true });
  const filePath = path.join(scenariosDir, `${name}.md`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

// Synthetic benchmark history: 10 graded trials across 2 scenarios
// scenario-a: 5 trials, each with 2 discovered claims (claim-X fails) + 1 weak assertion
// scenario-b: 5 trials, each with 1 discovered claim (claim-X fails) + same weak assertion
function buildSyntheticHistory(dir) {
  const runId = '20260420';

  // scenario-a: 5 trials
  for (let t = 1; t <= 5; t++) {
    writeGradingJson(dir, 'scenario-a', runId, t, {
      eval: 'scenario-a',
      trial: t,
      score: 0.5,
      passed: false,
      discovered_claims: [
        {
          text: 'claim-X: the output should include a summary',
          category: 'missing',
          passed: false,
          evidence: 'not found',
        },
        {
          text: 'claim-Y: the output should be JSON',
          category: 'format',
          passed: true,
          evidence: 'found',
        },
      ],
      weak_assertions: [{ assertion_id: 'A3', reason: 'too vague' }],
    });
  }

  // scenario-b: 5 trials
  for (let t = 1; t <= 5; t++) {
    writeGradingJson(dir, 'scenario-b', runId, t, {
      eval: 'scenario-b',
      trial: t,
      score: 0.3,
      passed: false,
      discovered_claims: [
        {
          text: 'claim-X: the output should include a summary',
          category: 'missing',
          passed: false,
          evidence: 'missing',
        },
      ],
      weak_assertions: [{ assertion_id: 'A3', reason: 'assertion is subjective' }],
    });
  }
}

// ── collectGradingData ───────────────────────────────────────────────────────

describe('collectGradingData', () => {
  test('returns empty arrays when no grading files exist', () => {
    const dir = makeTempDir();
    const { claimsEntries, weakEntries } = collectGradingData(dir);
    expect(claimsEntries).toHaveLength(0);
    expect(weakEntries).toHaveLength(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('collects discovered_claims and weak_assertions from all grading.json files', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);

    const { claimsEntries, weakEntries } = collectGradingData(dir);

    // 5 trials × 2 claims + 5 trials × 1 claim = 15 claim entries
    expect(claimsEntries.length).toBe(15);
    // 5 trials × 1 weak + 5 trials × 1 weak = 10 weak entries
    expect(weakEntries.length).toBe(10);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('each claim entry has text, passed, and scenario fields', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);

    const { claimsEntries } = collectGradingData(dir);

    for (const entry of claimsEntries) {
      expect(typeof entry.text).toBe('string');
      expect(typeof entry.passed).toBe('boolean');
      expect(typeof entry.scenario).toBe('string');
    }

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('each weak entry has assertion_id and scenario fields', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);

    const { weakEntries } = collectGradingData(dir);

    for (const entry of weakEntries) {
      expect(typeof entry.assertion_id).toBe('string');
      expect(typeof entry.scenario).toBe('string');
    }

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── buildPromotionCandidates ──────────────────────────────────────────────────

describe('buildPromotionCandidates', () => {
  test('returns sorted candidates by descending frequency × failure_rate', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);
    const { claimsEntries } = collectGradingData(dir);

    const candidates = buildPromotionCandidates(claimsEntries);

    expect(candidates.length).toBeGreaterThan(0);

    // Sorted: higher score first
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('claim-X appears with frequency 10 (5 from each scenario)', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);
    const { claimsEntries } = collectGradingData(dir);

    const candidates = buildPromotionCandidates(claimsEntries);

    const claimX = candidates.find((c) => c.text.includes('claim-X'));
    expect(claimX).toBeDefined();
    expect(claimX.frequency).toBe(10);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('each candidate has text, frequency, failure_rate, score, and scenarios fields', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);
    const { claimsEntries } = collectGradingData(dir);

    const candidates = buildPromotionCandidates(claimsEntries);

    for (const c of candidates) {
      expect(typeof c.text).toBe('string');
      expect(typeof c.frequency).toBe('number');
      expect(typeof c.failure_rate).toBe('number');
      expect(typeof c.score).toBe('number');
      expect(Array.isArray(c.scenarios)).toBe(true);
    }

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('score is frequency × failure_rate', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);
    const { claimsEntries } = collectGradingData(dir);

    const candidates = buildPromotionCandidates(claimsEntries);

    for (const c of candidates) {
      expect(c.score).toBeCloseTo(c.frequency * c.failure_rate, 5);
    }

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── buildRetirementCandidates ─────────────────────────────────────────────────

describe('buildRetirementCandidates', () => {
  test('returns candidates with A3 appearing 10 times across 2 scenarios', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);
    const { weakEntries } = collectGradingData(dir);

    const candidates = buildRetirementCandidates(weakEntries);

    expect(candidates.length).toBeGreaterThan(0);

    const a3 = candidates.find((c) => c.assertion_id === 'A3');
    expect(a3).toBeDefined();
    expect(a3.frequency).toBe(10);
    expect(a3.scenario_count).toBe(2);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('each candidate has assertion_id, frequency, scenario_count, and scenarios fields', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);
    const { weakEntries } = collectGradingData(dir);

    const candidates = buildRetirementCandidates(weakEntries);

    for (const c of candidates) {
      expect(typeof c.assertion_id).toBe('string');
      expect(typeof c.frequency).toBe('number');
      expect(typeof c.scenario_count).toBe('number');
      expect(Array.isArray(c.scenarios)).toBe(true);
    }

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('sorted by descending frequency', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);
    const { weakEntries } = collectGradingData(dir);

    const candidates = buildRetirementCandidates(weakEntries);

    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].frequency).toBeGreaterThanOrEqual(candidates[i].frequency);
    }

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── runAudit ──────────────────────────────────────────────────────────────────

describe('runAudit', () => {
  test('emits at least one promotion or retirement candidate given ≥10 graded trials', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);

    const result = runAudit(dir);

    const hasPromotion = result.promotionCandidates.length > 0;
    const hasRetirement = result.retirementCandidates.length > 0;
    expect(hasPromotion || hasRetirement).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('promotion candidates sorted by descending score', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);

    const result = runAudit(dir);

    const promo = result.promotionCandidates;
    for (let i = 1; i < promo.length; i++) {
      expect(promo[i - 1].score).toBeGreaterThanOrEqual(promo[i].score);
    }

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('result has promotionCandidates, retirementCandidates, trialCount', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);

    const result = runAudit(dir);

    expect(typeof result.trialCount).toBe('number');
    expect(result.trialCount).toBe(10);
    expect(Array.isArray(result.promotionCandidates)).toBe(true);
    expect(Array.isArray(result.retirementCandidates)).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('read-only: scenarios files unchanged after audit run', () => {
    const dir = makeTempDir();
    buildSyntheticHistory(dir);

    const scenarioContent =
      '# Eval: scenario-a\n\n## Context\ntest\n\n## Grader Config\ntest\n\n## Assertions\n- [ ] A1: does something\n';
    const scenarioPath = writeScenario(dir, 'scenario-a', scenarioContent);
    const beforeContent = fs.readFileSync(scenarioPath, 'utf8');
    const beforeMtime = fs.statSync(scenarioPath).mtimeMs;

    runAudit(dir);

    const afterContent = fs.readFileSync(scenarioPath, 'utf8');
    const afterMtime = fs.statSync(scenarioPath).mtimeMs;

    expect(afterContent).toBe(beforeContent);
    expect(afterMtime).toBe(beforeMtime);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('returns empty candidates when no grading history exists', () => {
    const dir = makeTempDir();

    const result = runAudit(dir);

    expect(result.promotionCandidates).toHaveLength(0);
    expect(result.retirementCandidates).toHaveLength(0);
    expect(result.trialCount).toBe(0);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
