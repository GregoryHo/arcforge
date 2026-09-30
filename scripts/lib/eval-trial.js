/**
 * eval-trial.js - Run one eval trial: spawn the claude session, classify how it ended
 *
 * Owns the per-trial ceiling, the trial prompt, the transcript file, and the
 * TrialResult row a trial produces before grading. eval.js orchestrates trials
 * and re-exports the public functions here; this module never imports ./eval.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execCommand, ensureDir, getTimestamp, CLAUDE_MAX_BUFFER } = require('./utils');
const { compactDate, parseEvalName, resolveMaxTurns } = require('./eval-scenario');
const {
  createTrialDir,
  runSetup,
  writeIsolationSettings,
  buildIsolationSettings,
} = require('./eval-trial-env');
const { parseStreamJsonOutput, parseActionsFromTranscript } = require('./eval-transcript');
const { isTrialKilled, isOutputComplete, isProviderRefusal } = require('./eval-trial-outcome');
const { watchForWrites } = require('./eval-trial-guard');

// Roots already reported as too large for the write check in this process.
const warnedTooLarge = new Set();

// Mirror of eval.js constants to avoid circular imports
const RESULTS_DIR = path.join('evals', 'results');

// Per-trial ceiling for the spawned `claude -p` session. 900s is the standing
// instrument (see the lineage note at the execCommand call); a treatment whose
// pipeline builds or renders can run past it on a loaded machine, so one run can
// move the ceiling without editing the engine. A killed trial never scores.
const DEFAULT_TRIAL_TIMEOUT_MS = 900000;

/**
 * Resolve the per-trial timeout: ARCFORGE_EVAL_TRIAL_TIMEOUT_MS when set, else the default.
 * @param {NodeJS.ProcessEnv} [env] - Environment to read (injectable for tests)
 * @returns {number} Timeout in milliseconds
 */
function resolveTrialTimeoutMs(env = process.env) {
  const raw = env.ARCFORGE_EVAL_TRIAL_TIMEOUT_MS;
  if (raw === undefined || raw === '') return DEFAULT_TRIAL_TIMEOUT_MS;
  const ms = Number(raw);
  if (!Number.isInteger(ms) || ms <= 0) {
    throw new Error(
      `ARCFORGE_EVAL_TRIAL_TIMEOUT_MS must be a positive integer of milliseconds, got ${JSON.stringify(raw)}`,
    );
  }
  return ms;
}

/**
 * Run a single eval trial by spawning a Claude session.
 * Runs in a temp directory for workspace safety. When isolated (default),
 * plugins are disabled and MCP servers stripped. When not isolated,
 * the agent has access to the full toolkit (plugins, MCP, skills, hooks).
 * @param {EvalScenario} scenario - The eval scenario
 * @param {number} trialNumber - Trial number (1-indexed)
 * @param {number} totalTrials - Total number of trials (k)
 * @param {Object} options - Run options
 * @param {string} [options.projectRoot] - Project root (for transcript storage + code grading)
 * @param {string} [options.isolationSettings] - Cached isolation settings JSON
 * @param {boolean} [options.isolated=true] - Whether to disable plugins and MCP
 * @param {string} [options.pluginDir] - Plugin directory for semi-isolated mode
 * @param {number} [options.maxTurns] - Max turns for Claude CLI
 * @param {boolean} [options.skipPermissions] - Pass --dangerously-skip-permissions
 *   (default: when a plugin dir is loaded). A comparison passes one value to both arms.
 * @returns {TrialResult} Trial result
 */
