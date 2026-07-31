/**
 * loop-verifier.js - Verifier-agent gate + feedback retry protocol (AF-9).
 *
 * Layers ON TOP of the deterministic acceptance floor (loop-verify.js): when
 * `--verifier` is on, a session that exits 0 AND passes the floor is NOT yet
 * trusted. An independent verifier session is spawned in the work cwd,
 * assembled at runtime from the verifier prompt's body + the task's acceptance
 * criteria + the verify-command evidence + an assembler-layer
 * "Final verdict: PASS|FAIL" instruction. The verifier's verdict is parsed from
 * its text result — NEVER inferred from an exit code.
 *
 * On FAIL the implementer is re-spawned with verbatim cumulative feedback
 * prepended, up to --max-retries (default 2). Exhausted retries → the caller
 * blocks the task with the last verdict. An UNPARSEABLE verdict is a hard stop:
 * the task is blocked (never completed) and the caller surfaces it for the
 * verdict-protocol escalation — the floor's exit-code is never used to infer PASS.
 *
 * Acceptance criteria come from the D3 task itself (its text, its `verify:`
 * line, its `note:`) — the task list is the loop's only task state, so there is
 * no second criteria store to degrade through. When the verifier prompt file is
 * unreadable the gate is SKIPPED (with a warning) rather than spawned on an
 * empty body; the deterministic floor still gates, so the task may still pass.
 *
 * The prompt assembly never edits the verifier prompt file (read-only here).
 */

const path = require('node:path');
const { readFileSafe } = require('./utils');
const { recordError } = require('./loop-state');

/** Default retry budget for the verifier feedback loop. */
const DEFAULT_MAX_RETRIES = 2;

/** Cap assembled criteria text so a huge task note can't blow the prompt. */
const CRITERIA_CAP = 8000;

/** The verifier prompt, resolved relative to THIS file (not cwd, not env). */
const VERIFIER_AGENT_PATH = path.join(__dirname, 'prompts', 'verifier.md');

/**
 * Strip YAML frontmatter from an agent markdown file, returning the body only.
 * `claude -p` does not honor an agent's `model:` field; we assemble the body.
 * @param {string} content - Raw agent .md content
 * @returns {string} Body after the frontmatter
 */
function stripFrontmatter(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? content.slice(match[0].length).trim() : content.trim();
}

/**
 * Load the verifier agent body (frontmatter stripped). Read-only — this never
 * edits the prompt file. Returns null when it is unreadable so the caller can
 * degrade rather than spawn an empty-bodied verifier.
 * @returns {string|null} Verifier agent body, or null when unavailable
 */
function loadVerifierBody() {
  const content = readFileSafe(VERIFIER_AGENT_PATH);
  if (!content) return null;
  const body = stripFrontmatter(content);
  return body || null;
}

/**
 * Build the acceptance criteria text for a D3 task. The task list is the loop's
 * only task state, so the criteria ARE the task: its text, its `verify:` line
 * (the command that decides done), and its `note:` when present. Capped so a
 * long note cannot blow the prompt.
 * @param {{id:string,text:string,verify:string|null,note:string|null}} task
 * @returns {string} Criteria text
 */
function buildTaskCriteria(task) {
  const parts = [`- ${task?.text || task?.id || 'the task'}`];
  if (task?.verify) {
    parts.push(`- The task's own verify command must pass: \`${task.verify}\``);
  }
  if (task?.note) parts.push(`- Note recorded on the task: ${task.note}`);
  return parts.join('\n').slice(0, CRITERIA_CAP);
}

