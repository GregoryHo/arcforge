/**
 * Tests for eval-preflight.js
 *
 * Covers:
 * - computeScenarioHash: sha256 of file contents, 16-char hex prefix
 * - runPreflight: writes evals/preflight/<hash>.json, returns PASS/BLOCK
 * - checkPreflightGate: guards arc eval ab from running without PASS preflight
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  computeScenarioHash,
  runPreflight,
  checkPreflightGate,
  PREFLIGHT_DIR,
} = require('../../scripts/lib/eval-preflight');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'test-preflight-'));
}

function writeScenario(dir, name, content) {
  const scenariosDir = path.join(dir, 'evals', 'scenarios');
  fs.mkdirSync(scenariosDir, { recursive: true });
  const filePath = path.join(scenariosDir, `${name}.md`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

function writePreflightFile(dir, hash, data) {
  const preflightDir = path.join(dir, PREFLIGHT_DIR);
  fs.mkdirSync(preflightDir, { recursive: true });
  fs.writeFileSync(path.join(preflightDir, `${hash}.json`), JSON.stringify(data));
}

const SCENARIO_CONTENT =
  '# Eval: test-scenario\n\n## Scope\nskill\n\n## Assertions\n- [ ] does something\n';

// ── computeScenarioHash ──────────────────────────────────────────────────────

describe('computeScenarioHash', () => {
  test('returns 16-char hex string', () => {
    const hash = computeScenarioHash(SCENARIO_CONTENT);
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  test('same content produces same hash', () => {
    expect(computeScenarioHash(SCENARIO_CONTENT)).toBe(computeScenarioHash(SCENARIO_CONTENT));
  });

  test('different content produces different hash', () => {
    const h1 = computeScenarioHash('content A');
    const h2 = computeScenarioHash('content B');
    expect(h1).not.toBe(h2);
  });
});

// ── PREFLIGHT_DIR ────────────────────────────────────────────────────────────

describe('PREFLIGHT_DIR', () => {
  test('is evals/preflight', () => {
    expect(PREFLIGHT_DIR).toBe(path.join('evals', 'preflight'));
  });
});

// ── runPreflight ─────────────────────────────────────────────────────────────

describe('runPreflight', () => {
  test('PASS: writes preflight file when pass_rate < 0.8', () => {
    const dir = makeTempDir();
    writeScenario(dir, 'my-scenario', SCENARIO_CONTENT);
    const hash = computeScenarioHash(SCENARIO_CONTENT);

    // Inject stub trial runner: 2/3 fail → pass_rate = 0.33
    const results = [
      { passed: false, score: 0 },
      { passed: false, score: 0 },
      { passed: true, score: 1.0 },
    ];
    let callIndex = 0;
    const stubRunTrial = () => results[callIndex++];
    const stubGrade = (result) => result;

    const outcome = runPreflight('my-scenario', dir, {
      runTrial: stubRunTrial,
      gradeResult: stubGrade,
    });

    expect(outcome.verdict).toBe('PASS');
    expect(outcome.pass_rate).toBeCloseTo(1 / 3, 5);
    expect(outcome.k).toBe(3);
    expect(outcome.scenario_name).toBe('my-scenario');
    expect(typeof outcome.scenario_hash).toBe('string');
    expect(outcome.scenario_hash).toBe(hash);

    // File must exist
    const filePath = path.join(dir, PREFLIGHT_DIR, `${hash}.json`);
    expect(fs.existsSync(filePath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(saved.verdict).toBe('PASS');
    expect(saved.scenario_hash).toBe(hash);
    expect(saved.scenario_name).toBe('my-scenario');
    expect(saved.k).toBe(3);
    expect(typeof saved.timestamp).toBe('string');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('BLOCK: writes preflight file when pass_rate >= 0.8', () => {
    const dir = makeTempDir();
    writeScenario(dir, 'easy-scenario', SCENARIO_CONTENT);

    // Inject stub: 3/3 pass → pass_rate = 1.0 → BLOCK
    const stubRunTrial = () => ({ passed: true, score: 1.0 });
    const stubGrade = (result) => result;

    const outcome = runPreflight('easy-scenario', dir, {
      runTrial: stubRunTrial,
      gradeResult: stubGrade,
    });

    expect(outcome.verdict).toBe('BLOCK');
    expect(outcome.pass_rate).toBeCloseTo(1.0, 5);

    const hash = computeScenarioHash(SCENARIO_CONTENT);
    const filePath = path.join(dir, PREFLIGHT_DIR, `${hash}.json`);
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(saved.verdict).toBe('BLOCK');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('verdict is only PASS or BLOCK, never SHIP/NEEDS_WORK/BLOCKED/INSUFFICIENT_DATA', () => {
    const dir = makeTempDir();
    writeScenario(dir, 'test', SCENARIO_CONTENT);

    const forbiddenVerdicts = [
      'SHIP',
      'NEEDS_WORK',
      'NEEDS WORK',
      'BLOCKED',
      'INSUFFICIENT_DATA',
      'IMPROVED',
      'INCONCLUSIVE',
      'REGRESSED',
    ];

    const stubRunTrial = () => ({ passed: false, score: 0 });
    const stubGrade = (result) => result;

    const outcome = runPreflight('test', dir, { runTrial: stubRunTrial, gradeResult: stubGrade });

    for (const forbidden of forbiddenVerdicts) {
      expect(outcome.verdict).not.toBe(forbidden);
    }
    expect(['PASS', 'BLOCK']).toContain(outcome.verdict);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('throws when scenario not found', () => {
    const dir = makeTempDir();
    expect(() => {
      runPreflight('nonexistent-scenario', dir, {
        runTrial: () => ({ passed: true, score: 1 }),
        gradeResult: (r) => r,
      });
    }).toThrow(/not found/i);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── checkPreflightGate ───────────────────────────────────────────────────────

describe('checkPreflightGate', () => {
  test('returns null (proceed) when PASS preflight exists with matching hash', () => {
    const dir = makeTempDir();
    writeScenario(dir, 'my-scenario', SCENARIO_CONTENT);
    const hash = computeScenarioHash(SCENARIO_CONTENT);
    writePreflightFile(dir, hash, {
      verdict: 'PASS',
      scenario_hash: hash,
      scenario_name: 'my-scenario',
      pass_rate: 0.33,
      k: 3,
      timestamp: new Date().toISOString(),
    });

    const result = checkPreflightGate('my-scenario', dir);
    expect(result).toBeNull();

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('returns error message when no preflight file exists', () => {
    const dir = makeTempDir();
    writeScenario(dir, 'my-scenario', SCENARIO_CONTENT);

    const result = checkPreflightGate('my-scenario', dir);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/preflight/i);
    expect(result).toMatch(/my-scenario/i);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('returns error message when preflight verdict is BLOCK', () => {
    const dir = makeTempDir();
    writeScenario(dir, 'my-scenario', SCENARIO_CONTENT);
    const hash = computeScenarioHash(SCENARIO_CONTENT);
    writePreflightFile(dir, hash, {
      verdict: 'BLOCK',
      scenario_hash: hash,
      scenario_name: 'my-scenario',
      pass_rate: 1.0,
      k: 3,
      timestamp: new Date().toISOString(),
    });

    const result = checkPreflightGate('my-scenario', dir);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/BLOCK/i);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('returns error message when scenario was edited after preflight (hash mismatch)', () => {
    const dir = makeTempDir();
    writeScenario(dir, 'my-scenario', SCENARIO_CONTENT);
    // Store preflight with a different hash (simulates scenario edited after preflight)
    const oldHash = 'abcdef0123456789'; // a made-up stale hash
    writePreflightFile(dir, oldHash, {
      verdict: 'PASS',
      scenario_hash: oldHash,
      scenario_name: 'my-scenario',
      pass_rate: 0.33,
      k: 3,
      timestamp: new Date().toISOString(),
    });

    const result = checkPreflightGate('my-scenario', dir);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/preflight/i);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('returns error message when scenario file does not exist', () => {
    const dir = makeTempDir();
    // No scenario written

    const result = checkPreflightGate('nonexistent', dir);
    expect(typeof result).toBe('string');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('resolves scenario by parsed "# Eval:" name even when filename differs', () => {
    // Regression (F7): preflight used to hardcode evals/scenarios/<name>.md
    // and would false-block scenarios whose filename has been renamed but
    // whose `# Eval:` header still matches.
    const dir = makeTempDir();
    const header_name = 'renamed-scenario';
    const file_stem = 'legacy-filename';
    const contents = `# Eval: ${header_name}\n\n## Scope\nskill\n\n## Assertions\n- [ ] ok\n`;
    writeScenario(dir, file_stem, contents);
    const hash = computeScenarioHash(contents);
    writePreflightFile(dir, hash, {
      verdict: 'PASS',
      scenario_hash: hash,
      scenario_name: header_name,
      pass_rate: 0.2,
      k: 3,
      timestamp: new Date().toISOString(),
    });

    const result = checkPreflightGate(header_name, dir);
    expect(result).toBeNull();

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('rejects preflight files with unknown verdict values', () => {
    // Regression (F8): the gate used to treat any verdict !== "BLOCK" as
    // cleared, so a corrupted record with verdict: "BLOCKED" / "MAYBE" /
    // missing field would silently bypass the gate.
    const dir = makeTempDir();
    writeScenario(dir, 'my-scenario', SCENARIO_CONTENT);
    const hash = computeScenarioHash(SCENARIO_CONTENT);
    writePreflightFile(dir, hash, {
      verdict: 'BLOCKED', // typo / stale value — neither PASS nor BLOCK
      scenario_hash: hash,
      scenario_name: 'my-scenario',
      pass_rate: 0.2,
      k: 3,
      timestamp: new Date().toISOString(),
    });

    const result = checkPreflightGate('my-scenario', dir);
    expect(typeof result).toBe('string');
    expect(result).toMatch(/unexpected verdict/i);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
