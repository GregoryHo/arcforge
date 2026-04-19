/**
 * sdd-utils.js — Spec-Driven Development utility functions.
 *
 * Provides deterministic validation helpers for design docs and spec headers.
 * The schema rules live HERE as exported constants (DESIGN_DOC_RULES and
 * SPEC_HEADER_RULES). Validators, tests, and the print-schema CLI all read
 * from those constants — there is exactly one source of truth and it is
 * the code, not hand-authored markdown. See fr-sd-010 / fr-sd-011.
 */

const fs = require('node:fs');
const path = require('node:path');
const { parseDagYaml } = require('./yaml-parser');
const { DAG, TaskStatus } = require('./models');

// -----------------------------------------------------------------------------
// DESIGN_DOC_RULES — single source of truth for design-doc schema.
// -----------------------------------------------------------------------------
// parseDesignDoc + validateDesignDoc read from this object; print-schema.js
// imports it to produce human-readable or JSON schema output. Any new rule for
// design docs is added HERE — never in hand-authored markdown or skill templates.
// Drift between this object and downstream consumers is caught by the
// schema-consistency tests (see tests/scripts/sdd-utils.test.js).
const DESIGN_DOC_RULES = Object.freeze({
  canonical_path: 'docs/plans/<spec-id>/<YYYY-MM-DD>[-suffix]/design.md',
  // Matches: .../docs/plans/<spec-id>/<YYYY-MM-DD>[optional-suffix]/design.md
  path_regex: /docs\/plans\/([^/]+)\/(\d{4}-\d{2}-\d{2}(?:-[^/]+)?)\/design\.md$/,
  substantive_min_chars: 50,
  // Section heading detection. Word-boundary after the keyword so "## Context
  // (from spec v1)" and "## Context — 2026-04-19" both match, while a prefix
  // word like "## Contextual Factors" does not.
  section_regex: {
    Context: /^#+\s+Context\b[^\n]*$/im,
    ChangeIntent: /^#+\s+Change\s+Intent\b[^\n]*$/im,
  },
  // When specs/<spec-id>/spec.xml exists (hasPriorSpec), the iteration shape applies.
  iteration: {
    description:
      'When a prior spec exists, the design doc carries Context + Change Intent sections. Refiner derives the <delta> from narrative; no pre-authored diff section is permitted.',
    required_sections: ['Context', 'Change Intent'],
    recommended_sections: ['Architecture Impact'],
    forbidden_section_keywords: ['Added', 'Modified', 'Removed', 'Renamed', 'Delta'],
  },
  // When no prior spec.xml exists, the initial shape applies.
  initial: {
    description:
      'When no prior spec exists, the design doc carries prose covering problem, solution, requirements, and scope. No mandatory section headings — refiner extracts from prose.',
    required_prose_elements: [
      'problem / motivation',
      'proposed solution / architecture',
      'identifiable requirements (in prose)',
      'scope declaration (includes + excludes)',
    ],
  },
  // One behavior, filesystem-determined. There are no "modes" in the refiner —
  // the shape of the expected content is conditional on prior-spec presence.
  shape_is_mode: false,
});

