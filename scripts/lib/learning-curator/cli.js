#!/usr/bin/env node
/**
 * cli.js — Learning Curator command dispatch.
 *
 * Subcommands:
 *   assemble-batch --project <project>
 *     Layer 3: read observations, build CuratorBatch, write manifest + prompt file.
 *     Prints a single JSON line to stdout.
 *
 *   ingest-proposal --batch-id <batch_id> --response-file <path>
 *     Layer 4→5: parse LLM JSON output, validate, hand off to queue-writer.
 *     Prints a single JSON line to stdout.
 *
 *   help
 *     Print usage.
 *
 * Exit codes:
 *   0 — success
 *   1 — error (message on stderr)
 */

const { assembleBatch } = require('./batch-assembler');
const { ingestProposal, recordRunFailure } = require('./proposal-ingestor');

const ALLOWED_FAILURE_STATUSES = ['transport_error', 'timeout', 'cli_not_found'];

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

  let result;
  try {
    result = assembleBatch({ project });
  } catch (err) {
    console.error(`Error: assemble-batch failed: ${err.message}`);
    process.exit(1);
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
  const args = parseArgs(argv);
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
    result = ingestProposal({ batchId, responseFile });
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
  const args = parseArgs(argv);
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

  let result;
  try {
    result = recordRunFailure({ batchId, parseStatus, detail: detail || undefined });
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

function cmdHelp() {
  console.log(
    [
      'Usage: node scripts/lib/learning-curator/cli.js <subcommand> [options]',
      '',
      'Subcommands:',
      '  assemble-batch --project <project>',
      '    Layer 3: assemble a CuratorBatch from recent observations.',
      '    Prints JSON: { batch_id, batch_hash, manifest_path, prompt_path, project }',
      '',
      '  ingest-proposal --batch-id <batch_id> --response-file <path>',
      '    Layer 4→5: parse LLM response and ingest proposals into candidate queue.',
      '    Prints JSON: { run_id, parse_status, accepted, rejected }',
      '',
      '  record-run-failure --batch-id <batch_id> --parse-status <transport_error|timeout|cli_not_found> [--detail <msg>]',
      '    Layer 4: write a CuratorRunManifest for a daemon transport failure.',
      '    Prints JSON: { run_id, parse_status, accepted, rejected }',
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
  case 'help':
  case '--help':
  case '-h':
    cmdHelp();
    break;
  default:
    console.error(`Error: unknown subcommand "${subcommand || ''}". Run with "help" for usage.`);
    process.exit(1);
}
