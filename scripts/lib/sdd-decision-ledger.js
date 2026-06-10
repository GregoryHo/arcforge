/**
 * sdd-decision-ledger.js — decision-ledger (decisions.yml) parsing and
 * append-only validation, the spec↔decision↔anchor graph audit, and the
 * loop sentinel helpers.
 *
 * Split from sdd-utils.js (decomposition per file-size limits). Callers
 * import via the sdd-utils.js facade.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseYamlSequence } = require('./yaml-parser');
const { parseSpecHeader } = require('./sdd-spec-header');

// ---------------------------------------------------------------------------
// getHeadLedgerContent — git helper for HEAD-relative ledger content.
// ---------------------------------------------------------------------------
// S3 seam: this is the ONLY function that shells out to git. validateDecisionLedger
// is a pure function that takes parsed content; this helper provides the "previous"
// snapshot for the caller to pass in.
//
// S4 edge-case contract (documented per implementation-plan §0.5 S4):
//   - In-repo, file tracked at HEAD → returns UTF-8 content string.
//   - In-repo, file NOT tracked at HEAD (new file) → returns null (all-new, pass).
//   - Not a git repo / git binary absent → returns null (advisory no-op;
//     zero-dep portability is preserved; enforcement is advisory in non-repo contexts).
//   - Detached HEAD / staged-but-uncommitted: git show HEAD:<path> reads committed
//     HEAD regardless of staged state. Same-session pre-commit append-then-edit
//     escapes the check (documented S8 limitation).
//
// @param {string} absPath - Absolute path to the decisions.yml file.
// @param {string} projectRoot - Project root for execFileSync cwd.
// @returns {string | null}

/**
 * Return the content of a file as it exists at HEAD, or null if absent/untracked/non-repo.
 *
 * Uses execFileSync with array args per security.md (no shell interpolation).
 * Models _runGit pattern from coordinator.js.
 *
 * @param {string} absPath - Absolute path to decisions.yml.
 * @param {string} projectRoot - Project root (cwd for git commands).
 * @returns {string | null}
 */