/**
 * Parse a design doc at filePath and return structured metadata.
 *
 * @param {string} filePath - Absolute or relative path to the design.md file.
 * @param {{ cwd?: string }} [options]
 * @returns {{ spec_id: string, iteration: string, hasPriorSpec: boolean,
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
  const match = normalizedPath.match(DESIGN_DOC_RULES.path_regex);
  if (!match) {
    return null;
  }

  const spec_id = match[1];
  const iteration = match[2];

  // Filesystem state — does a prior spec.xml already exist for this spec-id?
  // This is a single filesystem fact, not a "mode" selector.
  const specXmlPath = path.join(cwd, 'specs', spec_id, 'spec.xml');
  const hasPriorSpec = fs.existsSync(specXmlPath);

  const content = fs.readFileSync(filePath, 'utf8');

  // Heading detection via the schema's section_regex (tolerates trailing suffix
  // text like "(from spec v1)" while rejecting prefix words like "Contextual").
  const hasContext = DESIGN_DOC_RULES.section_regex.Context.test(content);
  const hasChangeIntent = DESIGN_DOC_RULES.section_regex.ChangeIntent.test(content);

  // Substantive content: strip heading lines, check remaining non-whitespace length.
  const nonHeadingContent = content
    .split('\n')
    .filter((line) => !/^#+\s/.test(line))
    .join('\n');
  const hasSubstantiveContent =
    nonHeadingContent.replace(/\s+/g, '').length >= DESIGN_DOC_RULES.substantive_min_chars;

  // When a prior spec exists, read its recorded design_iteration for stale-date check.
  let specDesignIteration = null;
  if (hasPriorSpec) {
    try {
      const specXmlContent = fs.readFileSync(specXmlPath, 'utf8');
      const diMatch = specXmlContent.match(/<design_iteration>([^<]+)<\/design_iteration>/);
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
    hasPriorSpec,
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

  if (parsed.hasPriorSpec) {
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

// -----------------------------------------------------------------------------
// SPEC_HEADER_RULES — single source of truth for spec.xml identity-header schema.
// -----------------------------------------------------------------------------
// parseSpecHeader + validateSpecHeader read from this object; print-schema.js
// imports it to render the spec schema for humans and LLMs. Any new rule goes
// HERE — never in hand-authored markdown or skill templates.
const SPEC_HEADER_RULES = Object.freeze({
  canonical_path: 'specs/<spec-id>/spec.xml',
  // Design iteration identifier: ISO date prefix + optional human-chosen suffix.
  // Valid:   2026-04-16, 2026-04-16-v2, 2026-04-16-rework, 2026-04-16-oauth-pivot
  // Invalid: april-16, 2026-04-116, v2-2026-04-16, 2026-04-16v2 (missing dash)
  design_iteration_regex: /^\d{4}-\d{2}-\d{2}(-.+)?$/,
  // supersedes format for v2+: <spec-id>:v<N>
  supersedes_regex: /^[a-z0-9-]+:v\d+$/,
  required_fields: [
    { key: 'spec_version', field: 'spec_version', type: 'positive integer' },
    { key: 'status', field: 'status', type: 'enum', allowed: ['active'] },
    { key: 'title', field: 'title', type: 'string' },
    { key: 'design_path', field: 'source/design_path', type: 'existing file path' },
    { key: 'design_iteration', field: 'source/design_iteration', type: 'YYYY-MM-DD[-suffix]' },
  ],
  conditional_fields: [{ key: 'supersedes', when: 'spec_version > 1', format: '<spec-id>:v<N>' }],
  scope: {
    includes: 'required; list of <feature id="..."> elements (empty = WARNING)',
    excludes: 'recommended; list of <reason> elements',
  },
  delta: {
    required_when: 'spec_version > 1',
    placement: 'children of <overview>, appended each iteration, never overwritten',
    ordering: 'ascending by version attribute, strictly unique',
    last_delta_invariants: {
      version: 'MUST equal current spec_version',
      iteration: 'MUST equal current source/design_iteration',
    },
    child_element_rules: {
      added: 'ref MUST correspond to a current <requirement id>',
      modified: 'ref MUST correspond to a current <requirement id>',
      removed:
        'ref refers to a now-deleted requirement; MUST include <reason> child; optional <migration>',
      renamed:
        'MUST have both ref_old and ref_new attributes; body unchanged (semantic changes use removed+added)',
    },
  },
});

/**
 * Parse a spec XML string and return a structured header object.
 *
 * The `<overview>` element may contain 0..N `<delta>` children, accumulated
 * across spec iterations (wiki-style). Returned `deltas` are ordered ascending
 * by `version`. `latest_delta` is the last delta (highest version) or null
 * when no deltas are present (v1 specs).
 *
 * @param {string} specXmlContent - Raw XML string from spec.xml.
 * @returns {{ spec_id: string, spec_version: number,
 *   spec_version_raw: string|null,
 *   status: string, title: string,
 *   description: string, design_path: string, design_iteration: string,
 *   supersedes: string|null,
 *   scope: { includes: Array<{id: string, description: string}>, excludes: string[] },
 *   deltas: Array<{ version: string, iteration: string,
 *     added: Array<{ref: string, text: string}>,
 *     modified: Array<{ref: string, text: string}>,
 *     removed: Array<{ref: string, reason: string, migration: string, text: string}>,
 *     renamed: Array<{ref_old: string, ref_new: string, reason: string}> }>,
 *   latest_delta: object|null } | null}
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
  // Strict-digit match before conversion: parseInt silently coerces "2a" → 2
  // and "2.5" → 2, letting malformed versions pass downstream checks. Require
  // ^\d+$ before parseInt; surface NaN (not a coerced digit) for validator to
  // flag. `spec_version_raw` is exposed so the validator can name the raw
  // token in its error message rather than printing "got: NaN".
  const specVersionRaw = extract('spec_version');
  const spec_version =
    typeof specVersionRaw === 'string' && specVersionRaw.length > 0
      ? /^\d+$/.test(specVersionRaw)
        ? parseInt(specVersionRaw, 10)
        : NaN
      : null;
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

  // Extract all <delta> blocks from <overview> in source order. Each
  // iteration appends one; refiner never overwrites prior deltas. We do
  // NOT sort here — validateSpecHeader needs source order to detect
  // ordering violations. `latest_delta` is the last in source, which equals
  // the highest-version delta in any well-formed spec.
  const deltas = [];
  const deltaRe = /<delta\s+([^>]*)>([\s\S]*?)<\/delta>/g;
  for (const dm of overview.matchAll(deltaRe)) {
    deltas.push(parseSingleDelta(dm[1], dm[2]));
  }

  const latest_delta = deltas.length > 0 ? deltas[deltas.length - 1] : null;

  return {
    spec_id,
    spec_version,
    spec_version_raw: specVersionRaw,
    status,
    title,
    description,
    design_path,
    design_iteration,
    supersedes,
    scope,
    deltas,
    latest_delta,
  };
}

// Parse the body of a single <delta attrs>body</delta> into the structured
// shape used elsewhere in this module. Pulled out so parseSpecHeader can call
// it once per delta block found in <overview>.
function parseSingleDelta(attrsStr, deltaBody) {
  const versionAttr = attrsStr.match(/version="([^"]*)"/);
  const iterationAttr = attrsStr.match(/iteration="([^"]*)"/);

  // Parse <added>/<modified> entries. Supports both shapes the schema
  // documents:
  //   Self-closing:  <added ref="x" />
  //   Text content:  <added ref="x">Short description</added>
  function parseDeltaItems(tag) {
    const results = [];
    const selfCloseRe = new RegExp(`<${tag}\\s+ref="([^"]*)"[^>]*\\/>`, 'g');
    for (const m of deltaBody.matchAll(selfCloseRe)) {
      results.push({ ref: m[1], text: '' });
    }
    const openCloseRe = new RegExp(`<${tag}\\s+ref="([^"]*)"[^>]*>([^<]*)</${tag}>`, 'g');
    for (const m of deltaBody.matchAll(openCloseRe)) {
      results.push({ ref: m[1], text: m[2].trim() });
    }
    return results;
  }

  // Parse <removed> entries — three supported formats:
  //   1. Self-closing:  <removed ref="x" />
  //   2. Text content: <removed ref="x">Free text explanation</removed>
  //   3. Structured:   <removed ref="x"><reason>...</reason><migration>...</migration></removed>
  // Returns entries with { ref, reason, migration, text } for all formats.
  function parseRemovedItems() {
    const results = [];
    const selfCloseRe = /<removed\s+ref="([^"]*)"[^>]*\/>/g;
    for (const m of deltaBody.matchAll(selfCloseRe)) {
      results.push({ ref: m[1], reason: '', migration: '', text: '' });
    }
    const openCloseRe = /<removed\s+ref="([^"]*)"[^>]*>([\s\S]*?)<\/removed>/g;
    for (const m of deltaBody.matchAll(openCloseRe)) {
      const ref = m[1];
      const inner = m[2];
      const reasonMatch = inner.match(/<reason>([^<]*)<\/reason>/);
      const migrationMatch = inner.match(/<migration>([^<]*)<\/migration>/);
      if (reasonMatch || migrationMatch) {
        results.push({
          ref,
          reason: reasonMatch ? reasonMatch[1].trim() : '',
          migration: migrationMatch ? migrationMatch[1].trim() : '',
          text: '',
        });
      } else {
        const text = inner.trim();
        results.push({ ref, reason: text, migration: '', text });
      }
    }
    return results;
  }

  // Parse <renamed> entries (self-closing or open/close with optional <reason>).
  function parseRenamedItems() {
    const results = [];
    const selfCloseRe = /<renamed\s+([^>]*?)\/>/g;
    for (const m of deltaBody.matchAll(selfCloseRe)) {
      const attrs = m[1];
      const refOldMatch = attrs.match(/ref_old="([^"]*)"/);
      const refNewMatch = attrs.match(/ref_new="([^"]*)"/);
      results.push({
        ref_old: refOldMatch ? refOldMatch[1] : '',
        ref_new: refNewMatch ? refNewMatch[1] : '',
        reason: '',
      });
    }
    const openCloseRe = /<renamed\s+([^>]*)>([\s\S]*?)<\/renamed>/g;
    for (const m of deltaBody.matchAll(openCloseRe)) {
      const attrs = m[1];
      const inner = m[2];
      const refOldMatch = attrs.match(/ref_old="([^"]*)"/);
      const refNewMatch = attrs.match(/ref_new="([^"]*)"/);
      const reasonMatch = inner.match(/<reason>([^<]*)<\/reason>/);
      results.push({
        ref_old: refOldMatch ? refOldMatch[1] : '',
        ref_new: refNewMatch ? refNewMatch[1] : '',
        reason: reasonMatch ? reasonMatch[1].trim() : '',
      });
    }
    return results;
  }

  return {
    version: versionAttr ? versionAttr[1] : null,
    iteration: iterationAttr ? iterationAttr[1] : null,
    added: parseDeltaItems('added'),
    modified: parseDeltaItems('modified'),
    removed: parseRemovedItems(),
    renamed: parseRenamedItems(),
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

  // Required fields check. Empty/whitespace-only strings count as missing —
  // parseSpecHeader returns "" (trimmed) for <title></title> etc., so a
  // null-only check would let malformed identity headers pass.
  const requiredFields = [
    ['spec_version', 'spec_version'],
    ['status', 'status'],
    ['title', 'title'],
    ['design_path', 'source/design_path'],
    ['design_iteration', 'source/design_iteration'],
  ];
  for (const [key, field] of requiredFields) {
    const value = parsed[key];
    const isMissing =
      value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
    if (isMissing) {
      issues.push({
        level: 'ERROR',
        field,
        message: `Missing required field: ${field}.`,
      });
    }
  }

  // spec_version must be a positive integer. parseSpecHeader surfaces NaN
  // when the raw string isn't strictly digits, null when the tag is missing
  // or empty (required-field check above catches null). NaN and sub-1
  // integers fall through to here.
  if (parsed.spec_version !== null && parsed.spec_version !== undefined) {
    if (!Number.isInteger(parsed.spec_version) || parsed.spec_version < 1) {
      const shown = JSON.stringify(parsed.spec_version_raw ?? parsed.spec_version);
      issues.push({
        level: 'ERROR',
        field: 'spec_version',
        message: `spec_version must be a positive integer, got: ${shown}.`,
      });
    }
  }

  // Enum-constrained fields: check any required_fields entry with an `allowed`
  // list against the parsed value. SPEC_HEADER_RULES is the single source of
  // truth — adding a new enum value in one place propagates here.
  for (const rule of SPEC_HEADER_RULES.required_fields) {
    if (!rule.allowed) continue;
    const value = parsed[rule.key];
    if (typeof value !== 'string' || value.trim() === '') continue; // handled by required check
    if (!rule.allowed.includes(value)) {
      issues.push({
        level: 'ERROR',
        field: rule.field,
        message: `${rule.field} must be one of ${JSON.stringify(rule.allowed)}, got: ${JSON.stringify(value)}.`,
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

  // design_iteration must start with YYYY-MM-DD (optional suffix after a "-" separator).
  if (parsed.design_iteration !== null && parsed.design_iteration !== undefined) {
    if (!SPEC_HEADER_RULES.design_iteration_regex.test(parsed.design_iteration)) {
      issues.push({
        level: 'ERROR',
        field: 'source/design_iteration',
        message: `design_iteration must start with YYYY-MM-DD and may include an optional "-"-separated suffix (e.g., "2026-04-16" or "2026-04-16-v2"), got: ${parsed.design_iteration}.`,
      });
    }
  }

  // supersedes required for spec_version > 1.
  if (parsed.spec_version > 1) {
    if (!parsed.supersedes) {
      issues.push({
        level: 'ERROR',
        field: 'supersedes',
        message: `supersedes is required for spec_version > 1 (version ${parsed.spec_version}).`,
      });
    } else if (!SPEC_HEADER_RULES.supersedes_regex.test(parsed.supersedes)) {
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

  // Multi-delta rules. <overview> may contain 0..N <delta> children; refiner
  // appends one per iteration and never overwrites prior deltas. The last
  // delta is the current sprint's; earlier deltas are historical record.

  const deltas = parsed.deltas || [];

  // (a) v2+ requires at least one <delta>. v1 has none by design.
  if (parsed.spec_version > 1 && deltas.length === 0) {
    issues.push({
      level: 'ERROR',
      field: 'deltas',
      message: `spec_version ${parsed.spec_version} must include at least one <delta> element. v1 specs have no delta; v2+ specs accumulate one per iteration.`,
    });
  }

  // (a.1) Every delta's version must be a non-negative integer string.
  // Catches malformed attributes like `version="abc"` or `version="3.0"`
  // that would otherwise slip through: the ordering loop below skips
  // single-delta specs (i starts at 1), and the latest-version equality
  // check at (c) explicitly guards on !Number.isNaN. Without this,
  // <delta version="abc"> in a single-delta spec passes cleanly.
  for (const [idx, d] of deltas.entries()) {
    const raw = d.version;
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
      issues.push({
        level: 'ERROR',
        field: `deltas[${idx}]/version`,
        message: `<delta version="${raw ?? ''}"> must be a non-negative integer (got ${JSON.stringify(raw)}).`,
      });
    }
  }

  // (b) Strictly ascending by version. Catches both wrong order and duplicates.
  for (let i = 1; i < deltas.length; i++) {
    const prevVer = Number.parseInt(deltas[i - 1].version, 10);
    const currVer = Number.parseInt(deltas[i].version, 10);
    if (Number.isNaN(prevVer) || Number.isNaN(currVer) || currVer <= prevVer) {
      issues.push({
        level: 'ERROR',
        field: 'deltas/order',
        message: `<delta> children must be ordered ascending by unique version. Found "${deltas[i - 1].version}" before "${deltas[i].version}".`,
      });
    }
  }

  // (c) Last delta's version must equal current spec_version.
  if (deltas.length > 0 && parsed.spec_version !== null && parsed.spec_version !== undefined) {
    const last = deltas[deltas.length - 1];
    const lastVer = Number.parseInt(last.version, 10);
    if (!Number.isNaN(lastVer) && lastVer !== parsed.spec_version) {
      issues.push({
        level: 'ERROR',
        field: 'deltas/latest/version',
        message: `Last <delta> version "${last.version}" must equal current spec_version ${parsed.spec_version}. Earlier deltas keep their original (lower) version values.`,
      });
    }
  }

  // (d) Last delta's iteration must equal current source/design_iteration.
  // Earlier deltas keep their original iteration values — not checked here.
  if (deltas.length > 0 && parsed.design_iteration) {
    const last = deltas[deltas.length - 1];
    if (last.iteration !== parsed.design_iteration) {
      issues.push({
        level: 'ERROR',
        field: 'deltas/latest/iteration',
        message: `Last <delta> iteration "${last.iteration}" must equal source/design_iteration "${parsed.design_iteration}".`,
      });
    }
  }

  // (e) Per-child correctness: applies to every delta (historical and current).
  // A spec with malformed historical entries is malformed — the validator
  // reports it so it can be repaired.
  for (const d of deltas) {
    for (const rem of d.removed || []) {
      if (!rem.reason && !rem.text) {
        issues.push({
          level: 'ERROR',
          field: 'deltas/removed',
          message: `removed requirement '${rem.ref}' (delta v${d.version}) MUST include a <reason> explaining why the requirement was removed.`,
        });
      }
    }
    for (const ren of d.renamed || []) {
      if (!ren.ref_old) {
        issues.push({
          level: 'ERROR',
          field: 'deltas/renamed',
          message: `renamed entry (delta v${d.version}) is missing ref_old — both ref_old and ref_new are required.`,
        });
      }
      if (!ren.ref_new) {
        issues.push({
          level: 'ERROR',
          field: 'deltas/renamed',
          message: `renamed entry (delta v${d.version}) is missing ref_new — both ref_old and ref_new are required.`,
        });
      }
    }
  }

  const valid = issues.every((i) => i.level !== 'ERROR');
  return { valid, issues };
}

/**
 * Check completion status of a sprint's dag.yaml.
 *
 * Used by the refiner's DAG completion gate (per fr-rf-012) to decide whether
 * to allow a new iteration. Returns null when the file does not exist — refiner
 * treats that as "no prior sprint to be incomplete; proceed".
 *
 * @param {string} dagYamlPath - Path to the dag.yaml file (typically
 *   `specs/<spec-id>/dag.yaml`).
 * @returns {{ total: number, completed: number, incomplete: number,
 *   incompleteEpics: Array<{id: string, status: string}> } | null} Null if
 *   the file does not exist; otherwise counts plus the incomplete epic list.
 */
function checkDagStatus(dagYamlPath) {
  if (!fs.existsSync(dagYamlPath)) {
    return null;
  }
  const content = fs.readFileSync(dagYamlPath, 'utf8');
  const dag = DAG.fromObject(parseDagYaml(content));

  const total = dag.epics.length;
  const completedEpics = dag.epics.filter((e) => e.status === TaskStatus.COMPLETED);
  const incompleteList = dag.epics
    .filter((e) => e.status !== TaskStatus.COMPLETED)
    .map((e) => ({ id: e.id, status: e.status }));

  return {
    total,
    completed: completedEpics.length,
    incomplete: incompleteList.length,
    incompleteEpics: incompleteList,
  };
}

module.exports = {
  // Schema rule constants — SoT for downstream schema consumers (print-schema.js,
  // tests). Exported so drift between code and docs is impossible by construction.
  DESIGN_DOC_RULES,
  SPEC_HEADER_RULES,
  // Parsers / validators.
  parseDesignDoc,
  validateDesignDoc,
  parseSpecHeader,
  validateSpecHeader,
  checkDagStatus,
};
