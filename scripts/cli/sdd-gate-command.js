/**
 * sdd-gate-command.js — "arcforge sdd-gate <stage> ..." implementation.
 *
 * Lifts the six inline `node -e` recipes in arc-refining + arc-planning into a
 * single deterministic CLI surface. Each stage runs one SDD validator, prints
 * stable JSON, and exits 0 (proceed) / 1 (block) / 2 (usage error).
 *
 * STAGES
 *   dag        DAG completion gate (refiner Phase 1 / checkDagStatus).
 *   design     Design-doc validation (refiner Phase 2).
 *   context    Vision + ledger + spec↔decision graph gate (refiner Phase 2.5b).
 *   header     Spec identity-header validation (refiner Phase 6a / planner Phase 1).
 *              [S3-2] Emits the parsed header — spec_id, spec_version, and
 *              latest_delta {version, iteration, added[], modified[], removed[],
 *              renamed[]} — so arc-planning Phase 1 reads sprint scope from this
 *              JSON instead of its own inline `node -e`.
 *   authorize  Axis-3 mechanical authorization check (refiner Phase 6b). On block,
 *              deterministically writes specs/<spec-id>/_pending-conflict.md and
 *              emits axis_fired:'3' in the JSON.
 *   conflict   Explicit conflict-marker write (refiner Phase 4 / 5.5a / 5.5b).
 *              Reads the conflict payload as JSON on stdin.
 *
 * DRAFT INPUT (header, authorize)
 *   The draft is read from stdin (heredoc) so a block leaves zero filesystem
 *   state — eliminating the `_draft_spec.xml` disk-read contradiction.
 *   `--draft <path>` is a fallback for callers that already have the draft on
 *   disk. Each stage consumes a single XML stream — no multi-file protocol is
 *   needed — but the relevant content differs:
 *     - header reads only the <overview> block (parseSpecHeader), so the
 *       per-spec spec.xml is the right input.
 *     - authorize reads the <requirement>/<criterion>/<trace> elements
 *       (mechanicalAuthorizationCheck via extractTraceEntries). In the on-disk
 *       SDD v2 layout those live in details/*.xml, NOT in spec.xml — so the
 *       caller MUST pipe the full in-memory combined draft (overview + every
 *       requirement + every trace) it built in Phase 5 before the two-pass
 *       write splits it into spec.xml + details/. extractTraceEntries is a
 *       token-matcher, so a concatenated single stream is accepted.
 *
 * @module sdd-gate-command
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  checkDagStatus,
  parseDesignDoc,
  validateDesignDoc,
  parseVision,
  validateVision,
  parseDecisionLedger,
  getHeadLedgerContent,
  parseDecisionLedgerContent,
  validateDecisionLedger,
  checkSpecDecisionGraph,
  parseSpecHeader,
  validateSpecHeader,
  mechanicalAuthorizationCheck,
  writeConflictMarker,
} = require('../lib/sdd-utils');

const STAGES = ['dag', 'design', 'context', 'header', 'authorize', 'conflict'];

// Exit codes — stable contract for skill recipes and tests.
const EXIT_PASS = 0;
const EXIT_BLOCK = 1;
const EXIT_USAGE = 2;

/**
 * Emit a stage result as a single JSON object on stdout and exit with the
 * supplied code. Centralized so every stage shares one output shape.
 */
function emit(result, exitCode) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(exitCode);
}

/**
 * Read the draft spec.xml for stages that need it. Prefers --draft <path>;
 * otherwise reads stdin (the blessed zero-filesystem-state channel). Returns
 * null when neither is available (caller decides how to surface the usage gap).
 */
function readDraft(options) {
  if (options.draft) {
    return fs.readFileSync(path.resolve(options.draft), 'utf8');
  }
  if (!process.stdin.isTTY) {
    const stdin = fs.readFileSync(0, 'utf8');
    if (stdin.trim() !== '') {
      return stdin;
    }
  }
  return null;
}

/**
 * Resolve a path against projectRoot, returning an absolute path.
 */
function resolveIn(projectRoot, relOrAbs) {
  return path.resolve(projectRoot, relOrAbs);
}

// ---------------------------------------------------------------------------
// Stage implementations
// ---------------------------------------------------------------------------

function stageDag(specId, projectRoot) {
  const dagPath = resolveIn(projectRoot, `specs/${specId}/dag.yaml`);
  const status = checkDagStatus(dagPath);

  if (status === null) {
    // No dag.yaml — legal (refined but not yet planned). Proceed.
    return emit({ stage: 'dag', status: 'pass', dag: null }, EXIT_PASS);
  }
  if (status.incomplete === 0) {
    return emit({ stage: 'dag', status: 'pass', dag: status }, EXIT_PASS);
  }
  return emit(
    {
      stage: 'dag',
      status: 'block',
      dag: status,
      message: `${status.incomplete} of ${status.total} epics still incomplete — complete current sprint before iterating.`,
    },
    EXIT_BLOCK,
  );
}

