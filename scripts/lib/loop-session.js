/**
 * loop-session.js - Claude session spawning for the autonomous loop orchestrator.
 *
 * Owns the `claude -p` session layer: synchronous and asynchronous session
 * spawning plus cost extraction from JSON responses. scripts/loop.js keeps
 * the orchestration flow and delegates session execution here.
 */

const { execFile } = require('node:child_process');
const { CLAUDE_MAX_BUFFER, execCommand } = require('./utils');

/** Default per-session timeout. Override with the --task-timeout loop flag. */
const DEFAULT_TASK_TIMEOUT_MS = 600000;

/**
 * Guidance appended to failures that look like a permission stall.
 * Headless `claude -p` cannot answer interactive permission prompts, so a
 * session blocked on one runs silently until the task timeout kills it.
 */
const PERMISSION_STALL_GUIDANCE =
  '[loop] Headless sessions cannot answer interactive permission prompts — a session ' +
  'blocked on one stalls until the task timeout kills it. Re-run with --permission-mode ' +
  'and/or --allowed-tools (see "Headless Permissions" in the arc-looping skill).';

/**
 * Build the argv for a spawned `claude -p` session.
 * Permission posture is strictly caller-controlled via pass-through flags:
 * no code path may append --dangerously-skip-permissions automatically.
 * @param {Object} [options] - Spawn options
 * @param {string} [options.permissionMode] - Value for --permission-mode
 * @param {string} [options.allowedTools] - Value for --allowed-tools
 * @returns {string[]} Argument array for the claude CLI
 */
function buildClaudeArgs(options = {}) {
  const args = ['-p', '--output-format', 'json', '--no-session-persistence'];
  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode);
  }
  if (options.allowedTools) {
    args.push('--allowed-tools', options.allowedTools);
  }
  return args;
}

/**
 * Build the child environment for loop-spawned sessions.
 * Spawn env hygiene: autonomous loop sessions always run unattended — an
 * inherited ARCFORGE_MODE=attended (from a `.arcforge-attended` marker
 * export or a shell export) must never leak into them, or unattended
 * sessions would pass attended-only gates. ARCFORGE_SPAWNED marks the
 * session as loop-spawned so SessionStart consumers (e.g. the
 * pending-action relay) can skip it instead of consuming user-bound state.
 * @returns {Object} Environment for the spawned claude process
 */
function buildSpawnEnv() {
  return { ...process.env, ARCFORGE_MODE: '', ARCFORGE_SPAWNED: 'loop' };
}

/**
 * Append headless-permissions guidance to failures that look like a
 * permission stall: a timeout kill (the stall signature in headless runs)
 * or stderr that mentions permissions. Mutates the result in place.
 * @param {{ exitCode: number, stderr: string, error?: Error }} result
 * @returns {Object} The same result, with guidance appended on a stall
 */
function appendStallGuidance(result) {
  if (result.exitCode === 0) return result;
  const err = result.error;
  const timedOut = Boolean(err && (err.killed || err.signal || err.code === 'ETIMEDOUT'));
  const stderr = result.stderr || '';
  if (timedOut || /permission/i.test(stderr)) {
    result.stderr = `${stderr}\n${PERMISSION_STALL_GUIDANCE}`.trim();
  }
  return result;
}

/**
 * Extract cost data from a Claude JSON response, replacing stdout with the text result.
 * Mutates the result object in place.
 * @param {{ exitCode: number, stdout: string }} result
 * @returns {{ exitCode: number, stdout: string, costUsd: number }}
 */
function extractCost(result) {
  let costUsd = 0;
  if (result.exitCode === 0 && result.stdout) {
    try {
      const parsed = JSON.parse(result.stdout);
      costUsd = parsed.total_cost_usd || 0;
      result.stdout = parsed.result || '';
    } catch {
      /* non-JSON output — keep stdout as-is */
    }
  }
  result.costUsd = costUsd;
  return result;
}

/**
 * Spawn a Claude session for a task.
 * Uses JSON output to capture cost data for --max-cost budget tracking.
 * @param {string} prompt - Task prompt
 * @param {string} projectRoot - Project root directory
 * @param {Object} [options] - Spawn options
 * @param {number} [options.taskTimeoutMs] - Per-session timeout in ms
 * @param {string} [options.permissionMode] - Value for --permission-mode
 * @param {string} [options.allowedTools] - Value for --allowed-tools
 * @returns {{ exitCode: number, stdout: string, stderr: string, costUsd: number }}
 */
function spawnSession(prompt, projectRoot, options = {}) {
  const result = execCommand('claude', buildClaudeArgs(options), {
    input: prompt,
    cwd: projectRoot,
    timeout: options.taskTimeoutMs || DEFAULT_TASK_TIMEOUT_MS,
    maxBuffer: CLAUDE_MAX_BUFFER,
    env: buildSpawnEnv(),
  });
  return extractCost(appendStallGuidance(result));
}

/**
 * Spawn a Claude session asynchronously (for parallel DAG execution).
 * Returns a Promise with the same shape as spawnSession.
 * @param {string} prompt - Task prompt
 * @param {string} projectRoot - Project root directory
 * @param {Object} [options] - Spawn options (same as spawnSession)
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string, costUsd: number }>}
 */
function spawnSessionAsync(prompt, projectRoot, options = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      'claude',
      buildClaudeArgs(options),
      {
        cwd: projectRoot,
        timeout: options.taskTimeoutMs || DEFAULT_TASK_TIMEOUT_MS,
        maxBuffer: CLAUDE_MAX_BUFFER,
        env: buildSpawnEnv(),
      },
      (error, stdout, stderr) => {
        const exitCode = error ? (error.status ?? 1) : 0;
        const result = { stdout: stdout || '', stderr: stderr || '', exitCode, error };
        resolve(extractCost(appendStallGuidance(result)));
      },
    );
    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}

module.exports = {
  DEFAULT_TASK_TIMEOUT_MS,
  PERMISSION_STALL_GUIDANCE,
  buildClaudeArgs,
  buildSpawnEnv,
  appendStallGuidance,
  extractCost,
  spawnSession,
  spawnSessionAsync,
};
