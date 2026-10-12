/**
 * eval-scenario.js - Scenario parsing, discovery, and claim-type classification
 *
 * Parses eval scenario markdown into structured objects, lists/finds scenarios
 * under a project, and normalizes/infers evidence claim types. Also owns
 * SCENARIOS_DIR.
 *
 * Dependency direction is one-way: eval.js imports and re-exports the public
 * functions and SCENARIOS_DIR here; this module never imports from ./eval.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getTimestamp, sanitizeFilename } = require('./utils');
const { environmentLines } = require('./eval-trial-environment');

const EVALS_DIR = 'evals';
const SCENARIOS_DIR = path.join(EVALS_DIR, 'scenarios');

const CLAIM_TYPES = new Set([
  'non-regression',
  'discriminative-lift',
  'self-improvement-smoke',
  'infra',
]);

function normalizeClaimType(raw) {
  if (!raw) return undefined;
  const value = String(raw).trim().toLowerCase().replace(/_/g, '-');
  const aliases = {
    lift: 'discriminative-lift',
    discriminative: 'discriminative-lift',
    'self-improvement': 'self-improvement-smoke',
    smoke: 'self-improvement-smoke',
    'self-improvement/smoke': 'self-improvement-smoke',
    harness: 'infra',
    infrastructure: 'infra',
    'infra/harness': 'infra',
  };
  return aliases[value] || (CLAIM_TYPES.has(value) ? value : undefined);
}

function inferClaimType(scenario = {}) {
  const explicit = normalizeClaimType(scenario.claimType);
  if (explicit) return explicit;

  const identity = [scenario.name, scenario.target].filter(Boolean).join('\n').toLowerCase();

  if (identity.includes('self-improvement') || identity.includes('optional-learning')) {
    return 'self-improvement-smoke';
  }
  if (
    identity.includes('harness') ||
    identity.includes('plugin-dir') ||
    identity.includes('sessionstart') ||
    scenario.scope === 'agent'
  ) {
    return 'infra';
  }
  if (scenario.verdictPolicy === 'non-regression' || scenario.preflight === 'skip') {
    return 'non-regression';
  }
  if (scenario.scope === 'skill' || scenario.scope === 'workflow') {
    return 'discriminative-lift';
  }
  return 'infra';
}

/**
 * Extract compact YYYYMMDD date from an ISO timestamp.
 * Used as fallback directory name when runId is not provided.
 * @param {string} [isoTimestamp] - ISO timestamp (defaults to now)
 * @returns {string} Compact date (e.g., '20260320')
 */
function compactDate(isoTimestamp) {
  return (isoTimestamp || getTimestamp()).slice(0, 10).replace(/-/g, '');
}

/**
 * The condition suffixes an eval name may carry. Each names its own JSONL file
 * in a run directory, so rows under one are never read as another's: a reader
 * of `<name>-baseline` opens baseline.jsonl and nothing else.
 */
const CONDITION_SUFFIX = /-(baseline|treatment|preflight)$/;

/**
 * Why a scenario may not be called `name`, or null when it may. A name that
 * ends in a condition suffix is reserved: `release-preflight` run on its own
 * would be filed as the preflight condition of a scenario called `release`,
 * away from its own directory and unseen by its own readers.
 * @param {string} name - Scenario name
 * @returns {string|null}
 */
function reservedNameError(name) {
  const match = String(name).match(CONDITION_SUFFIX);
  if (!match) return null;
  return `Scenario name "${name}" ends in the reserved suffix "-${match[1]}": its results would be filed as the ${match[1]} condition of "${name.replace(CONDITION_SUFFIX, '')}". Rename the scenario (-baseline, -treatment and -preflight are reserved).`;
}

/**
 * Parse an eval name into scenario name and condition.
 * Used by appendResult, saveTranscript, and loadResults to derive storage paths.
 * @param {string} evalName - Eval name (may include a -baseline, -treatment or -preflight suffix)
 * @returns {{ scenarioName: string, condition: string }}
 */
