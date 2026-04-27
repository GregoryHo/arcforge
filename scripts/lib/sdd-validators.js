/**
 * sdd-validators.js — Parser/validator API for fr-sd-014 + writer for fr-rf-015.
 *
 * Exports parseConflictMarker, parseDecisionLog, validateDecisionLog,
 * mechanicalAuthorizationCheck, and writeConflictMarker.
 *
 * fr-sd-014: parseConflictMarker, parseDecisionLog, validateDecisionLog,
 *   mechanicalAuthorizationCheck — parsers + validators required by fr-sd-014-ac1
 *   through fr-sd-014-ac3.
 * fr-rf-015: writeConflictMarker — writer called by refiner on R3 axis-1/2/3 block.
 *
 * All functions reference PENDING_CONFLICT_RULES / DECISION_LOG_RULES as their schema
 * source of truth — no field names are duplicated as local literals (fr-sd-014-ac4).
 *
 * Wire format for both _pending-conflict.md and decision-log files: YAML.
 * This matches arcforge's "all state as YAML, JSON, JSONL, or Markdown"
 * convention. The parse() function from yaml-parser.js handles both.
 */

const path = require('node:path');
const { parse } = require('./yaml-parser');
const { readFileSafe, atomicWriteFile } = require('./utils');
const { PENDING_CONFLICT_RULES, DECISION_LOG_RULES } = require('./sdd-rules');