function stageDesign(designPath, projectRoot) {
  const abs = resolveIn(projectRoot, designPath);
  const parsed = parseDesignDoc(abs);
  const result = validateDesignDoc(parsed);
  const hasError = result.issues.some((i) => i.level === 'ERROR');
  return emit(
    { stage: 'design', status: hasError ? 'block' : 'pass', ...result },
    hasError ? EXIT_BLOCK : EXIT_PASS,
  );
}

function stageContext(specId, projectRoot) {
  // Vision gate — no-op when spec vision absent.
  const productVisionPath = resolveIn(projectRoot, 'product/vision.md');
  const specVisionPath = resolveIn(projectRoot, `specs/${specId}/vision.md`);
  const productParsed = fs.existsSync(productVisionPath) ? parseVision(productVisionPath) : null;
  const specParsed = fs.existsSync(specVisionPath) ? parseVision(specVisionPath) : null;
  const visionResult = validateVision(productParsed, specParsed);
  if (!visionResult.valid) {
    return emit({ stage: 'context', status: 'block', gate: 'vision', ...visionResult }, EXIT_BLOCK);
  }

  // Ledger gate — no-op when absent.
  const ledgerPath = resolveIn(projectRoot, `specs/${specId}/decisions.yml`);
  const current = parseDecisionLedger(ledgerPath);
  if (current !== null) {
    const headContent = getHeadLedgerContent(ledgerPath, projectRoot);
    const previous = parseDecisionLedgerContent(headContent);
    const ledgerResult = validateDecisionLedger(current, previous);
    if (!ledgerResult.valid) {
      return emit(
        { stage: 'context', status: 'block', gate: 'ledger', ...ledgerResult },
        EXIT_BLOCK,
      );
    }
  }

  // Graph gate — spec↔decision↔anchor consistency. No-op when absent.
  const specXmlPath = resolveIn(projectRoot, `specs/${specId}/spec.xml`);
  const specXmlContent = fs.existsSync(specXmlPath) ? fs.readFileSync(specXmlPath, 'utf8') : null;
  const graphResult = checkSpecDecisionGraph({
    specXmlContent,
    ledger: current,
    productVision: productParsed,
    specVision: specParsed,
  });
  if (!graphResult.valid) {
    return emit({ stage: 'context', status: 'block', gate: 'graph', ...graphResult }, EXIT_BLOCK);
  }

  return emit({ stage: 'context', status: 'pass' }, EXIT_PASS);
}

/**
 * [S3-2] Project the parsed header down to the fields downstream consumers
 * (planner Phase 1 scope extraction) actually read. Keeps the JSON contract
 * stable even if parseSpecHeader grows fields.
 */
function projectHeader(parsed) {
  if (!parsed) return null;
  const d = parsed.latest_delta;
  return {
    spec_id: parsed.spec_id,
    spec_version: parsed.spec_version,
    latest_delta: d
      ? {
          version: d.version,
          iteration: d.iteration,
          added: d.added,
          modified: d.modified,
          removed: d.removed,
          renamed: d.renamed,
        }
      : null,
  };
}

function stageHeader(draftXml) {
  const parsed = parseSpecHeader(draftXml);
  const result = validateSpecHeader(parsed);
  const hasError = result.issues.some((i) => i.level === 'ERROR');
  return emit(
    {
      stage: 'header',
      status: hasError ? 'block' : 'pass',
      ...result,
      header: projectHeader(parsed),
    },
    hasError ? EXIT_BLOCK : EXIT_PASS,
  );
}

function stageAuthorize(draftXml, specId, options, projectRoot) {
  const designPath = resolveIn(projectRoot, options.design);
  const decisionLogPath = options['decision-log']
    ? resolveIn(projectRoot, options['decision-log'])
    : null;
  const ledger = parseDecisionLedger(resolveIn(projectRoot, `specs/${specId}/decisions.yml`));

  const result = mechanicalAuthorizationCheck(draftXml, designPath, decisionLogPath, ledger);

  if (result.valid) {
    return emit({ stage: 'authorize', status: 'pass' }, EXIT_PASS);
  }

  // Block: deterministically write the conflict marker (refiner Phase 6b
  // contract) so recovery state lands on disk regardless of agent behavior.
  const conflictDescription =
    'Mechanical authorization check failed: ' +
    result.unauthorized_traces.map((t) => `${t.trace_value} (${t.reason})`).join('; ');
  const conflictPath = writeConflictMarker(
    specId,
    {
      axis_fired: '3',
      conflict_description: conflictDescription,
      candidate_resolutions: [
        '(a) Add authorizing source to design.md for the flagged criterion.',
        '(b) Downgrade the criterion to SHOULD/MAY citing design qualitative phrase.',
        '(c) Remove the criterion — the axis is unbound without an authorizing source.',
      ],
      user_action_prompt: `Run /arc-brainstorming iterate ${specId} to resolve this conflict.`,
    },
    projectRoot,
  );

  return emit(
    {
      stage: 'authorize',
      status: 'block',
      axis_fired: '3',
      unauthorized_traces: result.unauthorized_traces,
      conflict_marker: conflictPath,
    },
    EXIT_BLOCK,
  );
}

