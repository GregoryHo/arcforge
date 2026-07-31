/**
 * loop-command.js - Handler for the `arcforge loop` CLI command.
 *
 * Owns flag parsing/validation for the autonomous loop and nothing else; the
 * loop itself lives in scripts/loop.js. Kept out of dag-commands.js because the
 * loop's task source is the D3 task list, not a DAG — it shares no state with
 * the coordinator commands.
 */

const { parseVerifyCommand } = require('../lib/loop-verify');
const { DEFAULT_MAX_RETRIES } = require('../lib/loop-verifier');

/**
 * Parse an integer option value, exiting with a user-facing message when
 * invalid. Takes the already-read VALUE (not the args object and a name): the
 * cli-manifest contract test derives a command's live flag set by scanning for
 * literal option subscripts, so every flag must be subscripted with its literal
 * name at the call site or it escapes that guard.
 * @param {string|undefined} raw - Raw option value
 * @param {string} name - Option name (without `--`), for the error message
 * @param {number} min - Minimum acceptable value
 * @param {number|null} fallback - Value when the option is absent
 * @returns {number|null}
 */
function intOption(raw, name, min, fallback) {
  if (raw === undefined) return fallback;
  const value = parseInt(raw, 10);
  if (Number.isNaN(value) || value < min) {
    console.error(`Error: --${name} must be an integer >= ${min}`);
    process.exit(1);
  }
  return value;
}

/**
 * Run the loop command.
 * @param {Object} args - Parsed CLI args
 * @param {Object} ctx - Command context
 * @param {string} ctx.projectRoot - Project root directory
 */
function runLoopCommand(args, { projectRoot }) {
  const { runLoop } = require('../loop');

  // --tasks is the loop's only task source; there is no implicit default file.
  const tasksFile = args.options.tasks || null;
  if (!tasksFile) {
    console.error('Error: loop requires --tasks <file> (a markdown task list)');
    process.exit(1);
  }

  const maxRuns = intOption(args.options['max-runs'], 'max-runs', 1, 50);
  let maxCost = null;
  if (args.options['max-cost'] !== undefined) {
    maxCost = parseFloat(args.options['max-cost']);
    if (Number.isNaN(maxCost) || maxCost <= 0) {
      console.error('Error: --max-cost must be a positive number');
      process.exit(1);
    }
  }
  const taskTimeout = intOption(args.options['task-timeout'], 'task-timeout', 1, null);

  // --verify-cmd: fallback acceptance floor for tasks with no own `verify:`
  // line. Tokenized as an argv array (no shell); a command needing shell
  // features exits with the security.md error.
  let verifyCommand = null;
  if (args.options['verify-cmd']) {
    try {
      verifyCommand = parseVerifyCommand(args.options['verify-cmd']);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }

  // --verifier (opt-in) + --max-retries: the verifier-agent gate layered ON TOP
  // of the acceptance floor. --max-retries bounds the verbatim-feedback retry
  // loop before the task is blocked.
  const verifier = Boolean(args.flags.verifier);
  const maxRetries = intOption(args.options['max-retries'], 'max-retries', 0, DEFAULT_MAX_RETRIES);

  // --reset archives any existing state file before this run starts, so the
  // loop begins from a clean state. Deliberate pre-run action — never mid-run.
  if (args.flags.reset) {
    const { resetLoopState } = require('../lib/loop-state');
    resetLoopState(projectRoot);
  }

  runLoop({
    tasksFile,
    maxRuns,
    maxCost,
    projectRoot,
    taskTimeoutMs: taskTimeout ? taskTimeout * 1000 : null,
    model: args.options.model || null,
    permissionMode: args.options['permission-mode'] || null,
    allowedTools: args.options['allowed-tools'] || null,
    verifyCommand,
    verifier,
    maxRetries,
  });
}

module.exports = { runLoopCommand };