function parseEvalName(evalName) {
  const match = evalName.match(CONDITION_SUFFIX);
  const condition = match ? match[1] : 'results';
  const scenarioName = sanitizeFilename(evalName.replace(CONDITION_SUFFIX, ''));
  return { scenarioName, condition };
}

/**
 * Resolve max-turns with priority: CLI > scenario > pluginDir default (10) > undefined.
 * @param {Object} opts
 * @param {number} [opts.maxTurns] - CLI-specified max turns
 * @param {number} [opts.scenarioMaxTurns] - Scenario ## Max Turns value
 * @param {string} [opts.pluginDir] - Plugin dir (triggers default of 10)
 * @returns {number|undefined} Resolved max turns, or undefined if none applies
 */
function resolveMaxTurns(opts = {}) {
  if (opts.maxTurns != null) return opts.maxTurns;
  if (opts.scenarioMaxTurns != null) return opts.scenarioMaxTurns;
  if (opts.pluginDir) return 10;
  return undefined;
}

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
 * Advance the open code fence past one line, by CommonMark's rule: a fence is
 * up to three spaces of indentation and then three or more backticks or tildes.
 * It closes only on a run of the same character at least as long, with nothing
 * after it; the info string after an opening fence is ignored.
 * @param {{ char: string, length: number }|null} fence - The open fence, if any
 * @param {string} line - The line to read
 * @returns {{ char: string, length: number }|null} The fence open after the line
 */
function fenceAfter(fence, line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) return fence;
  const [, run, rest] = match;
  if (fence) {
    const closes = run[0] === fence.char && run.length >= fence.length && !rest.trim();
    return closes ? null : fence;
  }
  // A backtick in the info string makes the line inline code, not a fence
  if (run[0] === '`' && rest.includes('`')) return null;
  return { char: run[0], length: run.length };
}

/**
 * Split a scenario file into its `## ` sections. A heading inside a code fence
 * or a heredoc is body text, not a heading. The parser and the linter both read
 * their sections from here, so they cannot disagree about where one starts.
 * @param {string} content - Scenario file content
 * @returns {Map<string, { startLine: number, lines: string[] }>} Keyed by the
 *   lower-cased heading; startLine is the heading's 1-based line, and a repeated
 *   heading replaces the earlier section
 */
