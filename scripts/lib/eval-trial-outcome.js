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

/**
 * Did the provider answer in place of the agent?
 *
 * A session-limit or quota refusal arrives as ordinary final text, so
 * isOutputComplete() reads it as a finished turn (#195). What gives it away is
 * the cost: the result event reports zero output tokens — no model turn wrote
 * that text — and the agent called no tool. The wording is deliberately not
 * matched: provider messages change, the zero-cost shape does not. A trial whose
 * usage was not reported (output_tokens null) is never flagged — absence of the
 * number is not evidence.
 *
 * A limit that lands after tool calls hides from that rule: the result event's
 * output_tokens covers the whole session. That case is told by its last
 * assistant message instead — one Claude Code wrote itself (endedSynthetic, see
 * parseStreamJsonOutput). `result.is_error` is deliberately not used: it is
 * also set for a run that hit its turn budget, which is a scored outcome.
 *
 * @param {Object} params
 * @param {string} [params.textResult] - Final text from the stream-json result event
 * @param {Array<{type: string}>} [params.actions] - Parsed action log
 * @param {{ output_tokens?: number|null }} [params.usage] - Usage from the result event
 * @param {boolean} [params.endedSynthetic] - The session ended on a synthetic message
 * @returns {boolean}
 */
function isProviderRefusal({ textResult, actions, usage, endedSynthetic } = {}) {
  if (endedSynthetic === true) return true;
  if (usage?.output_tokens !== 0) return false;
  if (typeof textResult !== 'string' || !textResult.trim()) return false;
  return !(Array.isArray(actions) && actions.some((a) => a.type === 'tool'));
}

/**
 * Did the trial subprocess never start?
 *
 * A session that could not be spawned (no `claude` to run, an environment Node
 * refuses to pass on) leaves an error with no exit status, no signal and no
 * output. A process that ran and exited non-zero has a status; one the runner
 * killed is isTrialKilled().
 *
 * @param {{ stdout?: string, error?: Error & { status?: number|null, signal?: string|null } }} execResult
 * @returns {boolean}
 */
function isSpawnFailure(execResult) {
  const err = execResult?.error;
  if (!err || isTrialKilled(execResult)) return false;
  return err.status == null && !execResult.stdout;
}

module.exports = { isTrialKilled, isOutputComplete, isProviderRefusal, isSpawnFailure };
