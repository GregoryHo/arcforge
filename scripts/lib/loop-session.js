/**
 * loop-session.js - Claude session spawning for the autonomous loop orchestrator.
 *
 * Owns the `claude -p` session layer: synchronous and asynchronous session
 * spawning plus cost extraction from JSON responses. scripts/loop.js keeps
 * the orchestration flow and delegates session execution here.
 */

const { execFile } = require('node:child_process');
const { CLAUDE_MAX_BUFFER, execCommand } = require('./utils');

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
 * @returns {{ exitCode: number, stdout: string, stderr: string, costUsd: number }}
 */
function spawnSession(prompt, projectRoot) {
  const result = execCommand(
    'claude',
    ['-p', '--output-format', 'json', '--no-session-persistence'],
    {
      input: prompt,
      cwd: projectRoot,
      timeout: 600000,
      maxBuffer: CLAUDE_MAX_BUFFER,
    },
  );
  return extractCost(result);
}

/**
 * Spawn a Claude session asynchronously (for parallel DAG execution).
 * Returns a Promise with the same shape as spawnSession.
 * @param {string} prompt - Task prompt
 * @param {string} projectRoot - Project root directory
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string, costUsd: number }>}
 */
function spawnSessionAsync(prompt, projectRoot) {
  return new Promise((resolve) => {
    const child = execFile(
      'claude',
      ['-p', '--output-format', 'json', '--no-session-persistence'],
      { cwd: projectRoot, timeout: 600000, maxBuffer: CLAUDE_MAX_BUFFER },
      (error, stdout, stderr) => {
        const exitCode = error ? (error.status ?? 1) : 0;
        resolve(extractCost({ stdout: stdout || '', stderr: stderr || '', exitCode }));
      },
    );
    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}

module.exports = {
  extractCost,
  spawnSession,
  spawnSessionAsync,
};
