/**
 * learning-schemas.js — validators for the learning subsystem's on-disk formats.
 *
 * v6 requires every on-disk format to have a single owner in `scripts/lib/` plus
 * a schema test. This module is the machine-readable half of that contract for
 * the three formats the learning workflow writes:
 *
 *   | format           | writer (owner)                        |
 *   |------------------|---------------------------------------|
 *   | instinct file    | instinct-writer.js `saveInstinct`     |
 *   | diary path       | session-utils.js / utils.js diary path helpers |
 *   | operation record | operation-record-writer.js            |
 *
 * The validators do NOT replace the writers — they pin what the writers emit so
 * a shape change cannot land silently. `tests/scripts/learning-schemas.test.js`
 * binds the two together: the real writer's real output must validate clean, and
 * a battery of malformed samples must each be rejected. A validator that only
 * ever sees good input proves nothing, so the negative samples are the point.
 *
 * Every validator returns `{valid, errors}` rather than throwing: a caller
 * checking many files wants all the errors, not the first one.
 */

const path = require('node:path');

const { parseConfidenceFrontmatter } = require('./confidence');

/** Sources an instinct may legitimately carry. */
const INSTINCT_SOURCES = ['observation', 'reflection', 'manual'];

/** Frontmatter keys `saveInstinct` always emits. */
const INSTINCT_REQUIRED_KEYS = [
  'id',
  'trigger',
  'action',
  'domain',
  'source',
  'confidence',
  'extracted',
  'last_confirmed',
  'confirmations',
  'contradictions',
];

/** Body headings `saveInstinct` always emits. */
const INSTINCT_REQUIRED_SECTIONS = ['## Trigger', '## Action'];

/** Frontmatter keys every operation record carries, regardless of kind. */
const RECORD_COMMON_KEYS = ['project', 'project_id', 'session', 'created_at', 'source'];

/** Kind-specific record contract: id field, filename prefix, extra keys. */
const RECORD_KINDS = {
  reflect: { idField: 'reflect_id', prefix: 'reflect-', extraKeys: ['source_diary_ids'] },
  recall: {
    idField: 'recall_id',
    prefix: 'recall-',
    extraKeys: ['recall_query', 'returned_instinct_ids'],
  },
};

function result(errors) {
  return { valid: errors.length === 0, errors };
}

/** Split `---`-delimited frontmatter from a markdown body. */
function splitFrontmatter(content) {
  if (typeof content !== 'string') return null;
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return { raw: match[1], body: match[2] };
}

