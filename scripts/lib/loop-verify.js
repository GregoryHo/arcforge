/**
 * loop-verify.js - Deterministic acceptance floor for the autonomous loop.
 *
 * The `--verify-cmd` flag runs a project-defined verification command after a
 * spawned session exits 0 and BEFORE the task is marked complete. A non-zero
 * verify exit fails the task (routing it to retry/block), so the loop never
 * marks work "done" on the session's word alone.
 *
 * SECURITY (security.md): the command runs as an argv ARRAY via execFileSync —
 * never through a shell. The command string is tokenized here (quote-aware,
 * no shell), and any command that genuinely needs shell features (pipes,
 * redirects, command chaining, substitution) is REJECTED with a clear error
 * rather than silently interpolated into a shell.
 */

const { execFileSync } = require('node:child_process');

/** Shell metacharacters that mean the command needs a shell we won't provide. */
const SHELL_FEATURE_RE = /[|&;<>`]|\$\(|\$\{|\n/;

/** Cap captured verify output stored in loop state (feeds AF-9 feedback). */
const VERIFY_OUTPUT_CAP = 2000;

/** Default per-verify timeout (ms). A hung verify must not stall the loop. */
const DEFAULT_VERIFY_TIMEOUT_MS = 600000;

/** Strip control characters from captured (untrusted) command output. */
function stripControlChars(str) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: deliberate control-char filter (security.md)
  return str.replace(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

/**
 * Parse a verify-command string into a quote-aware argv array — the "proper
 * argv carrier" replacing a naive split(' '). Handles single/double quotes so
 * commands with quoted arguments (e.g. `npm test -- --grep "a b"`) tokenize
 * correctly, but does NOT interpret any shell syntax.
 *
 * Throws (security.md STOP) when the command contains shell metacharacters
 * (`| & ; < > \` $( ${` or a newline): those need a shell, and the floor must
 * never pipe an untrusted string through one. The caller surfaces this for
 * owner sign-off rather than improvising.
 *
 * @param {string} raw - Raw --verify-cmd value
 * @returns {string[]} argv array (command + args)
 */
function parseVerifyCommand(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('verify-cmd must be a non-empty string');
  }
  if (SHELL_FEATURE_RE.test(raw)) {
    throw new Error(
      `verify-cmd "${raw}" uses shell features (pipe/redirect/chaining/substitution); ` +
        'the acceptance floor runs commands as an argv array, never through a shell ' +
        '(security.md). Wrap the logic in a script and point --verify-cmd at it.',
    );
  }
  const argv = [];
  let current = '';
  let quote = null;
  let sawToken = false;
  for (const ch of raw.trim()) {
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      sawToken = true;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (sawToken) {
        argv.push(current);
        current = '';
        sawToken = false;
      }
      continue;
    }
    current += ch;
    sawToken = true;
  }
  if (quote) {
    throw new Error(`verify-cmd "${raw}" has an unterminated ${quote} quote`);
  }
  if (sawToken) argv.push(current);
  if (argv.length === 0) {
    throw new Error('verify-cmd must contain at least one token');
  }
  return argv;
}

/**
 * Run a verify command (argv array) in a working directory, as the deterministic
 * acceptance floor. Runs via execFileSync — NO shell. A spawn-level failure
 * (binary missing, timeout) is reported as a non-zero exit, never thrown, so
 * the loop treats it as a verify failure (retry/block) rather than crashing.
 *
 * @param {string[]} argv - Command argv array (from parseVerifyCommand)
 * @param {string} cwd - Working directory (dag mode: the epic worktree)
 * @param {Object} [options] - Run options
 * @param {number} [options.timeoutMs] - Per-verify timeout
 * @returns {{ command: string[], exitCode: number, stdout: string, stderr: string }}
 */
function runVerify(argv, cwd, options = {}) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error('runVerify requires a non-empty argv array');
  }
  const [cmd, ...args] = argv;
  try {
    const stdout = execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeoutMs || DEFAULT_VERIFY_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { command: argv, exitCode: 0, stdout: stdout || '', stderr: '' };
  } catch (err) {
    return {
      command: argv,
      exitCode: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout ? String(err.stdout) : '',
      stderr: err.stderr ? String(err.stderr) : err.message || '',
    };
  }
}

/**
 * Persist a per-run verify result into loop state for AF-9 (the verifier-agent
 * consumes accumulated verify evidence). Appends to state.verify_results,
 * stamped with the current run/iteration. Output is control-char filtered and
 * capped. Mutates state in place.
 *
 * @param {Object} state - Loop state
 * @param {string} taskId - Task/epic id this verify ran for
 * @param {{ command: string[], exitCode: number, stdout: string, stderr: string }} result
 * @returns {Object} The recorded entry
 */
function recordVerifyResult(state, taskId, result) {
  if (!Array.isArray(state.verify_results)) state.verify_results = [];
  const tail = (s) => stripControlChars(String(s || '')).slice(-VERIFY_OUTPUT_CAP);
  const entry = {
    task_id: taskId,
    iteration: state.iteration,
    command: result.command,
    exit_code: result.exitCode,
    passed: result.exitCode === 0,
    output: tail(`${result.stdout}${result.stderr ? `\n${result.stderr}` : ''}`),
    timestamp: new Date().toISOString(),
  };
  if (state.run_id) entry.run_id = state.run_id;
  state.verify_results.push(entry);
  return entry;
}

module.exports = {
  SHELL_FEATURE_RE,
  DEFAULT_VERIFY_TIMEOUT_MS,
  parseVerifyCommand,
  runVerify,
  recordVerifyResult,
};
