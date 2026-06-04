/**
 * eval-grader-io.js - Shared I/O and parsing infrastructure for eval graders
 *
 * Leaf module: domain-neutral plumbing used by 2+ grader type modules and/or
 * the dispatcher. Imports nothing from sibling grader modules (acyclic root).
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');
const { sanitizeFilename } = require('./utils');
const { round2 } = require('./eval-stats');

// Mirror of eval.js constants to avoid circular imports
const GRADING_RESULTS_DIR = path.join('evals', 'results');

// Cache agent definitions to avoid repeated disk reads during batch grading.
// Key: absolute path, Value: file content with frontmatter stripped (empty string if missing).
const agentDefCache = new Map();

/**
 * Load an agent definition file, caching the result to avoid repeated disk reads.
 * Strips YAML frontmatter if present. Returns empty string if file does not exist.
 * @param {string} agentPath - Absolute path to the agent markdown file
 * @returns {string} Agent definition content (cached)
 */
function loadAgentDef(agentPath) {
  if (agentDefCache.has(agentPath)) return agentDefCache.get(agentPath);
  let content = '';
  try {
    content = fs.readFileSync(agentPath, 'utf8').replace(/^---[\s\S]*?---\n*/m, '');
  } catch {
    /* file missing — return empty string */
  }
  agentDefCache.set(agentPath, content);
  return content;
}

/**
 * Strip markdown code fences from text before JSON extraction.
 * @param {string} text - Text potentially containing ```json ... ``` fences
 * @returns {string} Text with fences removed
 */
function stripCodeFences(text) {
  return text.replace(/```(?:json)?\s*\n?/g, '');
}

/**
 * Extract the first parseable JSON object from text, honoring braces inside strings.
 * Optionally requires specific top-level keys to be present.
 * @param {string} text - Raw model output
 * @param {string[]} [requiredKeys=[]] - Required top-level keys
 * @returns {Object|null} Parsed JSON object, or null if none found
 */
function extractJsonObject(text, requiredKeys = []) {
  const cleaned = stripCodeFences(text || '').trim();
  if (!cleaned) return null;

  const hasRequiredKeys = (value) =>
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    requiredKeys.every((key) => Object.hasOwn(value, key));

  try {
    const parsed = JSON.parse(cleaned);
    if (hasRequiredKeys(parsed)) return parsed;
  } catch {
    /* fall through to balanced-brace extraction */
  }

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }

    if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (hasRequiredKeys(parsed)) return parsed;
        } catch {
          /* keep scanning for another object */
        }
        start = -1;
      }
    }
  }

  return null;
}

function buildModelGraderError(result, error, errorType) {
  return {
    ...result,
    passed: false,
    score: 0,
    error,
    gradeError: true,
    errorType,
  };
}

/**
 * Snap a score to the nearest 5-tier value: 0, 0.25, 0.5, 0.75, or 1.0.
 * Thresholds are midpoints between tiers.
 * @param {number} score - Raw score from grader
 * @returns {number} Snapped score
 */
function snapScore(score) {
  const clamped = Math.max(0, Math.min(1, score));
  if (clamped <= 0.125) return 0;
  if (clamped <= 0.375) return 0.25;
  if (clamped <= 0.625) return 0.5;
  if (clamped <= 0.875) return 0.75;
  return 1.0;
}

/**
 * Validate and normalize a grader JSON response.
 * Snaps scores to 5-tier scale, recomputes overall and passed from snapped scores.
 * Returns null if scores array is missing or empty (triggers retry).
 * @param {Object} grade - Parsed JSON from grader: { scores, overall, passed }
 * @param {number} assertionCount - Expected number of assertions
 * @returns {{ scores: number[], overall: number, passed: boolean }|null}
 */
function validateGraderResponse(grade, assertionCount) {
  if (!Array.isArray(grade.scores) || grade.scores.length === 0) return null;

  if (grade.scores.length !== assertionCount && assertionCount > 0) {
    process.stderr.write(
      `Warning: grader returned ${grade.scores.length} scores for ${assertionCount} assertions\n`,
    );
  }

  const scores = grade.scores.map((s) => snapScore(typeof s === 'number' ? s : 0));
  const overall = round2(scores.reduce((a, b) => a + b, 0) / scores.length);
  const passed = scores.every((s) => s === 1.0);

  return { scores, overall, passed };
}

/**
 * Capture file artifacts from a trial directory for grader context.
 * Reads non-hidden, non-infrastructure files up to size/count limits.
 * @param {string} [trialDir] - Path to trial directory
 * @param {Object} [opts] - Options
 * @param {number} [opts.maxFiles=10] - Maximum files to capture
 * @param {number} [opts.maxFileSize=10000] - Maximum bytes per file
 * @returns {string} Formatted artifact text, or empty string
 */
function captureTrialArtifacts(trialDir, opts = {}) {
  const { maxFiles = 10, maxFileSize = 10000 } = opts;
  if (!trialDir || !fs.existsSync(trialDir)) return '';

  const artifacts = [];
  const entries = [];

  function walk(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel);
      } else if (entry.isFile()) {
        entries.push(rel);
      }
    }
  }

  walk(trialDir, '');

  for (const rel of entries.slice(0, maxFiles)) {
    const filePath = path.join(trialDir, rel);
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > maxFileSize) {
        artifacts.push(`### ${rel}\n(${stat.size} bytes — too large to include)`);
      } else {
        const content = fs.readFileSync(filePath, 'utf8');
        artifacts.push(`### ${rel}\n\`\`\`\n${content}\n\`\`\``);
      }
    } catch {
      /* skip unreadable files */
    }
  }

  if (entries.length > maxFiles) {
    artifacts.push(`(${entries.length - maxFiles} more files not shown)`);
  }

  return artifacts.length > 0
    ? `\n\n## Trial Directory Artifacts\n\n${artifacts.join('\n\n')}`
    : '';
}

