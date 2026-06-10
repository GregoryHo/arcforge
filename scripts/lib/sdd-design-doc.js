/**
 * sdd-design-doc.js — design-doc and vision parsing/validation, plus the
 * refiner DAG-completion gate.
 *
 * Split from sdd-utils.js (decomposition per file-size limits). The schema
 * rules live HERE as the exported DESIGN_DOC_RULES constant — there is
 * exactly one source of truth and it is the code, not hand-authored markdown.
 * See fr-sd-010 / fr-sd-011. Callers import via the sdd-utils.js facade.
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

module.exports = {
  DESIGN_DOC_RULES,
  parseDesignDoc,
  validateDesignDoc,
  parseVision,
  validateVision,
  checkDagStatus,
};