// Hoisted regexes — kept at module scope so they aren't reallocated on every
// call inside per-trace loops in mechanicalAuthorizationCheck.
const TRACE_TOKEN_RE =
  /<requirement\s+id="([^"]*)"|<criterion\s+id="([^"]*)"|<trace>([^<]*)<\/trace>/g;
const TRACE_LEGACY_RE = /^REQ-[A-Z]\d+/;
const TRACE_DESIGN_RE = /^(\d{4}-\d{2}-\d{2}):(.+)$/;
const TRACE_QA_RE = /^([a-zA-Z][a-zA-Z0-9_-]*):(.+)$/;
// YAML scalar quoting predicate: quote if value contains characters the parser
// could misread, has surrounding whitespace, or is empty.
const YAML_NEEDS_QUOTING_RE = /[:#[\]{},&*!|>'"%@`]/;

// ---------------------------------------------------------------------------
// parseYamlSequence — internal helper for YAML root-level arrays.
// ---------------------------------------------------------------------------
// yaml-parser.js only supports YAML with an object at the root. Decision-log
// files are YAML sequences (root `- ` items). This minimal helper wraps the
// sequence in a `__seq__:` key, calls the existing parse(), and unwraps.
// Relies on parseValue() from yaml-parser.js for scalar values.
//
// Supported row formats for sequence items:
//   - key: value          (key-value lines at item indent)
//   - Multi-line strings  (not needed; all four decision-log fields are scalars)
//
function parseYamlSequence(content) {
  // Wrap root-level `- ` items under a synthetic key so the existing parser
  // can handle them. Each `- ` at column 0 becomes `  - ` under `__seq__:`.
  const wrapped =
    `__seq__:\n` +
    content
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
  const obj = parse(wrapped);
  if (!obj || !Array.isArray(obj.__seq__)) {
    return null;
  }
  return obj.__seq__;
}

// ---------------------------------------------------------------------------
// parseConflictMarker — fr-sd-014-ac1
// ---------------------------------------------------------------------------

/**
 * Parse a _pending-conflict.md handoff file and return a structured object.
 *
 * The file is YAML; required fields are taken from PENDING_CONFLICT_RULES
 * (single source of truth, no local field-name duplication — fr-sd-014-ac4).
 *
 * @param {string} filePath - Path to _pending-conflict.md.
 * @returns {{ axis_fired: string, conflict_description: string,
 *   candidate_resolutions: string[], user_action_prompt: string } | null}
 *   Returns null if file not found, unparseable, or fails schema validation.
 */
function parseConflictMarker(filePath) {
  const content = readFileSafe(filePath);
  if (content === null) {
    return null;
  }

  let parsed;
  try {
    parsed = parse(content);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  // Validate required fields from the rules constant (fr-sd-014-ac4: no local literals).
  // Honor each rule's `allowed` enum where declared (e.g., axis_fired ∈ {'1','2','3'}).
  for (const rule of PENDING_CONFLICT_RULES.required_fields) {
    const value = parsed[rule.key];
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return null;
    }
    if (Array.isArray(rule.allowed) && !rule.allowed.includes(String(value))) {
      return null;
    }
  }

  // candidate_resolutions must be an array with at least min_length entries.
  const candidateRule = PENDING_CONFLICT_RULES.required_fields.find(
    (r) => r.key === 'candidate_resolutions',
  );
  const resolutions = parsed[candidateRule.key];
  if (!Array.isArray(resolutions) || resolutions.length < (candidateRule.min_length || 1)) {
    return null;
  }

  return {
    axis_fired: String(parsed.axis_fired),
    conflict_description: String(parsed.conflict_description),
    candidate_resolutions: resolutions.map(String),
    user_action_prompt: String(parsed.user_action_prompt),
  };
}

// ---------------------------------------------------------------------------
// parseDecisionLog — fr-sd-014-ac2
// ---------------------------------------------------------------------------

/**
 * Parse a decision-log YAML file and return an array of row objects.
 *
 * Each row must contain the four fields listed in
 * DECISION_LOG_RULES.required_fields_per_row.
 *
 * @param {string} filePath - Path to the decision-log file.
 * @returns {Array<{ q_id: string, question: string,
 *   user_answer_verbatim: string, deferral_signal: boolean }> | null}
 *   Returns null if file not found or unparseable.
 */
function parseDecisionLog(filePath) {
  const content = readFileSafe(filePath);
  if (content === null) {
    return null;
  }

  let parsed;
  try {
    parsed = parseYamlSequence(content);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  // Map rows to the canonical shape. We do not validate here — validation is
  // the job of validateDecisionLog(). Parser returns best-effort rows.
  return parsed.map((row) => {
    if (!row || typeof row !== 'object') {
      return row;
    }
    return {
      q_id: row.q_id,
      question: row.question,
      user_answer_verbatim: row.user_answer_verbatim,
      deferral_signal: row.deferral_signal,
    };
  });
}

// ---------------------------------------------------------------------------
// validateDecisionLog — fr-sd-014-ac2
// ---------------------------------------------------------------------------

/**
 * Validate a parsed decision-log array and return {valid, issues}.
 *
 * Schema invariants come from DECISION_LOG_RULES (fr-sd-014-ac4: no field
 * names duplicated as local literals). Issue shape matches validateDesignDoc /
 * validateSpecHeader: { level: 'ERROR'|'WARNING'|'INFO', field, message }.
 *
 * @param {Array | null} parsed - Output of parseDecisionLog.
 * @returns {{ valid: boolean, issues: Array<{level: string, field: string, message: string}> }}
 */
function validateDecisionLog(parsed) {
  const issues = [];

  if (parsed === null || parsed === undefined) {
    issues.push({
      level: 'ERROR',
      field: 'file',
      message: 'Decision log not found or could not be parsed.',
    });
    return { valid: false, issues };
  }

  if (!Array.isArray(parsed)) {
    issues.push({
      level: 'ERROR',
      field: 'file',
      message: 'Decision log must be an array of row objects.',
    });
    return { valid: false, issues };
  }

  // Per-row required-field checks. Field names from DECISION_LOG_RULES (fr-sd-014-ac4).
  const requiredFields = DECISION_LOG_RULES.required_fields_per_row;

  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    if (!row || typeof row !== 'object') {
      issues.push({
        level: 'ERROR',
        field: `row[${i}]`,
        message: `Row ${i} is not an object.`,
      });
      continue;
    }

    for (const field of requiredFields) {
      const value = row[field];
      const isMissing =
        value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
      if (isMissing) {
        issues.push({
          level: 'ERROR',
          field: `row[${i}]/${field}`,
          message: `Row ${i} is missing required field: ${field}.`,
        });
      }
    }

    // deferral_signal must be boolean (fr-sd-014-ac2).
    if (row.deferral_signal !== undefined && row.deferral_signal !== null) {
      if (typeof row.deferral_signal !== 'boolean') {
        issues.push({
          level: 'ERROR',
          field: `row[${i}]/deferral_signal`,
          message: `Row ${i}: deferral_signal must be a boolean, got ${JSON.stringify(row.deferral_signal)}.`,
        });
      }
    }
  }

  // q_id uniqueness within the parsed set (fr-sd-014-ac2 / DECISION_LOG_RULES).
  const seenQIds = new Map();
  for (let i = 0; i < parsed.length; i++) {
    const row = parsed[i];
    if (!row || typeof row !== 'object') continue;
    const qId = row.q_id;
    if (qId === null || qId === undefined) continue;
    if (seenQIds.has(qId)) {
      issues.push({
        level: 'ERROR',
        field: `row[${i}]/q_id`,
        message: `Duplicate q_id "${qId}" found at row ${i} (first seen at row ${seenQIds.get(qId)}). q_id must be unique within a session.`,
      });
    } else {
      seenQIds.set(qId, i);
    }
  }

  const valid = issues.every((issue) => issue.level !== 'ERROR');
  return { valid, issues };
}

// ---------------------------------------------------------------------------
// mechanicalAuthorizationCheck — fr-sd-014-ac3
// ---------------------------------------------------------------------------

/**
 * Phase 6 mechanical authorization helper (fr-sd-014-ac3).
 *
 * Iterates over every <trace> element in the in-memory spec XML and classifies
 * each trace as authorized or unauthorized:
 *
 *   - Date-prefixed design trace (YYYY-MM-DD:<section>): checks the cited
 *     section or phrase appears anywhere in the design file content.
 *   - q_id trace (<q_id>:<cited-content>): checks the cited content appears
 *     in that row's user_answer_verbatim in the decision-log.
 *   - Legacy REQ-F* / plain identifier traces: SKIPPED — not flagged.
 *
 * @param {string} specXmlContent - Raw in-memory spec XML.
 * @param {string} designFilePath - Path to design.md file.
 * @param {string|null} decisionLogFilePath - Path to decision-log file, or null.
 * @returns {{ valid: boolean, unauthorized_traces: Array<{
 *   trace_value: string, requirement_id: string,
 *   criterion_id: string, reason: string }> }}
 */
function mechanicalAuthorizationCheck(specXmlContent, designFilePath, decisionLogFilePath) {
  if (typeof specXmlContent !== 'string') {
    throw new Error('mechanicalAuthorizationCheck: specXmlContent must be a string');
  }
  if (typeof designFilePath !== 'string' || designFilePath.trim() === '') {
    throw new Error('mechanicalAuthorizationCheck: designFilePath must be a non-empty string');
  }
  if (
    decisionLogFilePath !== null &&
    decisionLogFilePath !== undefined &&
    typeof decisionLogFilePath !== 'string'
  ) {
    throw new Error('mechanicalAuthorizationCheck: decisionLogFilePath must be a string or null');
  }

  const unauthorizedTraces = [];

  // Read design file content once. path.resolve handles relative + absolute.
  const designContent = readFileSafe(path.resolve(designFilePath)) || '';
  // Lowercase once — the per-trace loop matches case-insensitively, and the
  // design content is invariant across iterations.
  const designLower = designContent.toLowerCase();

  // Parse decision-log once (may be null).
  let decisionRows = null;
  if (decisionLogFilePath !== null && decisionLogFilePath !== undefined) {
    decisionRows = parseDecisionLog(path.resolve(decisionLogFilePath));
  }

  // Build a lookup map from q_id to row for O(1) access.
  const decisionMap = new Map();
  if (Array.isArray(decisionRows)) {
    for (const row of decisionRows) {
      if (row && row.q_id !== null && row.q_id !== undefined) {
        decisionMap.set(String(row.q_id), row);
      }
    }
  }

  // Extract all <trace> entries with their enclosing requirement/criterion context.
  const traceEntries = extractTraceEntries(specXmlContent);

  for (const { trace_value, requirement_id, criterion_id } of traceEntries) {
    const classification = classifyTrace(trace_value);

    if (classification.type === 'legacy') {
      // Skip REQ-F* and other pre-v2 plain identifiers.
      continue;
    }

    if (classification.type === 'design') {
      // Design trace: verify cited section/phrase appears in design content.
      const cited = classification.cited;
      if (!designLower.includes(cited.toLowerCase())) {
        unauthorizedTraces.push({
          trace_value,
          requirement_id,
          criterion_id,
          reason: `Design section/phrase "${cited}" not found in design file.`,
        });
      }
    } else if (classification.type === 'qa') {
      // Q&A trace: verify cited content appears in row's user_answer_verbatim.
      const qId = classification.q_id;
      const cited = classification.cited;

      if (decisionRows === null) {
        // No decision log provided: q_id traces are unauthorized (no source = invention).
        unauthorizedTraces.push({
          trace_value,
          requirement_id,
          criterion_id,
          reason: `No decision log provided; q_id trace "${qId}" cannot be verified.`,
        });
        continue;
      }

      const row = decisionMap.get(qId);
      if (!row) {
        unauthorizedTraces.push({
          trace_value,
          requirement_id,
          criterion_id,
          reason: `q_id "${qId}" not found in decision log.`,
        });
        continue;
      }

      const verbatim = String(row.user_answer_verbatim || '');
      if (!verbatim.toLowerCase().includes(cited.toLowerCase())) {
        unauthorizedTraces.push({
          trace_value,
          requirement_id,
          criterion_id,
          reason: `Cited content "${cited}" not found in user_answer_verbatim for q_id "${qId}".`,
        });
      }
    }
  }

  return {
    valid: unauthorizedTraces.length === 0,
    unauthorized_traces: unauthorizedTraces,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract all trace entries from spec XML, each annotated with their enclosing
 * requirement_id and criterion_id. Uses sequential scan to maintain context.
 *
 * @param {string} xml - Raw spec XML content.
 * @returns {Array<{trace_value: string, requirement_id: string, criterion_id: string}>}
 */
function extractTraceEntries(xml) {
  const entries = [];
  let currentReqId = '';
  let currentCritId = '';

  for (const m of xml.matchAll(TRACE_TOKEN_RE)) {
    if (m[1] !== undefined) {
      currentReqId = m[1];
      currentCritId = '';
    } else if (m[2] !== undefined) {
      currentCritId = m[2];
    } else if (m[3] !== undefined) {
      entries.push({
        trace_value: m[3].trim(),
        requirement_id: currentReqId,
        criterion_id: currentCritId,
      });
    }
  }

  return entries;
}

/**
 * Classify a trace value as one of:
 *   - { type: 'design', cited: string } — date-prefixed: YYYY-MM-DD:<section>
 *   - { type: 'qa', q_id: string, cited: string } — q_id trace: <q_id>:<content>
 *   - { type: 'legacy' } — REQ-F* or plain identifier without date prefix
 *
 * @param {string} traceValue
 * @returns {{ type: 'design'|'qa'|'legacy', cited?: string, q_id?: string }}
 */
function classifyTrace(traceValue) {
  const trimmed = (traceValue || '').trim();

  if (TRACE_LEGACY_RE.test(trimmed)) {
    return { type: 'legacy' };
  }
  const designMatch = trimmed.match(TRACE_DESIGN_RE);
  if (designMatch) {
    return { type: 'design', cited: designMatch[2].trim() };
  }
  const qaMatch = trimmed.match(TRACE_QA_RE);
  if (qaMatch) {
    return { type: 'qa', q_id: qaMatch[1], cited: qaMatch[2].trim() };
  }
  // Plain identifier with no colon — treat as legacy (pre-v2).
  return { type: 'legacy' };
}

// ---------------------------------------------------------------------------
// writeConflictMarker — fr-rf-015 write-on-block contract
// ---------------------------------------------------------------------------

/**
 * Serialize a YAML string value, quoting it if it contains special characters.
 * Used internally to build the YAML wire format that parseConflictMarker expects.
 *
 * @param {string} value
 * @returns {string}
 */
function serializeYamlScalar(value) {
  const s = String(value);
  // Quote if value contains characters that could be misread by the parser.
  // Use double quotes and escape any double-quotes in the content.
  const needsQuoting = YAML_NEEDS_QUOTING_RE.test(s) || s.trim() !== s || s === '';
  if (needsQuoting) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Write _pending-conflict.md at specs/<specId>/_pending-conflict.md (fr-rf-015).
 *
 * Called by refiner on R3 axis-1, axis-2, or axis-3 block. Validates conflictData
 * against PENDING_CONFLICT_RULES (fr-sd-014-ac4: no local literal field names) before
 * writing. Writes atomically via a tmp file + renameSync. The produced YAML
 * round-trips cleanly through parseConflictMarker.
 *
 * Lifecycle: ephemeral. Brainstorming Phase 0 reads and deletes it on successful
 * new-design write (fr-cc-if-007-ac3). Refiner does NOT clean up the file.
 *
 * @param {string} specId - The spec identifier (e.g., 'spec-driven-refine').
 * @param {{ axis_fired: string, conflict_description: string,
 *   candidate_resolutions: string[], user_action_prompt: string }} conflictData
 * @param {string} projectRoot - Project root (required; explicit avoids cwd surprises
 *   when refiner is invoked from a skill-bash block).
 * @returns {string} Absolute path of the written file.
 * @throws {Error} When a required field is missing, fails its enum/length rule,
 *   or the serialized YAML fails to round-trip through parseConflictMarker.
 */
function writeConflictMarker(specId, conflictData, projectRoot) {
  if (typeof specId !== 'string' || specId.trim() === '') {
    throw new Error('writeConflictMarker: specId must be a non-empty string');
  }
  if (!conflictData || typeof conflictData !== 'object') {
    throw new Error('writeConflictMarker: conflictData must be an object');
  }
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new Error('writeConflictMarker: projectRoot is required (pass an absolute path)');
  }

  // Validate required fields against PENDING_CONFLICT_RULES (fr-sd-014-ac4).
  // Honors each rule's `allowed` enum where declared (e.g., axis_fired ∈ {'1','2','3'}).
  for (const rule of PENDING_CONFLICT_RULES.required_fields) {
    const value = conflictData[rule.key];
    if (value === null || value === undefined) {
      throw new Error(
        `writeConflictMarker: missing required field "${rule.key}" (per PENDING_CONFLICT_RULES).`,
      );
    }
    if (typeof value === 'string' && value.trim() === '') {
      throw new Error(
        `writeConflictMarker: required field "${rule.key}" must not be empty (per PENDING_CONFLICT_RULES).`,
      );
    }
    if (Array.isArray(rule.allowed) && !rule.allowed.includes(String(value))) {
      throw new Error(
        `writeConflictMarker: field "${rule.key}" value ${JSON.stringify(value)} is not in allowed set ${JSON.stringify(rule.allowed)} (per PENDING_CONFLICT_RULES).`,
      );
    }
  }

  // candidate_resolutions length check (1..=max_length per fr-sd-012-ac1, fr-cc-if-007-ac2).
  const candidateRule = PENDING_CONFLICT_RULES.required_fields.find(
    (r) => r.key === 'candidate_resolutions',
  );
  const resolutions = conflictData[candidateRule.key];
  if (!Array.isArray(resolutions) || resolutions.length < (candidateRule.min_length || 1)) {
    // Exact error message per fr-sd-012-ac3.
    throw new Error('_pending-conflict.md MUST contain at least one candidate resolution');
  }
  if (resolutions.length > (candidateRule.max_length || 3)) {
    throw new Error(
      `writeConflictMarker: candidate_resolutions must have at most ${candidateRule.max_length} entries (got ${resolutions.length}).`,
    );
  }

  // Build the YAML content matching the wire format parseConflictMarker expects.
  // Format: plain YAML with root-level keys; candidate_resolutions as a block sequence.
  const yamlLines = [
    `axis_fired: ${serializeYamlScalar(conflictData.axis_fired)}`,
    `conflict_description: ${serializeYamlScalar(conflictData.conflict_description)}`,
    'candidate_resolutions:',
    ...resolutions.map((r) => `  - ${serializeYamlScalar(r)}`),
    `user_action_prompt: ${serializeYamlScalar(conflictData.user_action_prompt)}`,
  ];
  const yamlContent = `${yamlLines.join('\n')}\n`;

  // Round-trip self-test: parse what we are about to write. If the parser would
  // reject our output, fail fast before we touch the filesystem — silent YAML
  // corruption is the failure mode this guards against, since the serializer
  // and parser are sister implementations that can drift.
  const roundTripped = parse(yamlContent);
  if (!roundTripped || typeof roundTripped !== 'object') {
    throw new Error('writeConflictMarker: round-trip YAML check failed (parser rejected output)');
  }
  for (const rule of PENDING_CONFLICT_RULES.required_fields) {
    if (roundTripped[rule.key] === null || roundTripped[rule.key] === undefined) {
      throw new Error(
        `writeConflictMarker: round-trip YAML check failed (field "${rule.key}" missing after re-parse)`,
      );
    }
  }

  // canonical_path = 'specs/<spec-id>/_pending-conflict.md'; substitute spec-id.
  const relPath = PENDING_CONFLICT_RULES.canonical_path.replace('<spec-id>', specId);
  const destPath = path.resolve(projectRoot, relPath);

  return atomicWriteFile(destPath, yamlContent);
}

module.exports = {
  parseConflictMarker,
  parseDecisionLog,
  validateDecisionLog,
  mechanicalAuthorizationCheck,
  writeConflictMarker,
};