function runTrial(scenario, trialNumber, totalTrials, options = {}) {
  const {
    projectRoot = process.cwd(),
    label,
    isolationSettings,
    isolated = true,
    model,
    effort,
    runId,
    pluginDir: rawPluginDir,
    maxTurns: rawMaxTurns,
    skipPermissions: rawSkipPermissions,
  } = options;
  // Resolved before anything else so a bad override is refused ahead of the
  // fixture Setup and the session (B-10), and recorded on every row it produces.
  const trialTimeoutMs = resolveTrialTimeoutMs();
  const timestamp = getTimestamp();

  const buildInfraError = (error, errorType, extra = {}) => {
    const evalName = label ? `${scenario.name}-${label}` : scenario.name;
    return {
      eval: evalName,
      trial: trialNumber,
      k: totalTrials,
      passed: false,
      grader: scenario.grader,
      score: 0,
      timestamp,
      duration_ms: null,
      api_duration_ms: null,
      input_tokens: null,
      output_tokens: null,
      trialTimeoutMs,
      error,
      errorType,
      infraError: true,
      model: model || 'default',
      effort: effort || 'default',
      ...(runId ? { runId } : {}),
      ...extra,
    };
  };

  // Merge CLI overrides with scenario defaults (only when not fully isolated)
  const pluginDir = rawPluginDir || (!isolated ? scenario.pluginDir : undefined) || undefined;

  // Validate pluginDir exists before running trial
  if (pluginDir && !fs.existsSync(path.resolve(pluginDir))) {
    return buildInfraError(`Plugin dir does not exist: ${pluginDir}`, 'plugin_dir_missing');
  }

  // Always run in trial dir for workspace safety
  const trialDir = createTrialDir(scenario.name, trialNumber, projectRoot);
  try {
    if (scenario.setup) runSetup(scenario.setup, trialDir, projectRoot);
  } catch (error) {
    return buildInfraError(error.message || String(error), 'setup_failed', { trialDir });
  }

  // Isolation mode: full isolation uses writeIsolationSettings,
  // pluginDir uses semi-isolation (no claudeMdExcludes)
  if (pluginDir) {
    const semiSettings = isolationSettings || buildIsolationSettings({ excludeClaudeMd: false });
    writeIsolationSettings(trialDir, semiSettings);
  } else if (isolated) {
    writeIsolationSettings(trialDir, isolationSettings);
  }

  const prompt = buildTrialPrompt(scenario);

  const claudeArgs = buildClaudeArgs({
    trialDir,
    contained: isolated || Boolean(pluginDir),
    pluginDir,
    skipPermissions: rawSkipPermissions ?? Boolean(pluginDir),
    maxTurns: resolveMaxTurns({
      maxTurns: rawMaxTurns,
      scenarioMaxTurns: scenario.maxTurns,
      pluginDir,
    }),
    model,
    effort,
  });

  // Debug: log command for troubleshooting
  if (process.env.EVAL_DEBUG) {
    console.error(`[eval-debug] cwd: ${trialDir}`);
    console.error(`[eval-debug] cmd: claude ${claudeArgs.join(' ')}`);
    console.error(`[eval-debug] prompt: ${prompt.slice(0, 100)}...`);
  }
  const writesSince = watchForWrites([projectRoot, pluginDir]);
  const t0 = Date.now();
  const result = execCommand('claude', claudeArgs, {
    input: prompt,
    cwd: trialDir,
    // 900s: same instrument-fix lineage as the 300s→600s raise below. P6's
    // brainstorming scenario (a design conversation, baseline avg 472s) had
    // 2/5 baseline trials ETIMEDOUT at the 600s ceiling and their partial
    // transcripts scored as real behavior — the exact defect class P4 recorded
    // (killed AND incomplete must not score). Raising the ceiling is an
    // instrument fix, not a rubric change (scenario hashes unaffected).
    // P4 history: 300s clipped four of five two-axis treatment trials.
    // ARCFORGE_EVAL_TRIAL_TIMEOUT_MS moves the ceiling for one run.
    timeout: trialTimeoutMs,
    maxBuffer: CLAUDE_MAX_BUFFER,
    // Redirect ONLY the arcforge data home (not HOME) to the trial's isolated
    // fixture. getArcforgeHome() honors ARCFORGE_HOME before falling back to
    // ~/.arcforge, so the trial's SessionStart hook reads the Setup-written
    // fixture under TRIAL_DIR/.arcforge instead of the real ~/.arcforge. Real
    // HOME is preserved so the claude trial still resolves ~/.claude auth.
    env: { ...process.env, ARCFORGE_HOME: path.join(trialDir, '.arcforge') },
  });
  const wallDuration = Date.now() - t0;
  const repoWrites = writesSince();
  for (const { root, seen } of repoWrites.incomplete) {
    if (warnedTooLarge.has(root)) continue; // one line per run, not per trial
    warnedTooLarge.add(root);
    process.stderr.write(
      `Error: ${root} is too large for the write check (stopped after ${seen} files); the trial is recorded as repo_check_skipped and does not score.\n`,
    );
  }

  if (process.env.EVAL_DEBUG) {
    console.error(`[eval-debug] exitCode: ${result.exitCode}`);
    console.error(`[eval-debug] stdout length: ${(result.stdout || '').length}`);
    console.error(`[eval-debug] stderr: ${(result.stderr || '').slice(0, 300)}`);
  }

  const evalName = label ? `${scenario.name}-${label}` : scenario.name;
  // With stream-json, stdout may contain valid tool-use data even on non-zero exit
  // (e.g., max-turns reached). Try stdout first, fall back to stderr.
  const rawOutput = result.stdout || result.stderr || '';
  const { textResult, richTranscript, usage } = parseStreamJsonOutput(rawOutput);
  // duration_ms is the trial's wall-clock cost, measured around the subprocess.
  // The CLI's own `duration_ms` (result event) covers only the API turn — it
  // excludes process start, hook and MCP init, and teardown, so preferring it
  // under-reports a trial by seconds (measured: 1,882 ms reported vs 6,994 ms
  // wall on a one-turn trial) and, because a killed trial emits no result event
  // at all, it silently mixes two different clocks across a pool. Both clocks
  // are kept: duration_ms for cost/ceiling analysis, api_duration_ms for the
  // model-side time the CLI attributes to the turn.
  const duration_ms = wallDuration;
  const api_duration_ms = usage.duration_ms;
  const parsedOutput = richTranscript || textResult;
  const transcriptOutput = parsedOutput || rawOutput;
  const transcript = saveTranscript(evalName, trialNumber, transcriptOutput, projectRoot, runId);
  const actions = parseActionsFromTranscript(richTranscript);

  const base = {
    eval: evalName,
    trial: trialNumber,
    k: totalTrials,
    passed: false, // Will be set by grader
    grader: scenario.grader,
    score: 0,
    timestamp,
    duration_ms,
    api_duration_ms,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    trialTimeoutMs,
    transcript,
    trialDir,
    ...(actions.length > 0 ? { actions } : {}),
    model: model || 'default',
    effort: effort || 'default',
    ...(runId ? { runId } : {}),
  };
  // A tree too large to snapshot was not checked, so the trial may have changed
  // it unseen: fail closed rather than score an unverified trial.
  if (repoWrites.incomplete.length > 0) {
    return {
      ...base,
      output: parsedOutput || '',
      repoCheck: 'skipped',
      error: `Repository too large for the write check: ${repoWrites.incomplete
        .map(({ root, seen }) => `${root} (${seen}+ files)`)
        .join(', ')}`,
      errorType: 'repo_check_skipped',
      infraError: true,
    };
  }

  // A trial that changed the repository it ran from measured a different
  // environment than its arm describes, and may have changed what the next
  // trial sees. It is an instrument failure whatever it scored (eval-10).
  if (repoWrites.changed.length > 0) {
    const shown = repoWrites.changed.slice(0, 5).join(', ');
    const more = repoWrites.changed.length > 5 ? ` and ${repoWrites.changed.length - 5} more` : '';
    return {
      ...base,
      output: parsedOutput || '',
      error: `Trial wrote outside its directory: ${shown}${more}`,
      errorType: 'trial_wrote_repo',
      infraError: true,
    };
  }

  // A trial the runner killed before the agent finished its turn is an
  // instrument failure, not behaviour: its half transcript otherwise grades as
  // if the agent had chosen to stop there (P4 defect A — four of five two-axis
  // treatment trials clipped at the 300s ceiling scored 0.2 with no error flag,
  // so scorableResults() kept them and the delta moved against the treatment).
  // Killed AND incomplete, both: a killed trial that had already delivered its
  // answer is a valid measurement (the same P4 pool has one, scored 1.0).
  if (isTrialKilled(result) && !isOutputComplete({ textResult, actions })) {
    return {
      ...base,
      output: parsedOutput || '',
      error: 'Trial killed before the agent finished its turn (runner timeout)',
      errorType: 'trial_killed_incomplete',
      infraError: true,
    };
  }

  // A provider refusal (session limit, quota) is the provider talking, not the
  // agent: scored, the fixture's own files pass some assertions and an exhausted
  // quota reads as a behavioral regression (#195). Excluded like a killed trial.
  if (isProviderRefusal({ textResult, actions, usage })) {
    return {
      ...base,
      output: parsedOutput || '',
      error: `Provider refused the trial in place of the agent's turn: ${textResult.trim().slice(0, 200)}`,
      errorType: 'provider_refusal',
      infraError: true,
    };
  }

  if (result.exitCode !== 0 && !parsedOutput) {
    // Only treat as error if no usable output was captured
    return { ...base, error: result.stderr };
  }

  if (parsedOutput) {
    return { ...base, output: parsedOutput };
  }

  return {
    ...base,
    output: '',
    error: 'No assistant output captured from stream-json output',
    errorType: 'trial_output_missing',
    infraError: true,
  };
}

