#!/usr/bin/env node
/**
 * Confidence Library
 *
 * Shared confidence scoring for instincts.
 * Both use unified .md + YAML frontmatter format.
 *
 * Lifecycle: create → confirm/contradict → decay → archive
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { getArcforgeHome } = require('./utils');
const { writeAuditEntry } = require('./learning-audit-log');
const { listActivatedCandidateIds } = require('./learning-curator/activate');

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const INITIAL = 0.5;
const CONFIRM_DELTA = 0.05;
const CONTRADICT_DELTA = -0.1;
const DECAY_PER_WEEK = 0.02;
const AUTO_LOAD_THRESHOLD = 0.7;
const ARCHIVE_THRESHOLD = 0.15;
const MAX_CONFIDENCE = 0.9;
const REFLECT_MAX_CONFIDENCE = 0.85;
const MIN_CONFIDENCE = 0.1;

// Resistance-based confidence: manual/reflection instincts decay slower
const RESISTANT_DECAY_RATIO = 0.5;
const MANUAL_CONTRADICT_DELTA = CONTRADICT_DELTA * RESISTANT_DECAY_RATIO;
const MANUAL_DECAY_PER_WEEK = DECAY_PER_WEEK * RESISTANT_DECAY_RATIO;
const RESISTANT_SOURCES = new Set(['manual', 'reflection']);

// ─────────────────────────────────────────────
// Frontmatter Parsing
// ─────────────────────────────────────────────

/**
 * Parse YAML frontmatter from markdown content.
 * Returns { frontmatter: {}, body: string }
 */
