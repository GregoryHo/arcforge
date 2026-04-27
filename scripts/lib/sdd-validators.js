/**
 * sdd-validators.js — Parser/validator API for fr-sd-014.
 *
 * Exports parseConflictMarker, parseDecisionLog, validateDecisionLog, and
 * mechanicalAuthorizationCheck. These are the three new exports required by
 * fr-sd-014-ac1 through fr-sd-014-ac3. All functions reference
 * PENDING_CONFLICT_RULES / DECISION_LOG_RULES as their schema source of
 * truth — no field names are duplicated as local literals (fr-sd-014-ac4).
 *
 * Wire format for both _pending-conflict.md and decision-log files: YAML.
 * This matches arcforge's "all state as YAML, JSON, JSONL, or Markdown"
 * convention. The parse() function from yaml-parser.js handles both.
 */

const fs = require('node:fs');
const { parse } = require('./yaml-parser');
const { PENDING_CONFLICT_RULES, DECISION_LOG_RULES } = require('./sdd-rules');

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
  if (!fs.existsSync(filePath)) {
    return null;
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
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
  for (const rule of PENDING_CONFLICT_RULES.required_fields) {
    const value = parsed[rule.key];
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string' && value.trim() === '') {
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
  if (!fs.existsSync(filePath)) {
    return null;
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
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
  const unauthorizedTraces = [];

  // Read design file content once.
  let designContent = '';
  try {
    if (fs.existsSync(designFilePath)) {
      designContent = fs.readFileSync(designFilePath, 'utf8');
    }
  } catch {
    // If design file is unreadable, all design traces will fail.
  }

  // Parse decision-log once (may be null).
  let decisionRows = null;
  if (decisionLogFilePath !== null && decisionLogFilePath !== undefined) {
    decisionRows = parseDecisionLog(decisionLogFilePath);
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
      const found = designContent.toLowerCase().includes(cited.toLowerCase());
      if (!found) {
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
  // Tags we track: <requirement id="...">, <criterion id="...">, <trace>...</trace>
  const tokenRe = /<requirement\s+id="([^"]*)"|<criterion\s+id="([^"]*)"|<trace>([^<]*)<\/trace>/g;

  let currentReqId = '';
  let currentCritId = '';

  for (const m of xml.matchAll(tokenRe)) {
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

  // Legacy: REQ-F* patterns (e.g., REQ-F010, REQ-F010-ac1) — skip entirely.
  if (/^REQ-[A-Z]\d+/.test(trimmed)) {
    return { type: 'legacy' };
  }

  // Design trace: starts with ISO date YYYY-MM-DD followed by ':'
  // e.g., "2026-04-27:Architecture" or "2026-04-27:B.1"
  const designMatch = /^(\d{4}-\d{2}-\d{2}):(.+)$/.exec(trimmed);
  if (designMatch) {
    return { type: 'design', cited: designMatch[2].trim() };
  }

  // Q&A trace: a q_id-style identifier followed by ':' and cited content.
  // q_id pattern: starts with a letter, no ISO date prefix.
  // e.g., "q1:60 requests per minute" or "qRateLimit:some answer"
  const qaMatch = /^([a-zA-Z][a-zA-Z0-9_-]*):(.+)$/.exec(trimmed);
  if (qaMatch) {
    return { type: 'qa', q_id: qaMatch[1], cited: qaMatch[2].trim() };
  }

  // Plain identifier with no colon — treat as legacy (pre-v2).
  return { type: 'legacy' };
}

module.exports = {
  parseConflictMarker,
  parseDecisionLog,
  validateDecisionLog,
  mechanicalAuthorizationCheck,
};