function stageConflict(payloadJson, specId, projectRoot) {
  let payload;
  try {
    payload = JSON.parse(payloadJson);
  } catch (err) {
    return emit(
      {
        stage: 'conflict',
        status: 'error',
        message: `conflict stage expects a JSON payload on stdin: ${err.message}`,
      },
      EXIT_USAGE,
    );
  }
  // writeConflictMarker validates required fields and throws with context on a
  // malformed payload. Catch it here so the conflict stage honors the stable
  // JSON + exit 2 (usage) contract rather than bubbling to cli.js's plain-text
  // exit 1.
  let conflictPath;
  try {
    conflictPath = writeConflictMarker(specId, payload, projectRoot);
  } catch (err) {
    return emit({ stage: 'conflict', status: 'error', message: err.message }, EXIT_USAGE);
  }
  return emit({ stage: 'conflict', status: 'pass', conflict_marker: conflictPath }, EXIT_PASS);
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Run the sdd-gate command. Resolves the stage from positional[0] and the
 * spec-id from --spec-id, then dispatches. Each stage helper calls emit(),
 * which exits the process — so this function does not return on the happy path.
 *
 * @param {{ positional: string[], options: object }} args - Parsed CLI args.
 * @param {string} projectRoot - Absolute project root.
 */
function runSddGateCommand(args, projectRoot) {
  const stage = args.positional[0];
  const options = args.options || {};
  const specId = options['spec-id'];

  if (!stage || !STAGES.includes(stage)) {
    console.error(
      `Usage: arcforge sdd-gate <${STAGES.join('|')}> --spec-id <id> [--design <path>] [--decision-log <path>] [--draft <path>]`,
    );
    process.exit(EXIT_USAGE);
  }

  // Stages keyed on a spec-id require it; design takes a --design path instead.
  const needsSpecId = stage !== 'design';
  if (needsSpecId && (typeof specId !== 'string' || specId.trim() === '')) {
    console.error(`Error: sdd-gate ${stage} requires --spec-id <id>`);
    process.exit(EXIT_USAGE);
  }

  switch (stage) {
    case 'dag':
      return stageDag(specId, projectRoot);

    case 'design': {
      if (!options.design) {
        console.error('Error: sdd-gate design requires --design <path-to-design.md>');
        process.exit(EXIT_USAGE);
      }
      return stageDesign(options.design, projectRoot);
    }

    case 'context':
      return stageContext(specId, projectRoot);

    case 'header': {
      const draftXml = readDraft(options);
      if (draftXml === null) {
        console.error(
          'Error: sdd-gate header reads the draft spec.xml from stdin (heredoc) or --draft <path>',
        );
        process.exit(EXIT_USAGE);
      }
      return stageHeader(draftXml);
    }

    case 'authorize': {
      if (!options.design) {
        console.error('Error: sdd-gate authorize requires --design <path-to-design.md>');
        process.exit(EXIT_USAGE);
      }
      const draftXml = readDraft(options);
      if (draftXml === null) {
        console.error(
          'Error: sdd-gate authorize reads the draft spec.xml from stdin (heredoc) or --draft <path>',
        );
        process.exit(EXIT_USAGE);
      }
      return stageAuthorize(draftXml, specId, options, projectRoot);
    }

    case 'conflict': {
      if (process.stdin.isTTY) {
        console.error('Error: sdd-gate conflict reads a JSON conflict payload from stdin');
        process.exit(EXIT_USAGE);
      }
      const payloadJson = fs.readFileSync(0, 'utf8');
      return stageConflict(payloadJson, specId, projectRoot);
    }

    default:
      // Unreachable — STAGES allowlist guards above.
      process.exit(EXIT_USAGE);
  }
}

module.exports = {
  runSddGateCommand,
  STAGES,
  EXIT_PASS,
  EXIT_BLOCK,
  EXIT_USAGE,
  projectHeader,
};
