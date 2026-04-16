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

// Regex to match YYYY-MM-DD date format.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Regex to match supersedes format: <id>:v<n>
const SUPERSEDES_RE = /^[a-z0-9-]+:v\d+$/;

/**
 * Parse a spec XML string and return a structured header object.
 *
 * @param {string} specXmlContent - Raw XML string from spec.xml.
 * @returns {{ spec_id: string, spec_version: number, status: string, title: string,
 *   description: string, design_path: string, design_iteration: string,
 *   supersedes: string|null,
 *   scope: { includes: Array<{id: string, description: string}>, excludes: string[] },
 *   delta: { version: string, iteration: string,
 *     added: Array<{ref: string, text: string}>,
 *     modified: Array<{ref: string, text: string}>,
 *     removed: Array<{ref: string, text: string}> } | null } | null}
 */
function parseSpecHeader(specXmlContent) {
  if (!specXmlContent || typeof specXmlContent !== 'string') {
    return null;
  }

  // Extract the <overview> block.
  const overviewMatch = /<overview>([\s\S]*?)<\/overview>/.exec(specXmlContent);
  if (!overviewMatch) {
    return null;
  }
  const overview = overviewMatch[1];

  // Helper to extract a simple text element from the overview block.
  function extract(tag) {
    const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(overview);
    return m ? m[1].trim() : null;
  }

  const spec_id = extract('spec_id');
  const spec_version = parseInt(extract('spec_version'), 10);
  const status = extract('status');
  const title = extract('title');
  const description = extract('description');
  const supersedes = extract('supersedes');

  // Extract source fields from <source> block.
  const sourceMatch = /<source>([\s\S]*?)<\/source>/.exec(overview);
  let design_path = null;
  let design_iteration = null;
  if (sourceMatch) {
    const source = sourceMatch[1];
    const dpMatch = /<design_path>([^<]*)<\/design_path>/.exec(source);
    if (dpMatch) design_path = dpMatch[1].trim();
    const diMatch = /<design_iteration>([^<]*)<\/design_iteration>/.exec(source);
    if (diMatch) design_iteration = diMatch[1].trim();
  }

  // Extract scope.
  const scopeMatch = /<scope>([\s\S]*?)<\/scope>/.exec(overview);
  const scope = { includes: [], excludes: [] };
  if (scopeMatch) {
    const scopeBlock = scopeMatch[1];

    // Parse <feature id="...">text</feature> elements from <includes>.
    const includesMatch = /<includes>([\s\S]*?)<\/includes>/.exec(scopeBlock);
    if (includesMatch) {
      for (const m of includesMatch[1].matchAll(
        /<feature\s+id="([^"]*)"[^>]*>([^<]*)<\/feature>/g,
      )) {
        scope.includes.push({ id: m[1], description: m[2].trim() });
      }
    }

    // Parse <reason>text</reason> elements from <excludes>.
    const excludesMatch = /<excludes>([\s\S]*?)<\/excludes>/.exec(scopeBlock);
    if (excludesMatch) {
      for (const m of excludesMatch[1].matchAll(/<reason>([^<]*)<\/reason>/g)) {
        scope.excludes.push(m[1].trim());
      }
    }
  }

  // Extract delta (optional).
  const deltaMatch = /<delta\s+([^>]*)>([\s\S]*?)<\/delta>/.exec(overview);
  let delta = null;
  if (deltaMatch) {
    const attrsStr = deltaMatch[1];
    const deltaBody = deltaMatch[2];

    const versionAttr = /version="([^"]*)"/.exec(attrsStr);
    const iterationAttr = /iteration="([^"]*)"/.exec(attrsStr);

    function parseDeltaItems(tag) {
      const re = new RegExp(`<${tag}\\s+ref="([^"]*)"[^>]*>([^<]*)</${tag}>`, 'g');
      return [...deltaBody.matchAll(re)].map((m) => ({ ref: m[1], text: m[2].trim() }));
    }

    delta = {
      version: versionAttr ? versionAttr[1] : null,
      iteration: iterationAttr ? iterationAttr[1] : null,
      added: parseDeltaItems('added'),
      modified: parseDeltaItems('modified'),
      removed: parseDeltaItems('removed'),
    };
  }

  return {
    spec_id,
    spec_version,
    status,
    title,
    description,
    design_path,
    design_iteration,
    supersedes,
    scope,
    delta,
  };
}

/**
 * Validate a parsed spec header object and return a result with issues.
 *
 * @param {ReturnType<typeof parseSpecHeader>} parsed
 * @param {{ cwd?: string }} [options]
 * @returns {{ valid: boolean, issues: Array<{ level: 'ERROR'|'WARNING'|'INFO', field: string, message: string }> }}
 */
function validateSpecHeader(parsed, options = {}) {
  const issues = [];
  const cwd = options.cwd || process.cwd();

  if (parsed === null) {
    issues.push({
      level: 'ERROR',
      field: 'overview',
      message:
        'Spec header is missing or could not be parsed. Ensure the spec.xml has an <overview> element.',
    });
    return { valid: false, issues };
  }

  // Required fields check.
  const requiredFields = [
    ['spec_version', 'spec_version'],
    ['status', 'status'],
    ['title', 'title'],
    ['design_path', 'source/design_path'],
    ['design_iteration', 'source/design_iteration'],
  ];
  for (const [key, field] of requiredFields) {
    if (parsed[key] === null || parsed[key] === undefined) {
      issues.push({
        level: 'ERROR',
        field,
        message: `Missing required field: ${field}.`,
      });
    }
  }

  // spec_version must be a positive integer.
  if (parsed.spec_version !== null && parsed.spec_version !== undefined) {
    if (!Number.isInteger(parsed.spec_version) || parsed.spec_version < 1) {
      issues.push({
        level: 'ERROR',
        field: 'spec_version',
        message: `spec_version must be a positive integer, got: ${parsed.spec_version}.`,
      });
    }
  }

  // design_path must exist on disk.
  if (parsed.design_path) {
    const resolved = path.resolve(cwd, parsed.design_path);
    if (!fs.existsSync(resolved)) {
      issues.push({
        level: 'ERROR',
        field: 'source/design_path',
        message: `design_path does not exist: ${parsed.design_path}.`,
      });
    }
  }

  // design_iteration must be YYYY-MM-DD.
  if (parsed.design_iteration && !DATE_RE.test(parsed.design_iteration)) {
    issues.push({
      level: 'ERROR',
      field: 'source/design_iteration',
      message: `design_iteration must be in YYYY-MM-DD format, got: ${parsed.design_iteration}.`,
    });
  }

  // supersedes required for spec_version > 1.
  if (parsed.spec_version > 1) {
    if (!parsed.supersedes) {
      issues.push({
        level: 'ERROR',
        field: 'supersedes',
        message: `supersedes is required for spec_version > 1 (version ${parsed.spec_version}).`,
      });
    } else if (!SUPERSEDES_RE.test(parsed.supersedes)) {
      issues.push({
        level: 'ERROR',
        field: 'supersedes',
        message: `supersedes must match format <id>:v<n>, got: ${parsed.supersedes}.`,
      });
    }
  }

  // Warn if scope.includes is empty.
  if (parsed.scope?.includes && parsed.scope.includes.length === 0) {
    issues.push({
      level: 'WARNING',
      field: 'scope/includes',
      message: 'scope/includes is empty. Add at least one feature to the scope.',
    });
  }

  const valid = issues.every((i) => i.level !== 'ERROR');
  return { valid, issues };
}

module.exports = { parseDesignDoc, validateDesignDoc, parseSpecHeader, validateSpecHeader };