/**
 * Build the `claude -p` argv for one trial.
 *
 * Everything but `--plugin-dir` is a function of options a comparison passes to
 * both arms alike, so the two arms' argv differ only by the plugin injection.
 * A contained trial (isolated, or loading a plugin under test) drops the user
 * settings file (`--setting-sources project,local`): that is what keeps the
 * operator's hooks, output style, model and effort level out of both arms at
 * once, while a plugin-dir arm still gets its plugin's hooks (B-7, #170).
 * @param {Object} opts
 * @param {string} opts.trialDir - Trial working directory (named in the advisory)
 * @param {boolean} opts.contained - Isolated or plugin-dir trial (not --no-isolate)
 * @param {string} [opts.pluginDir] - Plugin to load
 * @param {boolean} [opts.skipPermissions] - Run without permission prompts
 * @param {number} [opts.maxTurns] - Resolved turn budget
 * @param {string} [opts.model] - Model flag value
 * @param {string} [opts.effort] - Effort flag value
 * @returns {string[]} argv after `claude`
 */
function buildClaudeArgs({
  trialDir,
  contained,
  pluginDir,
  skipPermissions,
  maxTurns,
  model,
  effort,
}) {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--no-session-persistence',
    '--disable-slash-commands',
  ];
  if (contained) {
    args.push('--strict-mcp-config', '--setting-sources', 'project,local');
    // Advisory only — the trial is not a sandbox; watchForWrites() catches the
    // trials that ignore it.
    args.push(
      '--append-system-prompt',
      `You are running in an isolated eval trial. Your working directory is ${trialDir}, and every file you need is already in it — do not read, search, or access files outside this directory.`,
    );
  }
  if (pluginDir) args.push('--plugin-dir', path.resolve(pluginDir));
  // Eval trials run unattended in ephemeral dirs — no human to approve permission prompts
  if (skipPermissions) args.push('--dangerously-skip-permissions');
  if (maxTurns != null) args.push('--max-turns', String(maxTurns));
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  return args;
}