/** Parse simple `key: value` frontmatter lines, ignoring YAML list items. */
function parseFlatFrontmatter(raw) {
  const fields = {};
  for (const line of raw.split('\n')) {
    if (!line.trim() || line.startsWith('  ') || line.trimStart().startsWith('- ')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
}

/**
 * Validate an instinct file as `saveInstinct` writes it.
 *
 * Extra frontmatter keys are allowed: a curator-activated instinct carries
 * provenance fields the manual writer never emits, and archived instincts gain
 * `archived_at`. Missing required keys, an out-of-range confidence, a negative
 * counter, an unknown source, or a missing body section are all errors.
 *
 * @param {string} content
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateInstinctFile(content) {
  const errors = [];
  const split = splitFrontmatter(content);
  if (!split) {
    return result(['instinct file must open with a --- delimited frontmatter block']);
  }

  const { frontmatter, body } = parseConfidenceFrontmatter(content);
  const flat = parseFlatFrontmatter(split.raw);

  for (const key of INSTINCT_REQUIRED_KEYS) {
    if (flat[key] === undefined || flat[key] === '') {
      errors.push(`missing required frontmatter key: ${key}`);
    }
  }

  const confidence = frontmatter.confidence;
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    errors.push('confidence must be a number');
  } else if (confidence < 0 || confidence > 1) {
    errors.push(`confidence must be within 0..1 (got ${confidence})`);
  }

  for (const counter of ['confirmations', 'contradictions']) {
    const value = frontmatter[counter];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`${counter} must be a non-negative integer (got ${flat[counter]})`);
    }
  }

  if (flat.source !== undefined && !INSTINCT_SOURCES.includes(flat.source)) {
    errors.push(`source must be one of ${INSTINCT_SOURCES.join('|')} (got ${flat.source})`);
  }

  for (const section of INSTINCT_REQUIRED_SECTIONS) {
    if (!body.includes(section)) errors.push(`missing required body section: ${section}`);
  }

  return result(errors);
}

/**
 * Validate a diary file path against the layout the diary path helpers own:
 * `<...>/diaries/<project>/<YYYY-MM-DD>/diary-<session>[-draft].md`.
 *
 * The path IS the diary format's contract — the body is agent-authored prose,
 * so the machine-checkable part is where the file lives and what it is named.
 *
 * @param {string} filePath
 * @param {{draft?: boolean}} [opts] — when set, also assert the draft-ness
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateDiaryPath(filePath, { draft } = {}) {
  const errors = [];
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return result(['diary path must be a non-empty string']);
  }

  const parts = filePath.split(path.sep).filter(Boolean);
  const filename = parts[parts.length - 1] || '';
  const datePart = parts[parts.length - 2] || '';
  const projectPart = parts[parts.length - 3] || '';
  const rootPart = parts[parts.length - 4] || '';

  if (rootPart !== 'diaries') {
    errors.push(`diary must live under a "diaries" root (got "${rootPart}")`);
  }
  if (!projectPart) {
    errors.push('diary path must carry a project directory');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    errors.push(`diary date directory must be YYYY-MM-DD (got "${datePart}")`);
  }

  const nameMatch = filename.match(/^diary-(.+?)(-draft)?\.md$/);
  if (!nameMatch) {
    errors.push(`diary filename must be diary-<session>[-draft].md (got "${filename}")`);
  } else if (draft !== undefined) {
    const isDraft = Boolean(nameMatch[2]);
    if (isDraft !== draft) {
      errors.push(draft ? 'expected a -draft.md path' : 'expected a final (non-draft) path');
    }
  }

  return result(errors);
}

/**
 * Validate an operation record as `operation-record-writer.js` writes it.
 *
 * @param {string} content
 * @param {'reflect'|'recall'} kind
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateOperationRecord(content, kind) {
  const spec = RECORD_KINDS[kind];
  if (!spec) return result([`unknown operation record kind: ${kind}`]);

  const split = splitFrontmatter(content);
  if (!split) {
    return result(['operation record must open with a --- delimited frontmatter block']);
  }

  const errors = [];
  const flat = parseFlatFrontmatter(split.raw);

  const id = flat[spec.idField];
  if (id === undefined || id === '') {
    errors.push(`missing required frontmatter key: ${spec.idField}`);
  } else if (!id.startsWith(spec.prefix)) {
    errors.push(
      `${spec.idField} must start with "${spec.prefix}" so the curator batch-assembler ` +
        `matches the record (got "${id}")`,
    );
  }

  for (const key of RECORD_COMMON_KEYS) {
    if (flat[key] === undefined) errors.push(`missing required frontmatter key: ${key}`);
  }
  for (const key of spec.extraKeys) {
    if (flat[key] === undefined) errors.push(`missing required frontmatter key: ${key}`);
  }

  if (flat.project === '') errors.push('project must not be empty');
  if (flat.created_at && Number.isNaN(Date.parse(flat.created_at))) {
    errors.push(`created_at must be an ISO timestamp (got "${flat.created_at}")`);
  }

  return result(errors);
}

module.exports = {
  INSTINCT_SOURCES,
  INSTINCT_REQUIRED_KEYS,
  INSTINCT_REQUIRED_SECTIONS,
  RECORD_COMMON_KEYS,
  RECORD_KINDS,
  validateInstinctFile,
  validateDiaryPath,
  validateOperationRecord,
};