/**
 * Assemble the verifier session prompt at runtime. NEVER edits the prompt file.
 * Layers: agent body → task identity + acceptance criteria → verify-command
 * evidence instruction → a forceful verdict-protocol override. The override
 * deliberately supersedes the agent body's own SHIP/NEEDS WORK/BLOCKED report
 * vocabulary so a real session emits a parseable `Final verdict:` line, not a
 * divergent verdict.
 * @param {Object} args
 * @param {string} args.agentBody - Verifier agent body (frontmatter stripped)
 * @param {Object} args.task - Task being verified ({ id, text })
 * @param {string} args.criteria - Acceptance criteria text (non-empty)
 * @param {string[]|null} args.verifyCommand - The verify-command argv (or null)
 * @param {string} [args.feedback] - Verbatim cumulative feedback to prepend
 * @returns {string} The assembled verifier prompt
 */
function assembleVerifierPrompt({ agentBody, task, criteria, verifyCommand, feedback }) {
  const parts = [];
  if (feedback?.trim()) {
    parts.push('## Prior Verification Feedback (address every point before re-verifying)', '');
    parts.push(feedback.trim(), '');
    parts.push('---', '');
  }
  parts.push(agentBody, '');
  parts.push('## Work Under Verification', '');
  parts.push(`Task: ${task.text} (${task.id})`, '');
  parts.push('## Acceptance Criteria', '');
  parts.push(criteria.trim(), '');
  if (Array.isArray(verifyCommand) && verifyCommand.length > 0) {
    parts.push('## Deterministic Acceptance Floor', '');
    parts.push(
      `A deterministic floor command already passed: \`${verifyCommand.join(' ')}\`. ` +
        'Re-run it yourself and read its real output as part of your evidence — ' +
        'do not take its prior pass on trust.',
      '',
    );
  }
  parts.push('## Verdict Protocol (overrides any report format above)', '');
  parts.push(
    'Disregard the SHIP / NEEDS WORK / BLOCKED wording in the report format above. ' +
      'After your verification, your response MUST end with a single line that is ' +
      'EXACTLY one of:',
    '',
    'Final verdict: PASS',
    'Final verdict: FAIL',
    '',
    'PASS only when every acceptance criterion is met with fresh evidence you ran ' +
      'this session. Otherwise FAIL, and list what failed above the verdict line so ' +
      'the implementer can act on it. Nothing may follow the verdict line.',
  );
  return parts.join('\n');
}

/**
 * Parse a PASS/FAIL verdict from the verifier session's text result. Takes the
 * LAST `Final verdict:` line (tolerating markdown emphasis / surrounding
 * whitespace). Returns 'PASS' | 'FAIL', or null when no parseable verdict line
 * is present (the STOP signal). NEVER maps SHIP→PASS and NEVER inspects an exit
 * code — an unparseable verdict must route to block, not an inferred PASS.
 * @param {string} text - Verifier session stdout (the text result)
 * @returns {'PASS'|'FAIL'|null}
 */
function parseVerdict(text) {
  if (typeof text !== 'string' || !text) return null;
  const re = /final\s+verdict\s*:\s*\**\s*(PASS|FAIL)\b/gi;
  let verdict = null;
  let match = re.exec(text);
  while (match !== null) {
    verdict = match[1].toUpperCase();
    match = re.exec(text);
  }
  return verdict;
}

/**
 * Append a verifier attempt to loop state (round-trips via saveLoopState as
 * plain JSON). This is the AF-9 attempts schema — kept in LOOP state, distinct
 * from the DAG blocked-item `attempts` field (which this never touches). Mutates
 * state in place.
 * @param {Object} state - Loop state
 * @param {string} taskId - Task/epic id verified
 * @param {Object} attempt - { attempt, verdict, feedback, cost_usd }
 * @returns {Object} The recorded entry
 */
function recordVerifierAttempt(state, taskId, attempt) {
  if (!Array.isArray(state.verifier_attempts)) state.verifier_attempts = [];
  const entry = {
    task_id: taskId,
    iteration: state.iteration,
    attempt: attempt.attempt,
    verdict: attempt.verdict,
    feedback: attempt.feedback || '',
    cost_usd: attempt.cost_usd || 0,
    timestamp: new Date().toISOString(),
  };
  if (state.run_id) entry.run_id = state.run_id;
  state.verifier_attempts.push(entry);
  return entry;
}