function scenarioSections(content) {
  const sections = new Map();
  let currentSection = null;

  let fence = null;
  let heredocMarker = null;
  content.split('\n').forEach((line, index) => {
    // A heredoc body and a fenced block are both arbitrary text, so whichever
    // opened first runs to its own terminator: a fence line inside a heredoc
    // opens no fence, and a `<<EOF` inside a fence starts no heredoc.
    if (heredocMarker) {
      if (line.trim() === heredocMarker) heredocMarker = null;
    } else {
      fence = fenceAfter(fence, line);
      const heredocMatch = !fence && line.match(/<<-?\s*['"]?(\w+)['"]?\s*$/);
      if (heredocMatch) heredocMarker = heredocMatch[1];
    }

    const headerMatch = !fence && !heredocMarker && line.match(/^##\s+(.+)/);
    if (headerMatch) {
      currentSection = { startLine: index + 1, lines: [] };
      sections.set(headerMatch[1].trim().toLowerCase(), currentSection);
    } else if (currentSection) {
      currentSection.lines.push(line);
    }
  });
  return sections;
}

/**
 * Parse an eval scenario from a markdown file
 * @param {string} filePath - Path to scenario markdown file
 * @param {string} [projectRoot] - Project root for ${PROJECT_ROOT} expansion
 * @returns {EvalScenario} Parsed scenario
 */
function parseScenario(filePath, projectRoot) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sections = scenarioSections(content);
  const sectionLines = (key) => sections.get(key)?.lines || [];

  const nameMatch = content.match(/^#\s+Eval:\s*(.+)/m);
  const name = nameMatch ? nameMatch[1].trim() : path.basename(filePath, '.md');

  // Assertion bullets can be markdown checkboxes (`- [ ]` / `- [x]`) for text
  // assertions OR behavioral forms like `- [tool_called] Bash:cmd`. Strip ONLY
  // the markdown checkbox shell; leave behavioral `[tool_*]` prefixes intact so
  // downstream parseBehavioralAssertion can recognise them.
  const assertions = sectionLines('assertions')
    .filter((line) => line.match(/^-\s*\[[^\]]*\]/))
    .map((line) =>
      line
        .replace(/^-\s*\[[ xX]*\]\s*/, '')
        .replace(/^-\s+/, '')
        .trim(),
    );

  const section = (key) => sectionLines(key).join('\n').trim();
  const trialsRaw = section('trials');
  const trials = trialsRaw ? parseInt(trialsRaw, 10) : undefined;
  const version = section('version');
  const target = section('target');
  const preflight = section('preflight').toLowerCase();
  const verdictPolicy = section('verdict policy').toLowerCase();
  const claimType = normalizeClaimType(section('claim type'));

  // Plugin Dir: resolve ${PROJECT_ROOT} or use absolute path
  const pluginDirRaw = section('plugin dir');
  let pluginDir;
  if (pluginDirRaw) {
    pluginDir = projectRoot
      ? pluginDirRaw.replace(/\$\{PROJECT_ROOT\}/g, projectRoot)
      : pluginDirRaw;
  }

  // Environment: one declaration per line, kept as written (placeholders are
  // expanded per trial, and the row records the declaration itself)
  const environment = environmentLines(sectionLines('environment')).map(({ text }) => text);

  // Max Turns: parse as integer
  const maxTurnsRaw = section('max turns');
  const maxTurns = maxTurnsRaw ? parseInt(maxTurnsRaw, 10) : undefined;

  return {
    name,
    // Of the file as parsed: a run parses its scenario once, so every row of
    // the run is stamped with the hash of the text its trials were built from.
    scenarioHash: computeScenarioHash(content),
    scope: section('scope') || 'skill',
    scenario: section('scenario'),
    context: section('context'),
    assertions,
    grader: section('grader') || 'code',
    graderConfig: section('grader config'),
    setup: section('setup'),
    ...(target ? { target } : {}),
    ...(trials && !Number.isNaN(trials) ? { trials } : {}),
    ...(version ? { version } : {}),
    ...(preflight ? { preflight } : {}),
    ...(verdictPolicy ? { verdictPolicy } : {}),
    ...(claimType ? { claimType } : {}),
    ...(pluginDir ? { pluginDir } : {}),
    ...(environment.length > 0 ? { environment } : {}),
    ...(maxTurns && !Number.isNaN(maxTurns) ? { maxTurns } : {}),
  };
}

/**
 * List all eval scenarios
 * @param {string} projectRoot - Project root directory
 * @returns {string[]} List of scenario file paths
 */
function listScenarios(projectRoot) {
  const scenariosPath = path.join(projectRoot, SCENARIOS_DIR);
  if (!fs.existsSync(scenariosPath)) {
    return [];
  }
  return fs
    .readdirSync(scenariosPath)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(scenariosPath, f));
}

/**
 * Find a scenario by name
 * @param {string} name - Scenario name to find
 * @param {string} projectRoot - Project root directory
 * @returns {EvalScenario|undefined} Parsed scenario, or undefined if not found
 */
function findScenario(name, projectRoot) {
  for (const f of listScenarios(projectRoot)) {
    const s = parseScenario(f, projectRoot);
    if (s.name === name) return s;
  }
  return undefined;
}

module.exports = {
  SCENARIOS_DIR,
  normalizeClaimType,
  inferClaimType,
  compactDate,
  CONDITION_SUFFIX,
  reservedNameError,
  computeScenarioHash,
  parseEvalName,
  resolveMaxTurns,
  scenarioSections,
  parseScenario,
  listScenarios,
  findScenario,
};
