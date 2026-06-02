/**
 * eval-scenario.js - Scenario parsing, discovery, and claim-type classification
 *
 * Extracted from eval.js to maintain file size limits. Parses eval scenario
 * markdown into structured objects, lists/finds scenarios under a project, and
 * normalizes/infers evidence claim types. Also owns SCENARIOS_DIR.
 *
 * Dependency direction is one-way: eval.js imports and re-exports the public
 * functions and SCENARIOS_DIR here; this module never imports from ./eval.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');
const { getTimestamp, sanitizeFilename } = require('./utils');

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
 * Parse an eval name into scenario name and condition.
 * Used by appendResult, saveTranscript, and loadResults to derive storage paths.
 * @param {string} evalName - Eval name (may include -baseline or -treatment suffix)
 * @returns {{ scenarioName: string, condition: string }}
 */
function parseEvalName(evalName) {
  const isBaseline = evalName.endsWith('-baseline');
  const isTreatment = evalName.endsWith('-treatment');
  const condition = isBaseline ? 'baseline' : isTreatment ? 'treatment' : 'results';
  const scenarioName = sanitizeFilename(evalName.replace(/-(baseline|treatment)$/, ''));
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
 * Parse an eval scenario from a markdown file
 * @param {string} filePath - Path to scenario markdown file
 * @param {string} [projectRoot] - Project root for ${PROJECT_ROOT} expansion
 * @returns {EvalScenario} Parsed scenario
 */
function parseScenario(filePath, projectRoot) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sections = {};
  let currentSection = null;
  const lines = content.split('\n');

  let insideFence = false;
  let heredocMarker = null;
  for (const line of lines) {
    if (/^`{3,}/.test(line)) insideFence = !insideFence;

    // Ignore ## headers inside heredocs (they contain arbitrary text)
    if (!insideFence && !heredocMarker) {
      const heredocMatch = line.match(/<<-?\s*['"]?(\w+)['"]?\s*$/);
      if (heredocMatch) heredocMarker = heredocMatch[1];
    } else if (heredocMarker && line.trim() === heredocMarker) {
      heredocMarker = null;
    }

    const headerMatch = !insideFence && !heredocMarker && line.match(/^##\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim().toLowerCase();
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  const nameMatch = content.match(/^#\s+Eval:\s*(.+)/m);
  const name = nameMatch ? nameMatch[1].trim() : path.basename(filePath, '.md');

  // Assertion bullets can be markdown checkboxes (`- [ ]` / `- [x]`) for text
  // assertions OR behavioral forms like `- [tool_called] Bash:cmd`. Strip ONLY
  // the markdown checkbox shell; leave behavioral `[tool_*]` prefixes intact so
  // downstream parseBehavioralAssertion can recognise them. An earlier strip
  // pattern `[ x\w_]*` was greedy enough to eat `tool_called` too, which caused
  // behavioral assertions to be silently reclassified as text and routed to the
  // model grader.
  const assertions = (sections.assertions || [])
    .filter((line) => line.match(/^-\s*\[[^\]]*\]/))
    .map((line) =>
      line
        .replace(/^-\s*\[[ xX]*\]\s*/, '')
        .replace(/^-\s+/, '')
        .trim(),
    );

  const section = (key) => (sections[key] || []).join('\n').trim();
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

  // Max Turns: parse as integer
  const maxTurnsRaw = section('max turns');
  const maxTurns = maxTurnsRaw ? parseInt(maxTurnsRaw, 10) : undefined;

  return {
    name,
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
  parseEvalName,
  resolveMaxTurns,
  parseScenario,
  listScenarios,
  findScenario,
};