/**
 * Save full trial output to a transcript file
 * @param {string} evalName - Eval name (may include label suffix)
 * @param {number} trialNumber - Trial number
 * @param {string} output - Full output text
 * @param {string} projectRoot - Project root directory
 * @returns {string} Path to transcript file
 */
function saveTranscript(evalName, trialNumber, output, projectRoot, runId) {
  const { scenarioName, condition } = parseEvalName(evalName);
  const prefix = runId || compactDate();
  const transcriptsPath = path.join(projectRoot, RESULTS_DIR, scenarioName, prefix, 'transcripts');
  ensureDir(transcriptsPath);
  const fileName =
    condition === 'results' ? `trial-${trialNumber}.txt` : `${condition}-trial-${trialNumber}.txt`;
  const filePath = path.join(transcriptsPath, fileName);
  fs.writeFileSync(filePath, output);
  return filePath;
}

/**
 * Build a prompt for a trial run
 * @param {EvalScenario} scenario - The eval scenario
 * @returns {string} Prompt text
 */
function buildTrialPrompt(scenario) {
  const parts = [];

  if (scenario.context) {
    parts.push(`## Context\n${scenario.context}`);
  }

  parts.push(`## Task\n${scenario.scenario}`);

  // Assertions are NOT included in the prompt — they are grading criteria
  // for the grader (Step 4), not requirements for the agent (Step 3).

  return parts.join('\n\n');
}

module.exports = {
  DEFAULT_TRIAL_TIMEOUT_MS,
  resolveTrialTimeoutMs,
  runTrial,
  buildClaudeArgs,
  saveTranscript,
  buildTrialPrompt,
};