function parseConfidenceFrontmatter(content) {
  // Normalize CRLF to LF for cross-platform compatibility
  const normalized = content ? content.replace(/\r\n/g, '\n') : content;

  if (!normalized || !normalized.startsWith('---\n')) {
    return { frontmatter: {}, body: normalized || '' };
  }

  const endIdx = normalized.indexOf('\n---\n', 4);
  if (endIdx === -1) {
    return { frontmatter: {}, body: normalized };
  }

  const yamlBlock = normalized.substring(4, endIdx);
  const body = normalized.substring(endIdx + 5);
  const frontmatter = {};

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim();
    let value = line.substring(colonIdx + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Parse numbers
    if (key === 'confidence' || key === 'confirmations' || key === 'contradictions') {
      frontmatter[key] = parseFloat(value);
    } else {
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

/**
 * Update frontmatter fields in markdown content.
 * Only updates fields present in `updates` object.
 */
function updateConfidenceFrontmatter(content, updates) {
  const { frontmatter, body } = parseConfidenceFrontmatter(content);

  // Merge updates
  for (const [key, value] of Object.entries(updates)) {
    frontmatter[key] = value;
  }

  // Rebuild frontmatter
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value === 'number') {
      // Format confidence to 2 decimal places
      lines.push(`${key}: ${key === 'confidence' ? value.toFixed(2) : value}`);
    } else if (typeof value === 'string' && (value.includes(' ') || value.includes('"'))) {
      lines.push(`${key}: "${value}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');

  return `${lines.join('\n')}\n${body}`;
}

// ─────────────────────────────────────────────
// Confidence Calculations
// ─────────────────────────────────────────────

/**
 * Calculate decay amount based on time since last confirmation.
 * @param {string} lastConfirmed - ISO date string (YYYY-MM-DD)
 * @param {Date} [currentDate] - Current date (for testing)
 * @returns {number} Decay amount (positive number to subtract)
 */
function calculateDecay(lastConfirmed, currentDate = new Date()) {
  if (!lastConfirmed) return 0;

  const lastDate = new Date(lastConfirmed);
  const diffMs = currentDate.getTime() - lastDate.getTime();
  const weeks = diffMs / (7 * 24 * 60 * 60 * 1000);

  return Math.max(0, weeks * DECAY_PER_WEEK);
}

/**
 * Apply confirmation to confidence score.
 */
function applyConfirmation(confidence) {
  return Math.min(MAX_CONFIDENCE, (confidence || INITIAL) + CONFIRM_DELTA);
}

/**
 * Apply contradiction to confidence score.
 * @param {number} confidence - Current confidence
 * @param {string} [source] - Instinct source (manual, reflection, session-observation)
 */
function applyContradiction(confidence, source) {
  const delta = RESISTANT_SOURCES.has(source) ? MANUAL_CONTRADICT_DELTA : CONTRADICT_DELTA;
  return Math.max(MIN_CONFIDENCE, (confidence || INITIAL) + delta);
}

/**
 * Check if confidence meets auto-load threshold.
 */
function shouldAutoLoad(confidence) {
  return (confidence || 0) >= AUTO_LOAD_THRESHOLD;
}

/**
 * Check if confidence is below archive threshold.
 */
function shouldArchive(confidence) {
  return (confidence || 0) < ARCHIVE_THRESHOLD;
}

/**
 * Clamp confidence to valid range.
 */
function clampConfidence(confidence) {
  return Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, confidence));
}

// ─────────────────────────────────────────────
// Decay Cycle
// ─────────────────────────────────────────────

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Frontmatter key recording the instant decay has been charged up to (B-10). */
const DECAY_CHARGED_THROUGH_KEY = 'decay_charged_through';

/** `archive_reason` stamped on a file the decay cycle archives (B-10). */
const DECAY_ARCHIVE_REASON = 'decay';

/**
 * The instant decay is owed from: the later of the last confirmation and the
 * point decay has already been charged through. A confirmation after a charge
 * restarts the clock; a charge never counts the same weeks twice.
 * @returns {number|null} epoch ms, or null when the file has no usable date
 */
function decayAnchor(frontmatter) {
  const confirmed = Date.parse(frontmatter.last_confirmed);
  if (Number.isNaN(confirmed)) return null;
  const charged = Date.parse(frontmatter[DECAY_CHARGED_THROUGH_KEY]);
  return Number.isNaN(charged) ? confirmed : Math.max(confirmed, charged);
}

function archiveByDecay(ctx, file, content, frontmatter, updates) {
  const archiveDir = path.join(ctx.dirPath, ctx.archiveSubdir);
  fs.mkdirSync(archiveDir, { recursive: true });
  const archivedAt = ctx.now.toISOString();
  fs.writeFileSync(
    path.join(archiveDir, file),
    updateConfidenceFrontmatter(content, {
      ...updates,
      archived_at: archivedAt.split('T')[0],
      archive_reason: DECAY_ARCHIVE_REASON,
    }),
    'utf-8',
  );
  fs.unlinkSync(path.join(ctx.dirPath, file));
  writeAuditEntry(
    {
      accepted: true,
      action_id: `decay_${ctx.now.getTime()}_${crypto.randomBytes(6).toString('hex')}`,
      requested_at: archivedAt,
      action: 'decay_archive',
      instinct_id: frontmatter.id || path.basename(file, '.md'),
      instinct_dir: path.basename(ctx.dirPath),
      archived_to: path.join(ctx.archiveSubdir, file),
      actor: { actor_type: 'decay_cycle' },
      reason: DECAY_ARCHIVE_REASON,
      confidence_before: frontmatter.confidence,
      confidence_after: Number(updates.confidence.toFixed(2)),
    },
    ctx.arcforgeRoot,
  );
}

/**
 * Run decay cycle on all .md files in a directory (B-10).
 *
 * Charges whole weeks since `decayAnchor`, and records the instant those weeks
 * run through, so running the cycle any number of times over the same interval
 * gives the result of running it once. Whole weeks keep every charge a
 * multiple of 0.01, so the two-decimal confidence on disk loses nothing to
 * rounding however often sessions start. A file that falls below
 * ARCHIVE_THRESHOLD is archived — stamped `archive_reason: decay` and audited —
 * unless it is an activated instinct (its id in the ActivationRecord fold the
 * SessionStart injector gates on), which only the user's deactivation retires
 * (B-4).
 *
 * @param {string} dirPath - Directory containing .md files
 * @param {{ now?: Date, arcforgeRoot?: string, archiveSubdir?: string }} [options]
 * @returns {{ decayed: string[], archived: string[] }}
 */
function runDecayCycle(dirPath, options = {}) {
  const result = { decayed: [], archived: [] };

  if (!fs.existsSync(dirPath)) return result;

  const ctx = {
    dirPath,
    arcforgeRoot: options.arcforgeRoot || getArcforgeHome(),
    now: options.now || new Date(),
    archiveSubdir: options.archiveSubdir || 'archived',
  };
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
  let activated = null;

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter } = parseConfidenceFrontmatter(content);

    if (frontmatter.confidence === undefined) continue;

    const anchor = decayAnchor(frontmatter);
    if (anchor === null) continue;
    const weeks = Math.floor((ctx.now.getTime() - anchor) / WEEK_MS);
    if (weeks <= 0) continue;

    // Source-aware decay: resistant sources decay at half rate
    const perWeek = RESISTANT_SOURCES.has(frontmatter.source)
      ? MANUAL_DECAY_PER_WEEK
      : DECAY_PER_WEEK;
    const newConfidence = clampConfidence(frontmatter.confidence - weeks * perWeek);
    if (newConfidence >= frontmatter.confidence) continue;

    const updates = {
      confidence: newConfidence,
      [DECAY_CHARGED_THROUGH_KEY]: new Date(anchor + weeks * WEEK_MS).toISOString(),
    };

    if (shouldArchive(newConfidence)) {
      if (activated === null) activated = listActivatedCandidateIds(ctx.arcforgeRoot);
      const id = frontmatter.id || path.basename(file, '.md');
      if (!activated.has(id) && !activated.has(path.basename(file, '.md'))) {
        archiveByDecay(ctx, file, content, frontmatter, updates);
        result.archived.push(file);
        continue;
      }
    }

    fs.writeFileSync(filePath, updateConfidenceFrontmatter(content, updates), 'utf-8');
    result.decayed.push(file);
  }

  return result;
}

module.exports = {
  // Constants
  INITIAL,
  CONFIRM_DELTA,
  CONTRADICT_DELTA,
  DECAY_PER_WEEK,
  AUTO_LOAD_THRESHOLD,
  ARCHIVE_THRESHOLD,
  MAX_CONFIDENCE,
  REFLECT_MAX_CONFIDENCE,
  MIN_CONFIDENCE,
  DECAY_ARCHIVE_REASON,
  MANUAL_CONTRADICT_DELTA,
  MANUAL_DECAY_PER_WEEK,
  RESISTANT_SOURCES,
  // Parsing
  parseConfidenceFrontmatter,
  updateConfidenceFrontmatter,
  // Calculations
  calculateDecay,
  applyConfirmation,
  applyContradiction,
  shouldAutoLoad,
  shouldArchive,
  clampConfidence,
  // Lifecycle
  runDecayCycle,
};
