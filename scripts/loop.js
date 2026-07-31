#!/usr/bin/env node
/**
 * loop.js - Autonomous loop orchestrator for arcforge.
 *
 * Runs a project's work overnight without human intervention. Each iteration
 * spawns a fresh Claude session via `claude -p`; the D3 markdown task list
 * (scripts/lib/task-list.js) is the ONLY task source and the only cross-session
 * task state, so a `/compact`, a dead session, or a human editing the file
 * mid-run all survive. Loop bookkeeping (iteration, cost, errors) lives in
 * .arcforge-loop.json.
 *
 * Usage:
 *   node scripts/loop.js --tasks <file> [--max-runs N] [--max-cost N]
 *
 * Per iteration: pick the next task (an in-progress one first — crash
 * recovery — then the first pending), mark it `[~]`, spawn a session, run the
 * acceptance floor, optionally run the verifier gate, then mark `[x]` or `[!]`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSession } = require('./lib/loop-session');
const {
  loadLoopState,
  saveLoopState,
  beginRun,
  recordError,
  finalizeLoop,
} = require('./lib/loop-state');
const { isStalled, isRetryStorm, checkStopConditions, printSummary } = require('./lib/loop-state');
const { parseVerifyCommand, runVerify, recordVerifyResult } = require('./lib/loop-verify');
const { runVerifierGate, blockOnVerdict, DEFAULT_MAX_RETRIES } = require('./lib/loop-verifier');
const { parseTaskList, validateTaskList, updateTaskStatus } = require('./lib/task-list');
const {
  detectPackageManager,
  getDefaultTestCommand,
  getPmRunCommand,
  hasScript,
} = require('./lib/package-manager');
const { getTimestamp } = require('./lib/utils');

/**
 * Parse loop CLI arguments
 * @param {string[]} args - Process arguments
 * @returns {Object} Parsed options
 */
function parseLoopArgs(args) {
  const options = {
    tasksFile: null,
    maxRuns: 50,
    maxCost: null,
    taskTimeoutMs: null,
    model: null,
    permissionMode: null,
    allowedTools: null,
    verifyCommand: null,
    verifier: false,
    maxRetries: DEFAULT_MAX_RETRIES,
    projectRoot: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tasks':
        options.tasksFile = args[++i];
        break;
      case '--max-runs':
        options.maxRuns = parseInt(args[++i], 10);
        if (Number.isNaN(options.maxRuns) || options.maxRuns < 1) {
          console.error('Error: --max-runs must be a positive integer');
          process.exit(1);
        }
        break;
      case '--max-cost':
        options.maxCost = parseFloat(args[++i]);
        if (Number.isNaN(options.maxCost) || options.maxCost <= 0) {
          console.error('Error: --max-cost must be a positive number');
          process.exit(1);
        }
        break;
      case '--task-timeout': {
        const seconds = parseInt(args[++i], 10);
        if (Number.isNaN(seconds) || seconds < 1) {
          console.error('Error: --task-timeout must be a positive integer (seconds)');
          process.exit(1);
        }
        options.taskTimeoutMs = seconds * 1000;
        break;
      }
      case '--model':
        options.model = args[++i];
        break;
      case '--permission-mode':
        options.permissionMode = args[++i];
        break;
      case '--allowed-tools':
        options.allowedTools = args[++i];
        break;
      case '--verify-cmd':
        try {
          options.verifyCommand = parseVerifyCommand(args[++i]);
        } catch (err) {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        }
        break;
      case '--verifier':
        options.verifier = true;
        break;
      case '--max-retries':
        options.maxRetries = parseInt(args[++i], 10);
        if (Number.isNaN(options.maxRetries) || options.maxRetries < 0) {
          console.error('Error: --max-retries must be a non-negative integer');
          process.exit(1);
        }
        break;
      case '--help':
      case '-h':
        printLoopHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        printLoopHelp();
        process.exit(1);
    }
  }

  return options;
}

/**
 * Print loop help
 */
