#!/usr/bin/env node
/**
 * Confidence Library
 *
 * Shared confidence scoring for instincts.
 * Both use unified .md + YAML frontmatter format.
 *
 * Lifecycle: create → confirm/contradict → decay → archive
 */

const fs = require('node:fs');
const path = require('node:path');

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
 */
function applyContradiction(confidence) {
  return Math.max(MIN_CONFIDENCE, (confidence || INITIAL) + CONTRADICT_DELTA);
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

/**
 * Run decay cycle on all .md files in a directory.
 * Decreases confidence based on time since last_confirmed.
 * Archives files that drop below ARCHIVE_THRESHOLD.
 *
 * @param {string} dirPath - Directory containing .md files
 * @param {string} [archiveSubdir='archived'] - Subdirectory for archived files
 * @returns {{ decayed: string[], archived: string[] }}
 */
function runDecayCycle(dirPath, archiveSubdir = 'archived') {
  const result = { decayed: [], archived: [] };

  if (!fs.existsSync(dirPath)) return result;

  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
  const now = new Date();

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter } = parseConfidenceFrontmatter(content);

    if (frontmatter.confidence === undefined) continue;

    const decay = calculateDecay(frontmatter.last_confirmed, now);
    if (decay <= 0) continue;

    const newConfidence = clampConfidence(frontmatter.confidence - decay);

    if (shouldArchive(newConfidence)) {
      // Move to archived subdirectory
      const archiveDir = path.join(dirPath, archiveSubdir);
      fs.mkdirSync(archiveDir, { recursive: true });

      const updatedContent = updateConfidenceFrontmatter(content, {
        confidence: newConfidence,
        archived_at: now.toISOString().split('T')[0],
      });

      fs.writeFileSync(path.join(archiveDir, file), updatedContent, 'utf-8');
      fs.unlinkSync(filePath);
      result.archived.push(file);
    } else if (newConfidence < frontmatter.confidence) {
      // Update confidence in place
      const updatedContent = updateConfidenceFrontmatter(content, {
        confidence: newConfidence,
      });
      fs.writeFileSync(filePath, updatedContent, 'utf-8');
      result.decayed.push(file);
    }
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