/**
 * Split transcript output into numbered blocks for grader reference.
 * Blocks are delimited by [Tool: X] and [Assistant] markers.
 * @param {string} output - Raw transcript text
 * @returns {{ numbered: string, blockCount: number }}
 */
function splitTranscriptBlocks(text) {
  if (!text) return [];
  return text.split(/(?=^\[(?:Tool:|Assistant))/m).filter((b) => b.trim());
}

function numberTranscriptBlocks(output) {
  if (!output) return { numbered: '(no output)', blockCount: 0 };
  const blocks = splitTranscriptBlocks(output);
  if (blocks.length === 0) return { numbered: output, blockCount: 0 };
  const numbered = blocks.map((b, i) => `[Block ${i + 1}]\n${b.trim()}`).join('\n\n');
  return { numbered, blockCount: blocks.length };
}

/**
 * Compute the path to grading.json for a specific trial result.
 * @param {import('./eval').TrialResult} result - Trial result
 * @param {string} projectRoot - Project root directory
 * @returns {string} Absolute path to grading.json
 */
function getGradingPath(result, projectRoot) {
  const evalName = result.eval || '';
  // Mirror eval.js parseEvalName exactly so grading.json lands under the
  // same scenario directory as the run JSONL. Diverging here (e.g. via an
  // ad-hoc /[^a-zA-Z0-9-]/ replacement) splits grading artifacts from
  // their run for any scenario containing characters like `_`.
  const stripped = evalName.replace(/-(baseline|treatment)$/, '');
  const scenarioName = stripped ? sanitizeFilename(stripped) : '';
  const runId =
    result.runId ||
    (result.timestamp ? result.timestamp.slice(0, 10).replace(/-/g, '') : 'unknown');
  return path.join(
    projectRoot,
    GRADING_RESULTS_DIR,
    scenarioName,
    runId,
    'grading',
    `trial-${result.trial}.json`,
  );
}

/** Required keys for discovered_claims entries */
const CLAIM_REQUIRED_KEYS = ['text', 'category', 'passed', 'evidence'];

/** Required keys for weak_assertions entries */
const WEAK_ASSERTION_REQUIRED_KEYS = ['assertion_id', 'reason'];

/**
 * Validate an array of claim/assertion entries, warning on missing required keys.
 * Never crashes — returns the original array (possibly with invalid entries).
 * @param {any[]} entries - Array of objects from grader response
 * @param {string[]} requiredKeys - Keys each entry must have
 * @param {string} fieldName - Field name for warning messages
 * @returns {Object[]} Entries that are valid objects (non-objects filtered out)
 */
function validateGraderEntries(entries, requiredKeys, fieldName) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const missing = requiredKeys.filter((k) => !Object.hasOwn(entry, k));
    if (missing.length > 0) {
      process.stderr.write(`Warning: ${fieldName} entry missing keys: ${missing.join(', ')}\n`);
    }
    return true; // include even if keys missing — just warn
  });
}

/**
 * Write grading.json for a model-graded trial.
 * Contains discovered_claims and weak_assertions from the grader response.
 * Also records trial identity and score for traceability.
 * @param {import('./eval').TrialResult} result - Trial result (before grading)
 * @param {Object} gradeData - Grader response data
 * @param {Object} validated - Validated scores from validateGraderResponse
 * @param {string} projectRoot - Project root directory
 */
function writeGradingJson(result, gradeData, validated, projectRoot) {
  try {
    const gradingPath = getGradingPath(result, projectRoot);
    fs.mkdirSync(path.dirname(gradingPath), { recursive: true });
    const rawClaims = validateGraderEntries(
      gradeData.discovered_claims,
      CLAIM_REQUIRED_KEYS,
      'discovered_claims',
    );
    const rawWeak = validateGraderEntries(
      gradeData.weak_assertions,
      WEAK_ASSERTION_REQUIRED_KEYS,
      'weak_assertions',
    );
    const grading = {
      eval: result.eval,
      trial: result.trial,
      score: validated.overall,
      passed: validated.passed,
      discovered_claims: rawClaims,
      weak_assertions: rawWeak,
    };
    fs.writeFileSync(gradingPath, JSON.stringify(grading, null, 2));
  } catch {
    /* grading.json write failure must never crash a trial */
  }
}

module.exports = {
  GRADING_RESULTS_DIR,
  CLAIM_REQUIRED_KEYS,
  WEAK_ASSERTION_REQUIRED_KEYS,
  loadAgentDef,
  stripCodeFences,
  extractJsonObject,
  buildModelGraderError,
  snapScore,
  validateGraderResponse,
  captureTrialArtifacts,
  splitTranscriptBlocks,
  numberTranscriptBlocks,
  getGradingPath,
  validateGraderEntries,
  writeGradingJson,
};
