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
const { execFileSync } = require('node:child_process');
const { parseDagYaml, parseYamlSequence } = require('./yaml-parser');
const { DAG, TaskStatus } = require('./models');
const {
  PENDING_CONFLICT_RULES,
  DECISION_LOG_RULES,
  VISION_RULES,
  DECISION_LEDGER_RULES,
} = require('./sdd-rules');
const {
  parseConflictMarker,
  parseDecisionLog,
  validateDecisionLog,
  mechanicalAuthorizationCheck,
  writeConflictMarker,
} = require('./sdd-validators');

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
//
// SHAPE CONTRACT: required_fields entries follow the universal shape contract
// documented at the top of scripts/lib/sdd-rules.js. Core: {key, type}.
// SPEC_HEADER_RULES adds the `field` extension for XML wire paths (e.g.
// `source/design_path`); other rule constants without a nested wire format
// (PENDING_CONFLICT_RULES, DECISION_LOG_RULES) omit `field` and tooling
// defaults to `key`. The cross-rules invariant test
// (tests/scripts/sdd-rules-invariants.test.js) enforces conformance.
const SPEC_HEADER_RULES = Object.freeze({
  canonical_path: 'specs/<spec-id>/spec.xml',
  // Design iteration identifier: ISO date prefix + optional human-chosen suffix.
  // Valid:   2026-04-16, 2026-04-16-v2, 2026-04-16-rework, 2026-04-16-oauth-pivot
  // Invalid: april-16, 2026-04-116, v2-2026-04-16, 2026-04-16v2 (missing dash)
  design_iteration_regex: /^\d{4}-\d{2}-\d{2}(-.+)?$/,
  // supersedes format for v2+: <spec-id>:v<N>
  supersedes_regex: /^[a-z0-9-]+:v\d+$/,
  required_fields: Object.freeze([
    Object.freeze({ key: 'spec_version', field: 'spec_version', type: 'positive integer' }),
    Object.freeze({
      key: 'status',
      field: 'status',
      type: 'enum',
      allowed: Object.freeze(['active']),
    }),
    Object.freeze({ key: 'title', field: 'title', type: 'string' }),
    Object.freeze({ key: 'design_path', field: 'source/design_path', type: 'existing file path' }),
    Object.freeze({
      key: 'design_iteration',
      field: 'source/design_iteration',
      type: 'YYYY-MM-DD[-suffix]',
    }),
  ]),
  conditional_fields: Object.freeze([
    Object.freeze({ key: 'supersedes', when: 'spec_version > 1', format: '<spec-id>:v<N>' }),
  ]),
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

// PENDING_CONFLICT_RULES (fr-sd-012) and DECISION_LOG_RULES (fr-sd-013) live in
// sdd-rules.js to avoid a circular dependency with sdd-validators.js, and are
// re-exported here so the public API of sdd-utils.js is unchanged for callers.

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
  // D6 P1 T5: also captures optional decision="D-NNN" attribute for P2 audit.
  // .ref extraction is byte-identical — the [^>]* in existing regexes already
  // ignores sibling attributes; we add a second pass to extract decision.
  function extractDecision(attrsStr) {
    const m = attrsStr.match(/decision="([^"]*)"/);
    return m ? m[1] : undefined;
  }
  function parseDeltaItems(tag) {
    const results = [];
    // Self-closing: <tag ref="..." [decision="..."] />
    // group 1 = ref value, group 2 = remaining attrs (for decision= extraction)
    const selfCloseRe = new RegExp(`<${tag}\\s+ref="([^"]*)"([^>]*)\\/>`, 'g');
    for (const m of deltaBody.matchAll(selfCloseRe)) {
      const entry = { ref: m[1], text: '' };
      const dec = extractDecision(m[2]);
      if (dec !== undefined) entry.decision = dec;
      results.push(entry);
    }
    // Open/close: <tag ref="..." [decision="..."]>text</tag>
    // group 1 = ref value, group 2 = remaining attrs, group 3 = text content
    const openCloseRe = new RegExp(`<${tag}\\s+ref="([^"]*)"([^>]*)>([^<]*)</${tag}>`, 'g');
    for (const m of deltaBody.matchAll(openCloseRe)) {
      const entry = { ref: m[1], text: m[3].trim() };
      const dec = extractDecision(m[2]);
      if (dec !== undefined) entry.decision = dec;
      results.push(entry);
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

// ---------------------------------------------------------------------------
// parseVision — parse a vision.md file (product or spec tier).
// ---------------------------------------------------------------------------

/**
 * Parse a vision.md file and return structured metadata.
 *
 * Two tiers are supported:
 *   type: 'product' — product/vision.md. Extracts P-n principle identifiers.
 *   type: 'spec'    — specs/<id>/vision.md. Extracts principle_ref values.
 *
 * Vision files are date-less and outside DESIGN_DOC_RULES.path_regex —
 * validateDesignDoc never touches these paths.
 *
 * @param {string} filePath - Absolute path to the vision.md file.
 * @param {{ type?: 'product'|'spec' }} [options]
 * @returns {{ principles?: string[], principle_refs?: string[] } | null}
 *   Returns null if the file does not exist.
 */
function parseVision(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf8');

  const type = options.type || 'product';

  if (type === 'product') {
    // Extract P-n identifiers: lines like "P-1.", "P-2:", "P-1 " etc.
    const principles = [];
    for (const m of content.matchAll(/^(P-\d+)/gm)) {
      const id = m[1];
      if (!principles.includes(id)) {
        principles.push(id);
      }
    }
    return { type: 'product', principles };
  }

  // type === 'spec': extract principle_ref values.
  const principle_refs = [];
  for (const m of content.matchAll(/^principle_ref:\s*(P-\d+)/gm)) {
    const ref = m[1];
    if (!principle_refs.includes(ref)) {
      principle_refs.push(ref);
    }
  }
  return { type: 'spec', principle_refs };
}

// ---------------------------------------------------------------------------
// validateVision — cross-file two-layer validation (pure function).
// ---------------------------------------------------------------------------

/**
 * Validate per-spec vision against product vision — verify every principle_ref
 * in the spec resolves to a P-n present in product/vision.md.
 *
 * This is a PURE function: it takes already-parsed results from parseVision
 * rather than file paths. The caller is responsible for loading and parsing;
 * this design mirrors the T3 seam (validateDecisionLedger is also pure).
 *
 * Absent-file contracts:
 *   - productParsed === null, specParsed has principle_refs → ERROR (unresolvable).
 *   - productParsed === null, specParsed has no principle_refs → PASS (nothing to resolve).
 *   - specParsed === null → PASS (per-spec vision is optional; absence is benign).
 *
 * @param {{ principles: string[] } | null} productParsed - Parsed product/vision.md,
 *   or null if the file is absent.
 * @param {{ principle_refs: string[] } | null} specParsed - Parsed specs/<id>/vision.md,
 *   or null if the file is absent.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateVision(productParsed, specParsed) {
  // Per-spec vision absent → benign.
  if (specParsed === null) {
    return { valid: true, errors: [] };
  }

  const refs = specParsed.principle_refs || [];

  // No refs to resolve → benign (regardless of product vision presence).
  if (refs.length === 0) {
    return { valid: true, errors: [] };
  }

  // Refs present but product vision absent → refs are unresolvable.
  if (productParsed === null) {
    return {
      valid: false,
      errors: [
        `product/vision.md is absent but spec has principle_ref(s) [${refs.join(', ')}] that cannot be resolved.`,
      ],
    };
  }

  const productPrinciples = new Set(productParsed.principles || []);
  const errors = [];
  for (const ref of refs) {
    if (!productPrinciples.has(ref)) {
      errors.push(
        `principle_ref "${ref}" in spec vision does not exist in product/vision.md (known: ${[...productPrinciples].join(', ') || 'none'}).`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
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
  // Schema rule constants — SoT for downstream schema consumers (print-schema.js,
  // tests). Exported so drift between code and docs is impossible by construction.
  DESIGN_DOC_RULES,
  SPEC_HEADER_RULES,
  PENDING_CONFLICT_RULES,
  DECISION_LOG_RULES,
  // D6 P1 new constants — re-exported from sdd-rules.js (canonical source).
  // print-schema.js, invariants tests, and validators import from here (facade).
  VISION_RULES,
  DECISION_LEDGER_RULES,
  // D6 P1 new parsers/validators — vision and decision ledger.
  parseVision,
  validateVision,
  parseDecisionLedgerContent,
  parseDecisionLedger,
  validateDecisionLedger,
  getHeadLedgerContent,
  // Parsers / validators.
  parseDesignDoc,
  validateDesignDoc,
  parseSpecHeader,
  validateSpecHeader,
  checkDagStatus,
  // fr-sd-014: conflict/decision-log parsers + mechanical auth check.
  // Implemented in sdd-validators.js; re-exported here for a unified API surface.
  parseConflictMarker,
  parseDecisionLog,
  validateDecisionLog,
  mechanicalAuthorizationCheck,
  // fr-rf-015: conflict marker writer — called by refiner on R3 axis-1/2/3 block.
  writeConflictMarker,
  // D6 P2: spec↔decision↔anchor graph audit (S10 shared lib helper).
  checkSpecDecisionGraph,
  // D6 P3: B1 loop sentinel — canonical export for ratify-command + hook.
  LOOP_SENTINEL,
  loopSentinelPresent,
};