function printLoopHelp() {
  console.log(`
arcforge loop - Autonomous cross-session execution

USAGE:
  node scripts/loop.js --tasks <file> [options]

OPTIONS:
  --tasks <file>             Task list to work through (required). A D3 markdown
                             checkbox list — it is the loop's only task state
  --max-runs N               Maximum iterations (default: 50)
  --max-cost N               Maximum cost in dollars (default: unlimited)
  --task-timeout N           Per-session timeout in seconds (default: 600)
  --model <tier>             Pass --model through to every spawned claude session
                             (implementer + verifier); default: CLI default tier
  --permission-mode <mode>   Pass --permission-mode through to spawned claude sessions
  --allowed-tools <tools>    Pass --allowed-tools through to spawned claude sessions
  --verify-cmd "<cmd>"       Fallback acceptance floor for tasks with no own
                             \`verify:\` line; a non-zero exit fails the task
  --verifier                 After the acceptance floor passes, spawn an
                             independent verifier agent; FAIL → retry with verbatim
                             feedback, exhausted → block (opt-in; off by default)
  --max-retries N            Verifier feedback retries before blocking (default: 2)
  --help, -h                 Show this help

TASK LIST:
  Tasks come from the --tasks file and nowhere else. A task's own \`verify:\`
  line is its acceptance floor; --verify-cmd covers tasks that have none.
  The loop marks each task [~] while working, then [x] or [!].

STATE:
  Loop state is tracked in .arcforge-loop.json
  Errors are logged with timestamps for monitoring
`);
}

/**
 * Resolve the --tasks value against the project root.
 * @param {string} tasksFile - Raw --tasks value
 * @param {string} projectRoot - Project root directory
 * @returns {string} Absolute path to the task list
 * @throws {Error} when no task list was given
 */
function resolveTasksPath(tasksFile, projectRoot) {
  if (typeof tasksFile !== 'string' || !tasksFile.trim()) {
    throw new Error('loop requires a task list: pass --tasks <file>');
  }
  return path.resolve(projectRoot, tasksFile);
}

/**
 * Read the task list file. The list IS the state, so an unreadable file is a
 * hard error rather than a silently empty run.
 * @param {string} tasksPath - Absolute path to the task list
 * @returns {string} File contents
 * @throws {Error} when the file cannot be read
 */
