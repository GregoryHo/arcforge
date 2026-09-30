#!/usr/bin/env node
/**
 * cli.js — Learning Curator command dispatch.
 *
 * Subcommands:
 *   assemble-batch --project <project> [--since <iso>] [--min-observations <n>]
 *     Layer 3: read observations, build CuratorBatch, write manifest + prompt file.
 *     Prints a single JSON line to stdout. With --since only observations whose
 *     ts is at or after it are read; with fewer than --min-observations of them
 *     nothing is written and it exits 3.
 *
 *   ingest-proposal --batch-id <batch_id> --response-file <path> -- <claude argv...>
 *     Layer 4→5: parse LLM JSON output, validate, hand off to queue-writer.
 *     Everything after `--` is the argv the curator's `claude` run used; the
 *     run manifest's tool_access is derived from it, so it is required.
 *     Prints a single JSON line to stdout.
 *
 *   learning-enabled --project <project>
 *     Whether learning is enabled for the project whose observations are filed
 *     under <project> (learning B-1), and since when. Prints JSON
 *     { project, enabled, enabled_since }; exits 0 when enabled, 3 when not, 1
 *     on error. The observer daemon asks this before analyzing, and analyzes
 *     only observations recorded at or after enabled_since.
 *
 *   help
 *     Print usage.
 *
 * Exit codes:
 *   0 — success
 *   1 — error (message on stderr)
 */

const { assembleBatch } = require('./batch-assembler');
const {
  FAILURE_TRANSPORT_STATUSES,
  ingestProposal,
  recordRunFailure,
} = require('./proposal-ingestor');
const { learningEnabledSinceForProject } = require('../learning');

// Spec layer-4 §parse_status enum for daemon-side failures.
// CLI-binary-missing maps to transport_error with detail carrying the reason.
const ALLOWED_FAILURE_STATUSES = ['transport_error', 'timeout'];