/**
 * Spawn the verifier session and return its parsed verdict + cost. cwd is the
 * work cwd (the epic worktree in dag mode). The verdict is parsed from the text
 * result — never from the exit code. A non-zero verifier session exit yields an
 * unparseable verdict (null) UNLESS its text still carries a `Final verdict:`
 * line, so a verifier that crashes can never be read as PASS.
 * @param {Object} args
 * @param {Function} args.spawn - (prompt, cwd) => { stdout, costUsd, ... }
 * @param {string} args.prompt - Assembled verifier prompt
 * @param {string} args.cwd - Work cwd to verify in
 * @returns {{ verdict: 'PASS'|'FAIL'|null, costUsd: number, output: string }}
 */
function spawnVerifierSession({ spawn, prompt, cwd }) {
  const result = spawn(prompt, cwd) || {};
  const output = typeof result.stdout === 'string' ? result.stdout : '';
  return {
    verdict: parseVerdict(output),
    costUsd: typeof result.costUsd === 'number' ? result.costUsd : 0,
    output,
  };
}

/**
 * Run the AF-9 verifier gate + verbatim-feedback retry sub-loop for a task whose
 * session already exited 0 AND passed the deterministic floor.
 *
 * Synchronous by design: when `--verifier` is off this is a no-op returning
 * `{ passed: true, skipped: true }` with NO extra session, so loop behavior is
 * byte-identical to a run without the gate. The whole gate+retry loop lives
 * here — the caller never forks it.
 *
 * Flow per attempt: spawn the verifier in `cwd`, parse its verdict.
 *  - PASS → `{ passed: true }`.
 *  - null (unparseable) → `{ passed: false, unparseable: true, verdict: null }`
 *    — the caller blocks; PASS is NEVER inferred from an exit code.
 *  - FAIL → re-spawn the IMPLEMENTER with verbatim cumulative feedback, re-run
 *    the floor, then re-verify, up to maxRetries. Cost-stop (cost > retry) is
 *    checked BEFORE each re-spawn: if the next attempt would cross maxCost, stop
 *    retrying without spawning. Exhausted → `{ passed: false, verdict: <last> }`.
 *
 * @param {Object} ctx
 * @param {Object} ctx.task - Task under verification ({ id, text, verify, note })
 * @param {Object} ctx.state - Loop state (cost + attempts persisted here)
 * @param {Object} ctx.options - Loop options (maxRetries, maxCost, verifyCommand)
 * @param {string} ctx.cwd - Work cwd
 * @param {Function} ctx.spawnImplementer - (prompt, cwd) => sync session result
 * @param {Function} ctx.spawnVerifier - (prompt, cwd) => sync session result
 * @param {Function} ctx.buildImplementerPrompt - (feedback) => string
 * @param {Function} ctx.runFloor - (cwd) => boolean (re-run the floor)
 * @returns {{ passed: boolean, skipped?: boolean, unparseable?: boolean, verdict?: string|null }}
 */
