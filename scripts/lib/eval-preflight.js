/**
 * eval-preflight.js - Preflight gate for A/B eval runs
 *
 * Before running arc eval ab, a preflight must confirm the scenario is
 * discriminative (baseline pass rate < 0.8). If the baseline already passes
 * >= 80% of trials without any skill, the scenario has a ceiling effect and
 * cannot reliably distinguish a good skill from a bad one.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { listScenarios, parseScenario } = require('./eval');

/** Directory where preflight JSON files are stored */
const PREFLIGHT_DIR = path.join('evals', 'preflight');

/** Threshold above which baseline pass rate signals a ceiling (not discriminative) */
const CEILING_THRESHOLD = 0.8;

/** Number of baseline trials to run during preflight */
const PREFLIGHT_K = 3;

/**
 * Compute a stable scenario hash from file contents.
 * Returns the first 16 hex characters of the SHA-256 digest.
 * @param {string} contents - Raw scenario file contents
 * @returns {string} 16-char lowercase hex prefix
 */
function computeScenarioHash(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex').slice(0, 16);
}

/**
 * Resolve the scenario file path by parsed `# Eval:` name (matching
 * findScenario / `arc eval run` / `arc eval ab` semantics), with fallback
 * to literal filename lookup. Returns null if no scenario matches either.
 *
 * Resolving by parsed name (not filename) prevents preflight from falsely
 * blocking scenarios whose filename has been renamed but whose `# Eval:`
 * header still matches the requested name — the same lookup semantics
 * used elsewhere in the eval CLI.
 *
 * @param {string} name - Scenario name (parsed `# Eval:` value, or filename stem)
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} Absolute path to scenario file, or null
 */
function resolveScenarioFile(name, projectRoot) {
  for (const f of listScenarios(projectRoot)) {
    const s = parseScenario(f, projectRoot);
    if (s.name === name) return f;
  }
  // Fallback: legacy filename-based lookup, kept so preflighting a
  // scenario by filename stem still works when the `# Eval:` header
  // hasn't been authored yet.
  const filePath = path.join(projectRoot, 'evals', 'scenarios', `${name}.md`);
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * Run a preflight for a named scenario.
 *
 * Executes PREFLIGHT_K baseline trials (no skill injection) and computes the
 * pass rate. Writes evals/preflight/<hash>.json with the result.
 *
 * Verdicts:
 *   PASS  — pass_rate < CEILING_THRESHOLD (scenario is discriminative)
 *   BLOCK — pass_rate >= CEILING_THRESHOLD (ceiling effect, not discriminative)
 *
 * NOTE: verdictFromDeltaCI / eval-stats verdicts (SHIP, NEEDS_WORK, etc.) are
 * intentionally NOT used here. Preflight only emits PASS or BLOCK.
 *
 * @param {string} name - Scenario name
 * @param {string} projectRoot - Project root directory
 * @param {Object} opts - Dependency injection for testing
 * @param {Function} opts.runTrial - Function to run a single trial
 * @param {Function} opts.gradeResult - Function to grade a trial result
 * @returns {{ scenario_hash: string, scenario_name: string, pass_rate: number, k: number, verdict: 'PASS'|'BLOCK', reason: string, timestamp: string }}
 */
function runPreflight(name, projectRoot, opts = {}) {
  const { runTrial, gradeResult } = opts;

  const filePath = resolveScenarioFile(name, projectRoot);
  if (!filePath) {
    throw new Error(`Scenario "${name}" not found in evals/scenarios/`);
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  const hash = computeScenarioHash(contents);

  const results = [];
  for (let t = 1; t <= PREFLIGHT_K; t++) {
    const raw = runTrial(t, PREFLIGHT_K);
    const graded = gradeResult(raw, t);
    results.push(graded);
  }

  const passed = results.filter((r) => r.passed).length;
  const pass_rate = results.length > 0 ? passed / results.length : 0;

  const verdict = pass_rate >= CEILING_THRESHOLD ? 'BLOCK' : 'PASS';
  const reason =
    verdict === 'BLOCK'
      ? `Baseline pass rate ${(pass_rate * 100).toFixed(0)}% >= ${CEILING_THRESHOLD * 100}% ceiling — scenario is not discriminative. Redesign the scenario to be harder.`
      : `Baseline pass rate ${(pass_rate * 100).toFixed(0)}% < ${CEILING_THRESHOLD * 100}% — scenario is discriminative. Proceed with arc eval ab.`;

  const record = {
    scenario_hash: hash,
    scenario_name: name,
    pass_rate,
    k: PREFLIGHT_K,
    verdict,
    reason,
    timestamp: new Date().toISOString(),
  };

  const preflightDir = path.join(projectRoot, PREFLIGHT_DIR);
  fs.mkdirSync(preflightDir, { recursive: true });
  fs.writeFileSync(path.join(preflightDir, `${hash}.json`), JSON.stringify(record, null, 2));

  return record;
}

/**
 * Check the preflight gate before running arc eval ab.
 *
 * Rules:
 * 1. Compute current scenario hash.
 * 2. Look up evals/preflight/<hash>.json.
 * 3. If missing → return error (run preflight first).
 * 4. If found but verdict == BLOCK → return error (ceiling, redesign scenario).
 * 5. If found and verdict == PASS → return null (proceed).
 *
 * The hash check implicitly enforces re-preflight when the scenario file is
 * edited: the new hash will not match any existing preflight file.
 *
 * @param {string} name - Scenario name
 * @param {string} projectRoot - Project root directory
 * @returns {null|string} null if cleared to proceed; error message string if blocked
 */
function checkPreflightGate(name, projectRoot) {
  const filePath = resolveScenarioFile(name, projectRoot);
  if (!filePath) {
    return `Scenario "${name}" not found in evals/scenarios/. Cannot check preflight gate.`;
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  const hash = computeScenarioHash(contents);

  const preflightFile = path.join(projectRoot, PREFLIGHT_DIR, `${hash}.json`);
  if (!fs.existsSync(preflightFile)) {
    return (
      `No preflight record found for scenario "${name}" (hash: ${hash}).\n` +
      `Run: arc eval preflight ${name}\n` +
      `Preflight ensures the baseline pass rate is below the ceiling threshold before A/B testing.`
    );
  }

  let record;
  try {
    record = JSON.parse(fs.readFileSync(preflightFile, 'utf8'));
  } catch {
    return `Preflight file for "${name}" is corrupt. ` + `Run: arc eval preflight ${name}`;
  }

  if (record.verdict === 'BLOCK') {
    return (
      `Preflight BLOCK for scenario "${name}": ${record.reason}\n` +
      `Redesign the scenario to reduce the baseline pass rate below ${CEILING_THRESHOLD * 100}%, ` +
      `then re-run: arc eval preflight ${name}`
    );
  }

  // The gate must affirmatively see verdict === 'PASS'. Treating "anything
  // not BLOCK" as cleared would let a corrupted or hand-edited preflight
  // file (e.g. verdict: "BLOCKED" typo, "MAYBE", missing field) bypass the
  // gate silently. Fail closed instead.
  if (record.verdict !== 'PASS') {
    return (
      `Preflight record for "${name}" has unexpected verdict "${record.verdict}". ` +
      `Re-run: arc eval preflight ${name}`
    );
  }

  return null;
}

module.exports = {
  computeScenarioHash,
  runPreflight,
  checkPreflightGate,
  PREFLIGHT_DIR,
  CEILING_THRESHOLD,
  PREFLIGHT_K,
};