function getHeadLedgerContent(absPath, projectRoot) {
  // Compute the path relative to projectRoot for git show.
  const relPath = path.relative(projectRoot, absPath);
  try {
    return execFileSync('git', ['show', `HEAD:${relPath}`], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch {
    // File not in HEAD (new file), not a git repo, git absent, detached HEAD with no
    // tracked file, etc. — all map to null (advisory no-op).
    return null;
  }
}

// ---------------------------------------------------------------------------
// parseDecisionLedger — parse a decisions.yml file.
// ---------------------------------------------------------------------------

/**
 * Parse decisions.yml content (YAML root-level sequence) into an array of entries.
 *
 * S3 seam: this is the content-based form so the pipeline
 *   getHeadLedgerContent → parseDecisionLedgerContent → validateDecisionLedger
 * can be composed without touching the filesystem twice.
 *
 * @param {string} content - Raw YAML string.
 * @returns {Array<Object> | null} Array of entry objects, or null if empty/unparseable.
 */
function parseDecisionLedgerContent(content) {
  if (!content || !content.trim()) {
    return null;
  }
  try {
    const entries = parseYamlSequence(content);
    if (!Array.isArray(entries)) {
      return null;
    }
    return entries;
  } catch {
    return null;
  }
}

/**
 * Parse a decisions.yml file (YAML root-level sequence) into an array of entries.
 *
 * Thin wrapper over parseDecisionLedgerContent — reads the file then delegates.
 *
 * @param {string} filePath - Absolute path to decisions.yml.
 * @returns {Array<Object> | null} Array of entry objects, or null if file absent/unparseable.
 */
function parseDecisionLedger(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return parseDecisionLedgerContent(fs.readFileSync(filePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// validateDecisionLedger — pure function for append-only + immutability.
// ---------------------------------------------------------------------------
// S3: this function is PURE — no filesystem or git access. The caller provides
// both current parsed content and previous parsed content (from getHeadLedgerContent
// + parseDecisionLedger). This enables unit testing without git fixtures.
//
// Enforces:
//   (a) D-id monotonic and unique (non-increasing or duplicate = ERROR).
//   (b) Per-entry-by-D-id alignment: for each D-id in both HEAD and working tree,
//       decision and why text must be unchanged. (NOT whole-file diff — attack is
//       "append new entry while editing an old one".)
//   (c) Status transitions only via supersede: accepted→superseded-by:D-NNN requires
//       a matching new entry with supersedes field pointing back to this D-id.
//
// S4 known limitation (S8 — documented): immutability is HEAD-relative. Same-session
// pre-commit append-then-edit escapes the check. A legit typo in frozen text has no
// in-place edit path: record a correcting supersede, or amend the commit.
//
// Required fields per DECISION_LEDGER_RULES:
//   D-id, date, spec_version, status, decision, why, authorized_values.

const REQUIRED_LEDGER_FIELDS = [
  'D-id',
  'date',
  'spec_version',
  'status',
  'decision',
  'why',
  'authorized_values',
];

/**
 * Validate a parsed decision ledger for append-only integrity.
 *
 * @param {Array<Object>} current - Current ledger entries (from parseDecisionLedger).
 * @param {Array<Object> | null} previous - Entries from HEAD (null if new file / non-repo).
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateDecisionLedger(current, previous) {
  const errors = [];

  if (!Array.isArray(current)) {
    return { valid: false, errors: ['validateDecisionLedger: current must be an array.'] };
  }

  // (a) D-id monotonicity and uniqueness.
  const seenIds = new Set();
  let lastNum = 0;
  for (const entry of current) {
    // Required fields check.
    for (const field of REQUIRED_LEDGER_FIELDS) {
      if (entry[field] === null || entry[field] === undefined) {
        errors.push(
          `Entry missing required field "${field}"${entry['D-id'] ? ` (D-id: ${entry['D-id']})` : ''}.`,
        );
      }
    }

    const did = entry['D-id'];
    if (typeof did !== 'string') continue;

    // Parse numeric part of D-NNN.
    const match = did.match(/^D-(\d+)$/);
    if (!match) {
      errors.push(`D-id "${did}" does not match expected format D-NNN (e.g. D-001).`);
      continue;
    }
    const num = parseInt(match[1], 10);

    if (seenIds.has(did)) {
      errors.push(`Duplicate D-id "${did}" in ledger — D-ids must be unique.`);
    } else if (num <= lastNum) {
      errors.push(
        `D-id "${did}" (${num}) is not monotonically increasing after previous D-id (${lastNum}) — entries must appear in ascending order.`,
      );
    }
    seenIds.add(did);
    lastNum = Math.max(lastNum, num);
  }

  // (b) Per-D-id immutability check against previous.
  if (previous !== null && Array.isArray(previous)) {
    const prevMap = new Map();
    for (const entry of previous) {
      const did = entry['D-id'];
      if (did) prevMap.set(String(did), entry);
    }

    for (const entry of current) {
      const did = entry['D-id'];
      if (!did) continue;
      const prev = prevMap.get(String(did));
      if (!prev) continue; // new entry — fine

      // decision text immutability.
      if (String(entry.decision || '') !== String(prev.decision || '')) {
        errors.push(
          `Immutability violation: D-id "${did}" decision text was edited. ` +
            `Frozen text cannot be changed in-place; record a correcting supersede instead.`,
        );
      }
      // why text immutability.
      if (String(entry.why || '') !== String(prev.why || '')) {
        errors.push(
          `Immutability violation: D-id "${did}" why text was edited. ` +
            `Frozen text cannot be changed in-place; record a correcting supersede instead.`,
        );
      }
    }
  }

  // (c) Status transitions only via supersede.
  if (previous !== null && Array.isArray(previous)) {
    const prevMap = new Map();
    for (const entry of previous) {
      const did = entry['D-id'];
      if (did) prevMap.set(String(did), entry);
    }

    // Build a set of D-ids that have a new superseding entry.
    const supersedingFor = new Set();
    for (const entry of current) {
      if (entry.supersedes) {
        supersedingFor.add(String(entry.supersedes));
      }
    }

    for (const entry of current) {
      const did = entry['D-id'];
      if (!did) continue;
      const prev = prevMap.get(String(did));
      if (!prev) continue; // new entry — status transitions not applicable

      const prevStatus = String(prev.status || '');
      const currStatus = String(entry.status || '');

      if (prevStatus !== currStatus && currStatus.startsWith('superseded-by:')) {
        // Transition to superseded-by requires a new entry with supersedes: this D-id.
        if (!supersedingFor.has(String(did))) {
          errors.push(
            `D-id "${did}" status changed to "${currStatus}" but no new entry with supersedes: "${did}" was found. ` +
              `Status transitions must be accompanied by a superseding entry.`,
          );
        }
      } else if (prevStatus !== currStatus) {
        // Other status transitions (e.g. proposed→accepted outside of ratify) are
        // permitted in validateDecisionLedger itself (ratify enforcement is in the
        // ratify CLI + hook layer). We only enforce the supersede-path rule here.
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// checkSpecDecisionGraph — D6 P2 graph audit (S10: single shared helper).
// ---------------------------------------------------------------------------
// Pure function. No-op semantics: absent inputs skip their checks (valid:true).
// B3 constraint: no git-based checks — structural delegation uses null previous.
// Drift guard (S10): the read-only advisory mirror of checks (a)/(b)/(c) lives as
// patterns 7/8/9 in agents/arc-auditing-spec-cross-artifact-alignment.md — keep
// the two in sync when editing either.

/**
 * Audit the spec↔decision↔anchor graph for three categories of issues:
 *
 * (a) Every <added>/<modified> delta item carrying decision="D-NNN" must have
 *     D-NNN present in the ledger. Missing D-ids are broken links.
 *
 * (b) Every ledger entry's principle_ref (when present) must resolve to a P-n
 *     identifier present in productVision.principles. Absent productVision
 *     skips this check.
 *
 * (c) Structural ledger validation via validateDecisionLedger(ledger, null).
 *     Passing null as previous skips git-based immutability checks (B3).
 *
 * @param {{ specXmlContent: string|null, ledger: Array<Object>|null,
 *            productVision: { principles: string[] }|null,
 *            specVision: unknown }} options
 * @returns {{ valid: boolean, errors: string[] }}
 */
function checkSpecDecisionGraph({ specXmlContent, ledger, productVision }) {
  // No-op: absent ledger means nothing to check.
  if (!Array.isArray(ledger)) {
    return { valid: true, errors: [] };
  }

  const errors = [];

  // Build a Set of known D-ids from the ledger for O(1) lookup.
  const ledgerDids = new Set();
  for (const entry of ledger) {
    const did = entry['D-id'];
    if (typeof did === 'string' && did) ledgerDids.add(did);
  }

  // (a) Delta decision links → D-id must exist in ledger.
  if (specXmlContent) {
    const parsed = parseSpecHeader(specXmlContent);
    if (parsed) {
      for (const delta of parsed.deltas) {
        for (const item of [...delta.added, ...delta.modified]) {
          if (item.decision && !ledgerDids.has(item.decision)) {
            errors.push(
              `Delta item ref="${item.ref}" references decision="${item.decision}" but ${item.decision} is not in the decision ledger.`,
            );
          }
        }
      }
    }
  }

  // (b) principle_ref in ledger entries → must resolve to P-n in productVision.
  if (productVision && Array.isArray(productVision.principles)) {
    const principleSet = new Set(productVision.principles);
    for (const entry of ledger) {
      const ref = entry.principle_ref;
      if (ref && !principleSet.has(ref)) {
        errors.push(
          `Ledger entry ${entry['D-id'] || '(unknown)'} has principle_ref="${ref}" but ${ref} is not in product/vision.md.`,
        );
      }
    }
  }

  // (c) Structural ledger validation — null previous skips git immutability (B3).
  const structuralResult = validateDecisionLedger(ledger, null);
  for (const err of structuralResult.errors) {
    errors.push(err);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// B1 loop sentinel — canonical location (scripts/loop.js LOOP_STATE_FILE is the owner).
// Imported by ratify-command.js and hooks/sdd-ratify-guard to avoid duplication.
// ---------------------------------------------------------------------------

/** File name of the loop sentinel placed at project root by scripts/loop.js. */
const LOOP_SENTINEL = '.arcforge-loop.json';

/**
 * Returns true if the loop sentinel exists at projectRoot.
 * Fail-closed: returns false on any I/O error.
 * @param {string} projectRoot
 * @returns {boolean}
 */
function loopSentinelPresent(projectRoot) {
  try {
    return fs.existsSync(path.join(projectRoot, LOOP_SENTINEL));
  } catch {
    return false;
  }
}

module.exports = {
  getHeadLedgerContent,
  parseDecisionLedgerContent,
  parseDecisionLedger,
  validateDecisionLedger,
  checkSpecDecisionGraph,
  LOOP_SENTINEL,
  loopSentinelPresent,
};