function runVerifierGate(ctx) {
  const { task, state, options, cwd } = ctx;
  if (!options.verifier) return { passed: true, skipped: true };

  const agentBody = loadVerifierBody();
  // Never spawn a verifier with an empty body — skip it with a warning. The
  // deterministic floor still gated upstream, so the task may still complete.
  if (!agentBody) {
    console.error(
      `[loop] Verifier skipped for ${task.id} — verifier prompt unavailable ` +
        `(${VERIFIER_AGENT_PATH}); deterministic floor still gated`,
    );
    return { passed: true, skipped: true };
  }
  const criteria = buildTaskCriteria(task);

  const maxRetries =
    typeof options.maxRetries === 'number' ? options.maxRetries : DEFAULT_MAX_RETRIES;
  let feedback = '';
  let lastVerdict = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const prompt = assembleVerifierPrompt({
      agentBody,
      task,
      criteria,
      verifyCommand: options.verifyCommand || null,
      feedback,
    });
    console.log(`[loop] Verifying ${task.id} (verifier attempt ${attempt + 1})`);
    const { verdict, costUsd, output } = spawnVerifierSession({
      spawn: ctx.spawnVerifier,
      prompt,
      cwd,
    });
    state.total_cost += costUsd;
    lastVerdict = verdict;
    recordVerifierAttempt(state, task.id, {
      attempt: attempt + 1,
      verdict,
      feedback,
      cost_usd: costUsd,
    });

    if (verdict === 'PASS') return { passed: true, verdict: 'PASS' };
    if (verdict === null) {
      // Unparseable verdict — the AF-9 stop condition. Block, never infer PASS.
      console.error(
        `[loop] Verifier verdict UNPARSEABLE for ${task.id} — blocking (never inferring PASS)`,
      );
      return { passed: false, unparseable: true, verdict: null };
    }

    // FAIL: accumulate verbatim feedback for the next implementer attempt.
    feedback = feedback
      ? `${feedback}\n\n--- Verifier attempt ${attempt + 1} (FAIL) ---\n${output.trim()}`
      : `--- Verifier attempt ${attempt + 1} (FAIL) ---\n${output.trim()}`;

    if (attempt === maxRetries) break; // budget exhausted; block with last verdict

    // Cost-stop > retry: do not re-spawn the implementer if doing so would cross
    // maxCost. Stop retrying and block with the last FAIL verdict.
    if (options.maxCost && state.total_cost >= options.maxCost) {
      console.log(
        `[loop] Cost limit reached before verifier retry ($${state.total_cost}) — blocking`,
      );
      break;
    }

    console.log(`[loop] Verifier FAIL for ${task.id} — re-spawning implementer with feedback`);
    const implResult = ctx.spawnImplementer(ctx.buildImplementerPrompt(feedback), cwd) || {};
    state.total_cost += typeof implResult.costUsd === 'number' ? implResult.costUsd : 0;
    if (implResult.exitCode !== 0) {
      console.log(`[loop] Implementer retry session failed for ${task.id} — blocking`);
      return { passed: false, verdict: lastVerdict };
    }
    // Re-run the AF-8 deterministic floor on the retried work before re-verifying.
    if (!ctx.runFloor(cwd)) {
      console.log(`[loop] Floor failed on retried work for ${task.id} — blocking`);
      return { passed: false, verdict: lastVerdict };
    }
  }

  return { passed: false, verdict: lastVerdict };
}

/**
 * Record a non-passing verifier outcome in loop state. An unparseable verdict is
 * reported distinctly for the verdict-protocol escalation; PASS is never
 * inferred. This never writes the task list — loop.js owns every status marker,
 * so the block transition has exactly one write path.
 * @param {Object} task - Task that failed verification
 * @param {Object} state - Loop state (error + failed_tasks recorded here)
 * @param {{ unparseable?: boolean, verdict?: string|null }} outcome - Gate outcome
 * @returns {false} Always false (callers `return blockOnVerdict(...)`)
 */
function blockOnVerdict(task, state, outcome) {
  const reason = outcome.unparseable
    ? 'Loop: verifier verdict UNPARSEABLE (escalate verdict protocol)'
    : `Loop: verifier FAIL after retries (last verdict: ${outcome.verdict})`;
  recordError(state, task.id, reason, 1);
  if (!Array.isArray(state.failed_tasks)) state.failed_tasks = [];
  state.failed_tasks.push(task.id);
  console.error(`[loop] Task ${task.id} blocked — ${reason}`);
  return false;
}

module.exports = {
  DEFAULT_MAX_RETRIES,
  VERIFIER_AGENT_PATH,
  stripFrontmatter,
  loadVerifierBody,
  buildTaskCriteria,
  assembleVerifierPrompt,
  parseVerdict,
  recordVerifierAttempt,
  spawnVerifierSession,
  runVerifierGate,
  blockOnVerdict,
};