function readTaskList(tasksPath) {
  try {
    return fs.readFileSync(tasksPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read task list at ${tasksPath}: ${err.message}`);
  }
}

/**
 * Pick the task to run next: a task already marked in-progress wins (a previous
 * run died mid-task and must be resumed, not skipped), otherwise the first
 * pending task in file order. Done and blocked tasks are never re-run.
 * @param {Array<{id:string,status:string}>} tasks - Parsed tasks
 * @returns {Object|null} Next task, or null when nothing is runnable
 */
function selectNextTask(tasks) {
  if (!Array.isArray(tasks)) return null;
  return (
    tasks.find((t) => t.status === 'in-progress') ||
    tasks.find((t) => t.status === 'pending') ||
    null
  );
}

/**
 * Write one task's status back to the list. THE single task-list write path —
 * every status transition the loop makes goes through here.
 * @param {string} tasksPath - Absolute path to the task list
 * @param {string} id - Task id
 * @param {string} status - One of TASK_STATUSES
 * @returns {string} The updated file contents
 * @throws {Error} on an unknown id/status or an unwritable file
 */
function setTaskStatus(tasksPath, id, status) {
  const updated = updateTaskStatus(readTaskList(tasksPath), id, status);
  try {
    fs.writeFileSync(tasksPath, updated);
  } catch (err) {
    throw new Error(`Failed to write task list at ${tasksPath}: ${err.message}`);
  }
  return updated;
}

/**
 * Resolve the acceptance floor for one task: its own `verify:` line when it has
 * one, else the run-wide --verify-cmd, else none.
 * @param {{verify: string|null}} task - Parsed task
 * @param {Object} options - Loop options (verifyCommand fallback)
 * @returns {string[]|null} argv array, or null when no floor applies
 * @throws {Error} when the task's own verify line cannot be tokenized
 */
function resolveTaskVerifyCommand(task, options) {
  if (!task.verify) return options.verifyCommand || null;
  return parseVerifyCommand(task.verify);
}

/**
 * Build verification instructions from detected project commands.
 * Returns [] when the project type is unknown (no package.json or
 * pyproject.toml) — the verification block is omitted rather than
 * prescribing commands that don't exist.
 * @param {string} projectRoot - Project root directory
 * @returns {string[]} Ordered instruction lines (numbering added by caller)
 */
function buildVerificationLines(projectRoot) {
  let testCommand;
  try {
    testCommand = getDefaultTestCommand(projectRoot).join(' ');
  } catch {
    return [];
  }
  const lines = [`Run \`${testCommand}\` and verify all tests pass`];
  if (hasScript('lint', projectRoot)) {
    const pmName = detectPackageManager(projectRoot) || 'npm';
    lines.push(`Run \`${getPmRunCommand('lint', pmName).join(' ')}\` and fix any issues`);
  }
  lines.push('Commit with format: type(scope): description');
  return lines;
}

/**
 * Build the task context prompt for a spawned session. Everything the session
 * needs comes from the task list entry — the loop has no other task store.
 * @param {Object} task - Parsed task ({ id, text, verify, note })
 * @param {Object} ctx - Prompt context
 * @param {string} ctx.projectRoot - Project root (spawn cwd)
 * @param {string} [ctx.tasksFile] - Task list path shown to the session
 * @param {number} [ctx.remaining] - Tasks still not done, for pacing
 * @returns {string} Prompt for the spawned session
 */
function buildTaskPrompt(task, ctx = {}) {
  const { projectRoot, tasksFile, remaining } = ctx;
  const parts = [`# Task: ${task.text}`, ``, `## Task ID: ${task.id}`];
  if (task.note) parts.push(`## Note: ${task.note}`);
  if (tasksFile) parts.push(`## Task list: ${tasksFile}`);
  if (typeof remaining === 'number') parts.push(`## Remaining tasks: ${remaining}`);

  parts.push(
    ``,
    `## Instructions`,
    ``,
    `Implement this task following the project conventions.`,
    `Use TDD: write failing test first, then implement, then refactor.`,
    `Commit your changes with a conventional commit message.`,
    `Do NOT edit the task list — the loop owns every status marker in it.`,
    ``,
    `## Project Root: ${projectRoot}`,
  );

  if (task.verify) {
    parts.push(``, `## Acceptance`, ``, `This task is done when \`${task.verify}\` passes.`);
  }

  const verification = buildVerificationLines(projectRoot);
  if (verification.length > 0) {
    parts.push(``, `## Verification`, ``, `After implementation:`);
    parts.push(...verification.map((line, idx) => `${idx + 1}. ${line}`));
  }

  return parts.join('\n');
}

/**
 * Run the deterministic acceptance floor for a task whose session exited 0.
 * When the task has no floor (no `verify:` line and no --verify-cmd) this is a
 * no-op returning true. Otherwise it runs the argv array (no shell) in `cwd`,
 * persists the result for the verifier gate, and returns whether it passed — a
 * non-zero verify exit means the task did NOT pass and must route to
 * retry/block, not to done.
 * @param {Object} task - Task whose session just succeeded
 * @param {Object} state - Loop state (verify result persisted here)
 * @param {Object} options - Loop options (verifyCommand, taskTimeoutMs)
 * @param {string} cwd - Working directory to run verify in
 * @param {number} attempt - Attempt number (for error recording)
 * @returns {boolean} Whether verification passed (or was not configured)
 */
function runVerifyFloor(task, state, options, cwd, attempt) {
  if (!options.verifyCommand) return true;
  console.log(`[loop] Verifying ${task.id}: ${options.verifyCommand.join(' ')}`);
  const result = runVerify(options.verifyCommand, cwd, { timeoutMs: options.taskTimeoutMs });
  recordVerifyResult(state, task.id, result);
  if (result.exitCode !== 0) {
    console.log(`[loop] Verify failed for ${task.id} (exit ${result.exitCode})`);
    recordError(state, task.id, `verify-cmd failed: ${result.stderr || result.stdout}`, attempt);
    return false;
  }
  return true;
}

/**
 * Run the verifier gate for a task whose session exited 0 and passed the
 * acceptance floor. Layered ON TOP of the floor: when `--verifier` is off this
 * is a no-op returning true (no extra session). The verbatim-feedback retry
 * loop and verdict parsing live in loop-verifier.js; this only wires the loop's
 * spawn/floor/prompt callbacks and records the block on FAIL-exhausted or an
 * unparseable verdict (never inferring PASS). `buildPrompt` re-builds the
 * implementer prompt with prepended feedback.
 * @param {Object} task - Task whose session succeeded
 * @param {Object} state - Loop state
 * @param {Object} options - Loop options
 * @param {string} cwd - Work cwd
 * @param {Function} buildPrompt - (feedback) => implementer prompt string
 * @returns {boolean} Whether the verifier passed (or was skipped/off)
 */
function runVerifierGateFor(task, state, options, cwd, buildPrompt) {
  const outcome = runVerifierGate({
    task,
    state,
    options,
    cwd,
    spawnImplementer: (prompt, c) => spawnSession(prompt, c, options),
    spawnVerifier: (prompt, c) => spawnSession(prompt, c, options),
    buildImplementerPrompt: buildPrompt,
    runFloor: (c) => runVerifyFloor(task, state, options, c, 1),
  });
  if (outcome.passed) return true;
  return blockOnVerdict(task, state, outcome);
}

/**
 * Run a single task iteration. Never writes the task list — the caller owns
 * every status transition.
 * @param {Object} task - Parsed task from the list
 * @param {Object} state - Loop state
 * @param {Object} options - Loop options (projectRoot + spawn pass-through)
 * @returns {boolean} Whether the task succeeded
 */
function runTask(task, state, options) {
  const { projectRoot } = options;
  console.log(`[loop] Iteration ${state.iteration}: Running ${task.id} — ${task.text}`);

  let verifyCommand;
  try {
    verifyCommand = resolveTaskVerifyCommand(task, options);
  } catch (err) {
    // A task whose own verify line needs a shell can never be accepted — block
    // that task with the reason instead of crashing the whole run.
    console.error(`[loop] Task ${task.id} has an unusable verify command: ${err.message}`);
    recordError(state, task.id, `unusable verify command: ${err.message}`, 1);
    state.failed_tasks.push(task.id);
    return false;
  }
  const taskOptions = { ...options, verifyCommand };

  const prompt = buildTaskPrompt(task, { projectRoot, tasksFile: options.tasksFile });
  let result = spawnSession(prompt, projectRoot, taskOptions);
  state.total_cost += result.costUsd;
  // An attempt only succeeds when the session exits 0 AND the acceptance floor
  // passes — a clean exit with a failing verify must still route to retry.
  let attemptOk = result.exitCode === 0 && runVerifyFloor(task, state, taskOptions, projectRoot, 1);

  if (!attemptOk) {
    console.log(`[loop] Task ${task.id} failed, retrying once...`);
    if (result.exitCode !== 0) recordError(state, task.id, result.stderr, 1);

    // Retry once
    result = spawnSession(prompt, projectRoot, taskOptions);
    state.total_cost += result.costUsd;
    attemptOk = result.exitCode === 0 && runVerifyFloor(task, state, taskOptions, projectRoot, 2);
    if (!attemptOk) {
      console.log(`[loop] Task ${task.id} failed after retry — blocking`);
      if (result.exitCode !== 0) recordError(state, task.id, result.stderr, 2);
      state.failed_tasks.push(task.id);
      return false;
    }
  }

  // Verifier gate (opt-in): the floor passed, but with --verifier on an
  // independent verdict must also PASS before completing. A no-op when off.
  if (
    !runVerifierGateFor(task, state, taskOptions, projectRoot, (feedback) =>
      feedback ? `${feedback}\n\n---\n\n${prompt}` : prompt,
    )
  ) {
    return false;
  }

  state.completed_tasks.push(task.id);
  state.last_progress_at = getTimestamp();
  console.log(`[loop] Task ${task.id} completed successfully`);
  return true;
}

/** The one validateTaskList rule the loop cannot satisfy when it blocks a task. */
const MISSING_BLOCK_NOTE_RE = /blocked with no "note:"/;

/**
 * Validate the task list once, before any session is spawned — a malformed list
 * must fail loudly rather than silently running zero tasks.
 *
 * ONE exception: `[!]` with no `note:`. The loop marks blocked tasks through
 * updateTaskStatus, which rewrites only the marker (task-list.js owns the
 * format and exposes no way to attach a reason), so a run that blocked a task
 * would refuse to resume over its OWN output. That rule is downgraded to a
 * warning here; every other semantic violation stays fatal.
 *
 * validateTaskList throws on its FIRST violation, so swallowing one leaves the
 * rules after it unchecked. Duplicate ids are re-checked explicitly because
 * updateTaskStatus resolves an id to its first match — a duplicate would let
 * the loop mark the wrong task.
 * @param {string} content - Task list contents
 * @throws {Error} on any validation failure except the missing block note
 */
function validateTaskListForRun(content) {
  try {
    validateTaskList(content);
    return;
  } catch (err) {
    if (!MISSING_BLOCK_NOTE_RE.test(err.message)) throw err;
    console.error(`[loop] ${err.message} — continuing (blocked tasks are skipped)`);
  }
  const seen = new Set();
  for (const task of parseTaskList(content).tasks) {
    if (seen.has(task.id)) {
      throw new Error(`task list (line ${task.line}): duplicate task id ${task.id}`);
    }
    seen.add(task.id);
  }
}

/**
 * Run the loop over a D3 task list: one task per iteration, stop on the first
 * failure. The list is re-read every iteration so a human editing it mid-run
 * (adding tasks, unblocking one) is picked up on the next pass.
 * @param {Object} options - Loop options
 * @returns {Object} Final loop state
 * @throws {Error} when the task list is missing or malformed at start
 */
function runLoop(options) {
  const { projectRoot, maxRuns, maxCost } = options;
  const tasksPath = resolveTasksPath(options.tasksFile, projectRoot);
  // Validate ONCE up front. Per-iteration reads parse only, so the run cannot
  // die halfway on a semantic rule it introduced itself.
  validateTaskListForRun(readTaskList(tasksPath));

  const state = loadLoopState(projectRoot);
  beginRun(state, { pattern: 'tasks', maxRuns, maxCost });
  state.tasks_file = path.relative(projectRoot, tasksPath);

  console.log(`[loop] Starting loop over ${state.tasks_file} (max ${maxRuns} runs)`);

  while (state.iteration < maxRuns) {
    state.iteration++;

    const stopReason = checkStopConditions(state, maxCost);
    if (stopReason) {
      state.status = stopReason;
      break;
    }

    const { tasks } = parseTaskList(readTaskList(tasksPath));
    const task = selectNextTask(tasks);
    if (!task) {
      const blocked = tasks.filter((t) => t.status === 'blocked').length;
      if (blocked > 0) {
        console.log(`[loop] No runnable tasks — ${blocked} blocked`);
        state.status = 'blocked';
      } else {
        console.log('[loop] All tasks complete!');
        state.status = 'complete';
      }
      break;
    }

    setTaskStatus(tasksPath, task.id, 'in-progress');
    const remaining = tasks.filter((t) => t.status !== 'done').length;
    const success = runTask(task, state, {
      ...options,
      tasksFile: state.tasks_file,
      remaining,
    });
    setTaskStatus(tasksPath, task.id, success ? 'done' : 'blocked');
    saveLoopState(state, projectRoot);

    if (!success) {
      console.log('[loop] Task failed — stopping loop');
      state.status = 'failed';
      break;
    }
  }

  finalizeLoop(state, maxRuns, projectRoot);
  printSummary(state);
  return state;
}

/**
 * Main entry point
 */
function main() {
  const options = parseLoopArgs(process.argv.slice(2));
  try {
    runLoop(options);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseLoopArgs,
  printLoopHelp,
  resolveTasksPath,
  readTaskList,
  selectNextTask,
  setTaskStatus,
  resolveTaskVerifyCommand,
  validateTaskListForRun,
  buildVerificationLines,
  buildTaskPrompt,
  runVerifyFloor,
  runTask,
  runLoop,
  spawnSession,
  isStalled,
  isRetryStorm,
  checkStopConditions,
};
