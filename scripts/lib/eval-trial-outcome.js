/**
 * eval-trial-outcome.js - Classify how an eval trial's session ended
 *
 * Pure predicates over an execCommand result and a parsed action log. Used by
 * eval.js to decide whether a trial produced a measurable session or an
 * instrument failure. No I/O, no dependencies — a leaf module.
 *
 * Zero external dependencies — Node.js standard library only.
 */

/**
 * Did the runner kill the trial subprocess (rather than the CLI exiting)?
 *
 * Node's `timeout` option sends SIGTERM and surfaces the kill differently
 * across platforms and versions: `err.code === 'ETIMEDOUT'` is the documented
 * marker (observed on darwin/node 22 with `killed: undefined, signal: null,
 * status: 143`), while `killed`/`signal` are the POSIX-shaped markers. Any of
 * the three means the process did not decide its own exit.
 *
 * @param {{ error?: Error & { killed?: boolean, signal?: string|null, code?: string } }} execResult
 * @returns {boolean}
 */
function isTrialKilled(execResult) {
  const err = execResult?.error;
  if (!err) return false;
  return err.killed === true || typeof err.signal === 'string' || err.code === 'ETIMEDOUT';
}

/**
 * Did the trial agent finish its turn?
 *
 * Two ways to know, in order of strength:
 *   1. A terminal `result` event carried final text — the CLI ran to completion.
 *   2. The last thing in the action log is the agent talking, not a tool call.
 *      An agent cut off mid-work ends on a tool invocation; an agent that
 *      delivered its answer ends on text.
 *
 * `stop_reason` is not usable here: Claude Code's stream-json assistant events
 * carry `message.stop_reason: null` (probe-verified), so turn completion has to
 * be read off the transcript shape.
 *
 * @param {Object} params
 * @param {string} [params.textResult] - Final text from the stream-json result event
 * @param {Array<{type: string}>} [params.actions] - Parsed action log
 * @returns {boolean}
 */
function isOutputComplete({ textResult, actions } = {}) {
  if (typeof textResult === 'string' && textResult.trim()) return true;
  if (!Array.isArray(actions) || actions.length === 0) return false;
  return actions[actions.length - 1].type === 'text';
}

module.exports = { isTrialKilled, isOutputComplete };
