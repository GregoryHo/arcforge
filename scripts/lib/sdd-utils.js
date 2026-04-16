/**
 * sdd-utils.js — Spec-Driven Development utility functions.
 *
 * Provides deterministic validation helpers for design docs and spec headers.
 * Implements the rules defined in scripts/lib/sdd-schemas/design.md.
 */

const fs = require('node:fs');
const path = require('node:path');

// Regex to extract spec_id and iteration date from canonical design doc path.
// Matches: .../docs/plans/<spec-id>/<YYYY-MM-DD>[optional-suffix]/design.md
const DESIGN_PATH_RE = /docs\/plans\/([^/]+)\/(\d{4}-\d{2}-\d{2}(?:-[^/]+)?)\/design\.md$/;

// Minimum non-heading character count for substantive content.
const MIN_SUBSTANTIVE_CHARS = 50;

/**
 * Parse a design doc at filePath and return structured metadata.
 *
 * @param {string} filePath - Absolute or relative path to the design.md file.
 * @param {{ cwd?: string }} [options]
 * @returns {{ spec_id: string, iteration: string, mode: 'initial'|'iteration',
 *   hasContext: boolean, hasChangeIntent: boolean,
 *   hasSubstantiveContent: boolean, specDesignIteration: string|null } | null}
 */
function parseDesignDoc(filePath, options = {}) {
  const cwd = options.cwd || process.cwd();

  // File must exist.
  if (!fs.existsSync(filePath)) {
    return null;
  }

  // Normalize backslashes for cross-platform matching.
  const normalizedPath = filePath.replace(/\\/g, '/');
  const match = DESIGN_PATH_RE.exec(normalizedPath);
  if (!match) {
    return null;
  }

  const spec_id = match[1];
  const iteration = match[2];

  // Mode detection: filesystem check for specs/<spec-id>/spec.xml.
  const specXmlPath = path.join(cwd, 'specs', spec_id, 'spec.xml');
  const mode = fs.existsSync(specXmlPath) ? 'iteration' : 'initial';

  const content = fs.readFileSync(filePath, 'utf8');

  // Detect required headings (case-insensitive, any heading level).
  const hasContext = /^#+\s+Context\s*$/im.test(content);
  const hasChangeIntent = /^#+\s+Change\s+Intent\s*$/im.test(content);

  // Substantive content: strip heading lines, check remaining non-whitespace length.
  const nonHeadingContent = content
    .split('\n')
    .filter((line) => !/^#+\s/.test(line))
    .join('\n');
  const hasSubstantiveContent =
    nonHeadingContent.replace(/\s+/g, '').length >= MIN_SUBSTANTIVE_CHARS;

  // In iteration mode, read design_iteration from spec.xml.
  let specDesignIteration = null;
  if (mode === 'iteration') {
    try {
      const specXmlContent = fs.readFileSync(specXmlPath, 'utf8');
      const diMatch = /<design_iteration>([^<]+)<\/design_iteration>/.exec(specXmlContent);
      if (diMatch) {
        specDesignIteration = diMatch[1].trim();
      }
    } catch {
      // Spec XML unreadable — leave specDesignIteration as null.
    }
  }

  return {
    spec_id,
    iteration,
    mode,
    hasContext,
    hasChangeIntent,
    hasSubstantiveContent,
    specDesignIteration,
  };
}

/**
 * Validate a parsed design doc object and return a result with issues.
 *
 * @param {ReturnType<typeof parseDesignDoc>} parsed
 * @returns {{ valid: boolean, issues: Array<{ level: 'ERROR'|'WARNING'|'INFO', field: string, message: string }> }}
 */
function validateDesignDoc(parsed) {
  const issues = [];

  if (parsed === null) {
    issues.push({
      level: 'ERROR',
      field: 'file',
      message: 'Design doc not found at expected path. Run brainstorming to create one.',
    });
    return { valid: false, issues };
  }

  if (!parsed.hasSubstantiveContent) {
    issues.push({
      level: 'ERROR',
      field: 'content',
      message:
        'Design doc has no substantive content. Add problem description, solution, and requirements.',
    });
  }

  if (parsed.mode === 'iteration') {
    if (!parsed.hasContext) {
      issues.push({
        level: 'ERROR',
        field: 'Context',
        message: 'Iteration design doc missing required Context section.',
      });
    }

    if (!parsed.hasChangeIntent) {
      issues.push({
        level: 'ERROR',
        field: 'Change Intent',
        message: 'Iteration design doc missing required Change Intent section.',
      });
    }

    // Stale date check: iteration <= specDesignIteration triggers WARNING.
    if (parsed.specDesignIteration !== null && parsed.iteration <= parsed.specDesignIteration) {
      issues.push({
        level: 'WARNING',
        field: 'iteration',
        message: `Design doc iteration (${parsed.iteration}) is not newer than spec's recorded design_iteration (${parsed.specDesignIteration}). This may be a re-run or duplicate iteration.`,
      });
    }
  }

  const valid = issues.every((i) => i.level !== 'ERROR');
  return { valid, issues };
}

module.exports = { parseDesignDoc, validateDesignDoc };