// ---------------------------------------------------------------------------
// Arg parser — minimal, no external deps
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i += 2;
      } else {
        args[key] = true;
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

function cmdAssembleBatch(argv) {
  const args = parseArgs(argv);
  const project = args.project;
  if (!project || typeof project !== 'string') {
    console.error('Error: --project <project> is required for assemble-batch');
    process.exit(1);
  }

  // Both flags gate what reaches the model (learning B-1), so a flag given
  // without a usable value is refused rather than dropped — dropping --since
  // would build a batch with no opt-in filter at all.
  let minObservations;
  const rawMin = args['min-observations'];
  if (rawMin !== undefined) {
    if (typeof rawMin !== 'string' || !/^\d+$/.test(rawMin)) {
      console.error(
        `Error: --min-observations must be a non-negative integer (got ${JSON.stringify(rawMin)})`,
      );
      process.exit(1);
    }
    minObservations = Number(rawMin);
  }
  const since = args.since;
  if (since !== undefined && (typeof since !== 'string' || Number.isNaN(Date.parse(since)))) {
    console.error(`Error: --since must be an ISO timestamp (got ${JSON.stringify(since)})`);
    process.exit(1);
  }

  let result;
  try {
    result = assembleBatch({ project, since, minObservations });
  } catch (err) {
    console.error(`Error: assemble-batch failed: ${err.message}`);
    process.exit(1);
  }

  // Too few observations recorded since the opt-in: nothing was written.
  if (result.skipped) {
    console.log(JSON.stringify(result));
    process.exit(3);
  }

  // Print exactly one JSON line to stdout
  console.log(
    JSON.stringify({
      batch_id: result.batch_id,
      batch_hash: result.batch_hash,
      manifest_path: result.manifest_path,
      prompt_path: result.prompt_path,
      project: result.project,
    }),
  );
}

function cmdIngestProposal(argv) {
  const separator = argv.indexOf('--');
  const curatorArgv = separator === -1 ? undefined : argv.slice(separator + 1);
  const args = parseArgs(separator === -1 ? argv : argv.slice(0, separator));
  const batchId = args['batch-id'];
  const responseFile = args['response-file'];

  if (!batchId || typeof batchId !== 'string') {
    console.error('Error: --batch-id <batch_id> is required for ingest-proposal');
    process.exit(1);
  }
  if (!responseFile || typeof responseFile !== 'string') {
    console.error('Error: --response-file <path> is required for ingest-proposal');
    process.exit(1);
  }

  let result;
  try {
    result = ingestProposal({ batchId, responseFile, curatorArgv });
  } catch (err) {
    console.error(`Error: ingest-proposal failed: ${err.message}`);
    process.exit(1);
  }

  // Print exactly one JSON line to stdout
  console.log(
    JSON.stringify({
      run_id: result.run_id,
      parse_status: result.parse_status,
      accepted: result.accepted,
      rejected: result.rejected,
    }),
  );
}

function cmdRecordRunFailure(argv) {
  const separator = argv.indexOf('--');
  const curatorArgv = separator === -1 ? undefined : argv.slice(separator + 1);
  const args = parseArgs(separator === -1 ? argv : argv.slice(0, separator));
  const batchId = args['batch-id'];
  const parseStatus = args['parse-status'];
  const detail = args.detail || null;

  if (!batchId || typeof batchId !== 'string') {
    console.error('Error: --batch-id <batch_id> is required for record-run-failure');
    process.exit(1);
  }
  if (!parseStatus || typeof parseStatus !== 'string') {
    console.error('Error: --parse-status <status> is required for record-run-failure');
    process.exit(1);
  }
  if (!ALLOWED_FAILURE_STATUSES.includes(parseStatus)) {
    console.error(
      `Error: --parse-status "${parseStatus}" is not allowed. Allowed values: ${ALLOWED_FAILURE_STATUSES.join(', ')}`,
    );
    process.exit(1);
  }

  const transportStatus = args['transport-status'] ?? parseStatus;
  if (!FAILURE_TRANSPORT_STATUSES.includes(transportStatus)) {
    console.error(
      `Error: --transport-status must be one of ${FAILURE_TRANSPORT_STATUSES.join(', ')} (got ${JSON.stringify(transportStatus)})`,
    );
    process.exit(1);
  }

  let result;
  try {
    result = recordRunFailure({
      batchId,
      parseStatus,
      transportStatus,
      detail: detail || undefined,
      curatorArgv,
    });
  } catch (err) {
    console.error(`Error: record-run-failure failed: ${err.message}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      run_id: result.run_id,
      parse_status: result.parse_status,
      accepted: result.accepted,
      rejected: result.rejected,
    }),
  );
}

function cmdLearningEnabled(argv) {
  const args = parseArgs(argv);
  const project = args.project;
  if (!project || typeof project !== 'string') {
    console.error('Error: --project <project> is required for learning-enabled');
    process.exit(1);
  }

  let since;
  try {
    since = learningEnabledSinceForProject(project);
  } catch (err) {
    console.error(`Error: learning-enabled failed: ${err.message}`);
    process.exit(1);
  }

  const enabled = since !== null;
  const enabledSince = enabled ? new Date(since).toISOString() : null;
  console.log(JSON.stringify({ project, enabled, enabled_since: enabledSince }));
  process.exit(enabled ? 0 : 3);
}

function cmdHelp() {
  console.log(
    [
      'Usage: node scripts/lib/learning-curator/cli.js <subcommand> [options]',
      '',
      'Subcommands:',
      '  assemble-batch --project <project> [--since <iso>] [--min-observations <n>]',
      '    Layer 3: assemble a CuratorBatch from recent observations.',
      '    Prints JSON: { batch_id, batch_hash, manifest_path, prompt_path, project }',
      '',
      '  ingest-proposal --batch-id <batch_id> --response-file <path> -- <claude argv...>',
      '    Layer 4→5: parse LLM response and ingest proposals into candidate queue.',
      "    The argv after -- (required) is the curator run's; it decides the manifest's tool_access.",
      '    Prints JSON: { run_id, parse_status, accepted, rejected }',
      '',
      '  record-run-failure --batch-id <batch_id> --parse-status <transport_error|timeout> [--transport-status <timeout|transport_error|cancelled>] [--detail <msg>] -- <claude argv...>',
      '    Layer 4: write a CuratorRunManifest for a daemon transport failure.',
      '    Prints JSON: { run_id, parse_status, accepted, rejected }',
      '',
      '  learning-enabled --project <project>',
      '    Whether learning is enabled for <project>. Exits 0 enabled, 3 not, 1 on error.',
      '',
      '  help',
      '    Print this message.',
    ].join('\n'),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const subcommand = process.argv[2];
const remainingArgs = process.argv.slice(3);

switch (subcommand) {
  case 'assemble-batch':
    cmdAssembleBatch(remainingArgs);
    break;
  case 'ingest-proposal':
    cmdIngestProposal(remainingArgs);
    break;
  case 'record-run-failure':
    cmdRecordRunFailure(remainingArgs);
    break;
  case 'learning-enabled':
    cmdLearningEnabled(remainingArgs);
    break;
  case 'help':
  case '--help':
  case '-h':
    cmdHelp();
    break;
  default:
    console.error(`Error: unknown subcommand "${subcommand || ''}". Run with "help" for usage.`);
    process.exit(1);
}
