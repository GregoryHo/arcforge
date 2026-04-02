/**
 * eval.js - Eval harness for measuring skill/agent/workflow effectiveness
 *
 * Orchestrates eval runs: loads scenarios, spawns trial sessions,
 * tracks results as JSONL, and computes pass@k metrics.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execCommand, ensureDir, getTimestamp, sanitizeFilename, CLAUDE_MAX_BUFFER } = require('./utils');
const stats = require('./eval-stats');
const graders = require('./eval-graders');

/**
 * Eval scenario parsed from a markdown file
 * @typedef {Object} EvalScenario
 * @property {string} name - Eval name
 * @property {string} scope - 'skill' | 'agent' | 'workflow'
 * @property {string} scenario - The prompt/task to run
 * @property {string} context - Setup context
 * @property {string[]} assertions - List of assertions to verify
 * @property {string} grader - 'code' | 'model' | 'human'
 * @property {string} graderConfig - Grader-specific configuration
 * @property {string} setup - Shell command to prepare trial directory (empty = use projectRoot)
 */

/**
 * Single trial result
 * @typedef {Object} TrialResult
 * @property {string} eval - Eval scenario name
 * @property {number} trial - Trial number
 * @property {number} k - Total trials planned
 * @property {boolean} passed - Whether this trial passed
 * @property {string} grader - Grader type used
 * @property {number} score - Score from 0.0 to 1.0
 * @property {string} timestamp - ISO timestamp
 * @property {string} [transcript] - Path to transcript file
 * @property {string} [trialDir] - Isolated temp directory used for this trial
 * @property {string} [error] - Error message if failed
 * @property {string} [errorType] - Machine-readable error category (e.g., 'model_grader_failed')
 * @property {boolean} [gradeError] - True if the grader failed to produce a score
 * @property {boolean} [infraError] - True if the trial runner failed to capture output
 * @property {number[]} [assertionScores] - Per-assertion scores (0.0-1.0)
 * @property {string[]} [evidence] - Per-assertion evidence notes from grader
 * @property {number[][]} [blockRefs] - Per-assertion transcript block references (1-indexed)
 * @property {Array<{type: string, name?: string, args?: string, content?: string, index: number}>} [actions] - Parsed actions from transcript
 */

const EVALS_DIR = 'evals';
const SCENARIOS_DIR = path.join(EVALS_DIR, 'scenarios');
const RESULTS_DIR = path.join(EVALS_DIR, 'results');
const BENCHMARKS_DIR = path.join(EVALS_DIR, 'benchmarks');

/**
 * Extract compact YYYYMMDD date from an ISO timestamp.
 * Used as fallback directory name when runId is not provided.
 * @param {string} [isoTimestamp] - ISO timestamp (defaults to now)
 * @returns {string} Compact date (e.g., '20260320')
 */
function compactDate(isoTimestamp) {
  return (isoTimestamp || getTimestamp()).slice(0, 10).replace(/-/g, '');
}

/**
 * Parse an eval name into scenario name and condition.
 * Used by appendResult, saveTranscript, and loadResults to derive storage paths.
 * @param {string} evalName - Eval name (may include -baseline or -treatment suffix)
 * @returns {{ scenarioName: string, condition: string }}
 */
function parseEvalName(evalName) {
  const isBaseline = evalName.endsWith('-baseline');
  const isTreatment = evalName.endsWith('-treatment');
  const condition = isBaseline ? 'baseline' : isTreatment ? 'treatment' : 'results';
  const scenarioName = sanitizeFilename(evalName.replace(/-(baseline|treatment)$/, ''));
  return { scenarioName, condition };
}

/**
 * Resolve max-turns with priority: CLI > scenario > pluginDir default (10) > undefined.
 * @param {Object} opts
 * @param {number} [opts.maxTurns] - CLI-specified max turns
 * @param {number} [opts.scenarioMaxTurns] - Scenario ## Max Turns value
 * @param {string} [opts.pluginDir] - Plugin dir (triggers default of 10)
 * @returns {number|undefined} Resolved max turns, or undefined if none applies
 */
function resolveMaxTurns(opts = {}) {
  if (opts.maxTurns != null) return opts.maxTurns;
  if (opts.scenarioMaxTurns != null) return opts.scenarioMaxTurns;
  if (opts.pluginDir) return 10;
  return undefined;
}

/**
 * Parse an eval scenario from a markdown file
 * @param {string} filePath - Path to scenario markdown file
 * @param {string} [projectRoot] - Project root for ${PROJECT_ROOT} expansion
 * @returns {EvalScenario} Parsed scenario
 */
function parseScenario(filePath, projectRoot) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sections = {};
  let currentSection = null;
  const lines = content.split('\n');

  let insideFence = false;
  let heredocMarker = null;
  for (const line of lines) {
    if (/^`{3,}/.test(line)) insideFence = !insideFence;

    // Ignore ## headers inside heredocs (they contain arbitrary text)
    if (!insideFence && !heredocMarker) {
      const heredocMatch = line.match(/<<-?\s*['"]?(\w+)['"]?\s*$/);
      if (heredocMatch) heredocMarker = heredocMatch[1];
    } else if (heredocMarker && line.trim() === heredocMarker) {
      heredocMarker = null;
    }

    const headerMatch = !insideFence && !heredocMarker && line.match(/^##\s+(.+)/);
    if (headerMatch) {
      currentSection = headerMatch[1].trim().toLowerCase();
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  const nameMatch = content.match(/^#\s+Eval:\s*(.+)/m);
  const name = nameMatch ? nameMatch[1].trim() : path.basename(filePath, '.md');

  const assertions = (sections.assertions || [])
    .filter((line) => line.match(/^-\s*\[[ x]?\]/))
    .map((line) => line.replace(/^-\s*\[[ x]?\]\s*/, '').trim());

  const section = (key) => (sections[key] || []).join('\n').trim();
  const trialsRaw = section('trials');
  const trials = trialsRaw ? parseInt(trialsRaw, 10) : undefined;
  const version = section('version');
  const target = section('target');

  // Plugin Dir: resolve ${PROJECT_ROOT} or use absolute path
  const pluginDirRaw = section('plugin dir');
  let pluginDir;
  if (pluginDirRaw) {
    pluginDir = projectRoot
      ? pluginDirRaw.replace(/\$\{PROJECT_ROOT\}/g, projectRoot)
      : pluginDirRaw;
  }

  // Max Turns: parse as integer
  const maxTurnsRaw = section('max turns');
  const maxTurns = maxTurnsRaw ? parseInt(maxTurnsRaw, 10) : undefined;

  return {
    name,
    scope: section('scope') || 'skill',
    scenario: section('scenario'),
    context: section('context'),
    assertions,
    grader: section('grader') || 'code',
    graderConfig: section('grader config'),
    setup: section('setup'),
    ...(target ? { target } : {}),
    ...(trials && !Number.isNaN(trials) ? { trials } : {}),
    ...(version ? { version } : {}),
    ...(pluginDir ? { pluginDir } : {}),
    ...(maxTurns && !Number.isNaN(maxTurns) ? { maxTurns } : {}),
  };
}

/**
 * List all eval scenarios
 * @param {string} projectRoot - Project root directory
 * @returns {string[]} List of scenario file paths
 */
function listScenarios(projectRoot) {
  const scenariosPath = path.join(projectRoot, SCENARIOS_DIR);
  if (!fs.existsSync(scenariosPath)) {
    return [];
  }
  return fs
    .readdirSync(scenariosPath)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(scenariosPath, f));
}

/**
 * Find a scenario by name
 * @param {string} name - Scenario name to find
 * @param {string} projectRoot - Project root directory
 * @returns {EvalScenario|undefined} Parsed scenario, or undefined if not found
 */
function findScenario(name, projectRoot) {
  for (const f of listScenarios(projectRoot)) {
    const s = parseScenario(f, projectRoot);
    if (s.name === name) return s;
  }
  return undefined;
}

/**
 * Create an isolated trial directory under the project root.
 * Uses .eval-trials/ (gitignored) to avoid macOS permission dialogs
 * that occur when running from /var/folders/ temp directories.
 * @param {string} evalName - Eval name for prefix
 * @param {number} trialNumber - Trial number
 * @param {string} [projectRoot] - Project root directory
 * @returns {string} Absolute path to trial directory
 */
function createTrialDir(evalName, trialNumber, projectRoot) {
  const base = projectRoot
    ? path.join(projectRoot, '.eval-trials')
    : path.join(process.cwd(), '.eval-trials');
  ensureDir(base);
  const prefix = `${sanitizeFilename(evalName)}-t${trialNumber}-`;
  return fs.mkdtempSync(path.join(base, prefix));
}

/**
 * Clean up a trial directory. Only removes paths inside .eval-trials/ or os.tmpdir().
 * @param {string} [trialDir] - Path to trial directory
 */
function cleanupTrialDir(trialDir) {
  if (!trialDir) return;
  const isEvalTrial = trialDir.includes('.eval-trials');
  const isTmp = trialDir.startsWith(os.tmpdir());
  if (!isEvalTrial && !isTmp) return;
  try {
    fs.rmSync(trialDir, { recursive: true, force: true });
  } catch {
    /* silent — trial dir cleanup is best-effort */
  }
}

/**
 * Run a setup command in the trial directory.
 * Injects PROJECT_ROOT env var so setup can reference project files.
 * @param {string} setupCommand - Shell command to execute
 * @param {string} trialDir - Working directory for setup
 * @param {string} [projectRoot] - Project root for $PROJECT_ROOT env var
 */
function runSetup(setupCommand, trialDir, projectRoot) {
  const env = { ...process.env };
  if (projectRoot) env.PROJECT_ROOT = projectRoot;
  const { exitCode, stderr } = execCommand('sh', ['-c', setupCommand], {
    cwd: trialDir,
    timeout: 30000,
    env,
  });
  if (exitCode !== 0) {
    throw new Error(`Setup failed: ${stderr}`);
  }
}

/**
 * Write isolation settings to a trial directory.
 * Disables all user plugins, excludes user/project CLAUDE.md files,
 * and initializes a git repo to create a project boundary (prevents
 * Claude Code from walking up to the parent project's CLAUDE.md and rules).
 * @param {string} trialDir - Path to trial temp directory
 * @param {string} [cachedSettings] - Pre-built settings JSON (avoids repeated plugin list calls)
 */
function writeIsolationSettings(trialDir, cachedSettings) {
  const claudeDir = path.join(trialDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const settings = cachedSettings || buildIsolationSettings();
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), settings);
}

/**
 * Build isolation settings JSON string (cached for reuse across trials).
 * Queries installed plugins and generates settings to disable all of them.
 * @param {Object} [opts] - Options
 * @param {boolean} [opts.excludeClaudeMd=true] - Exclude CLAUDE.md/rules (full isolation).
 *   Set false for semi-isolation (plugin-dir mode) where the plugin needs project context.
 * @returns {string} JSON string for .claude/settings.json
 */
function buildIsolationSettings({ excludeClaudeMd = true } = {}) {
  const baseSettings = {
    autoMemoryEnabled: false,
    ...(excludeClaudeMd
      ? { claudeMdExcludes: ['**/CLAUDE.md', '**/CLAUDE.local.md', '**/rules/**'] }
      : {}),
  };
  try {
    const { stdout, exitCode } = execCommand('claude', ['plugin', 'list', '--json'], {
      timeout: 10000,
    });
    if (exitCode !== 0 || !stdout) return JSON.stringify(baseSettings);
    const plugins = JSON.parse(stdout);
    if (!Array.isArray(plugins)) return JSON.stringify(baseSettings);
    const disabled = {};
    for (const p of plugins) disabled[p.id] = false;
    return JSON.stringify({ ...baseSettings, enabledPlugins: disabled });
  } catch {
    return JSON.stringify(baseSettings);
  }
}

/**
 * Parse stream-json output from `claude -p --output-format stream-json --verbose`.
 * Extracts assistant messages with tool calls to build a rich transcript
 * showing the full conversation flow (text + tool use in order).
 * @param {string} rawOutput - Raw JSONL output from stream-json
 * @returns {{ textResult: string, richTranscript: string }}
 */
function parseStreamJsonOutput(rawOutput) {
  if (!rawOutput) return { textResult: '', richTranscript: '' };

  const lines = rawOutput.split('\n').filter((l) => l.trim());
  const parts = [];
  let textResult = '';

  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          parts.push(`[Assistant] ${block.text}`);
        } else if (block.type === 'tool_use') {
          const inputSummary = summarizeToolInput(block.name, block.input);
          parts.push(`[Tool: ${block.name}] ${inputSummary}`);
        }
      }
    } else if (event.type === 'result') {
      textResult = event.result || '';
    }
  }

  return { textResult, richTranscript: parts.join('\n\n') };
}

/**
 * Parse a rich transcript into structured Action objects.
 * Rich transcripts are produced by parseStreamJsonOutput() and contain
 * blocks like "[Tool: Bash] $ ls" and "[Assistant] some text" separated
 * by double newlines.
 * @param {string} richTranscript - Rich transcript text
 * @returns {Array<{type: string, name?: string, args?: string, content?: string, index: number}>}
 */
function parseActionsFromTranscript(richTranscript) {
  if (!richTranscript) return [];
  const blocks = richTranscript.split('\n\n').filter((b) => b.trim());
  const actions = [];
  for (const block of blocks) {
    const toolMatch = block.match(/^\[Tool: ([^\]]+)\]\s*(.*)/);
    if (toolMatch) {
      const firstLine = toolMatch[2].split('\n')[0];
      actions.push({ type: 'tool', name: toolMatch[1], args: firstLine, index: actions.length });
      continue;
    }
    const textMatch = block.match(/^\[Assistant\]\s*([\s\S]*)/);
    if (textMatch) {
      actions.push({ type: 'text', content: textMatch[1].trim(), index: actions.length });
    }
  }
  return actions;
}

/**
 * Summarize tool input for transcript readability.
 * Shows key details without overwhelming the transcript.
 * @param {string} toolName - Tool name (Write, Edit, Bash, etc.)
 * @param {Object} input - Tool input parameters
 * @returns {string} Human-readable summary
 */
function summarizeToolInput(toolName, input) {
  if (!input) return '';
  switch (toolName) {
    case 'Write': {
      const content = input.content || '';
      return `${input.file_path || ''}\n\`\`\`\n${content}\n\`\`\``;
    }
    case 'Edit': {
      const old = input.old_string || '';
      const rep = input.new_string || '';
      const maxLen = 300;
      return `${input.file_path || ''} (replace "${old.slice(0, maxLen)}${old.length > maxLen ? '...' : ''}" → "${rep.slice(0, maxLen)}${rep.length > maxLen ? '...' : ''}")`;
    }
    case 'Read':
      return input.file_path || '';
    case 'Bash':
      return `$ ${input.command || ''}`;
    case 'Glob':
      return `pattern: ${input.pattern || ''}`;
    case 'Grep':
      return `pattern: ${input.pattern || ''} ${input.path ? `in ${input.path}` : ''}`;
    default:
      return JSON.stringify(input).slice(0, 200);
  }
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
 * @returns {TrialResult} Trial result
 */
function runTrial(scenario, trialNumber, totalTrials, options = {}) {
  const {
    projectRoot = process.cwd(),
    label,
    isolationSettings,
    isolated = true,
    model,
    runId,
    pluginDir: rawPluginDir,
    maxTurns: rawMaxTurns,
  } = options;
  const timestamp = getTimestamp();

  // Merge CLI overrides with scenario defaults (only when not fully isolated)
  const pluginDir = rawPluginDir || (!isolated ? scenario.pluginDir : undefined) || undefined;

  // Validate pluginDir exists before running trial
  if (pluginDir && !fs.existsSync(path.resolve(pluginDir))) {
    const evalName = label ? `${scenario.name}-${label}` : scenario.name;
    return {
      eval: evalName,
      trial: trialNumber,
      k: totalTrials,
      passed: false,
      grader: scenario.grader,
      score: 0,
      timestamp,
      error: `Plugin dir does not exist: ${pluginDir}`,
      infraError: true,
      ...(model ? { model } : {}),
      ...(runId ? { runId } : {}),
    };
  }

  // Always run in trial dir for workspace safety
  const trialDir = createTrialDir(scenario.name, trialNumber, projectRoot);
  if (scenario.setup) runSetup(scenario.setup, trialDir, projectRoot);

  // Isolation mode: full isolation uses writeIsolationSettings,
  // pluginDir uses semi-isolation (no claudeMdExcludes)
  if (pluginDir) {
    const semiSettings = isolationSettings || buildIsolationSettings({ excludeClaudeMd: false });
    writeIsolationSettings(trialDir, semiSettings);
  } else if (isolated) {
    writeIsolationSettings(trialDir, isolationSettings);
  }

  const prompt = buildTrialPrompt(scenario);

  const claudeArgs = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--no-session-persistence',
    '--disable-slash-commands',
  ];
  if (isolated && !pluginDir) {
    claudeArgs.push('--strict-mcp-config');
    claudeArgs.push(
      '--append-system-prompt',
      `IMPORTANT: You are running in an isolated eval trial. Your working directory is ${trialDir}. Do NOT read, search, or access any files outside this directory. All files you need are already in the working directory.`,
    );
  }
  if (pluginDir) {
    claudeArgs.push('--plugin-dir', path.resolve(pluginDir));
    // Eval trials run unattended in ephemeral dirs — no human to approve permission prompts
    claudeArgs.push('--dangerously-skip-permissions');
  }

  // Resolve max-turns: CLI > scenario > pluginDir default (10)
  const resolvedMaxTurns = resolveMaxTurns({
    maxTurns: rawMaxTurns,
    scenarioMaxTurns: scenario.maxTurns,
    pluginDir,
  });
  if (resolvedMaxTurns != null) claudeArgs.push('--max-turns', String(resolvedMaxTurns));

  if (model) claudeArgs.push('--model', model);

  // Debug: log command for troubleshooting
  if (process.env.EVAL_DEBUG) {
    console.error(`[eval-debug] cwd: ${trialDir}`);
    console.error(`[eval-debug] cmd: claude ${claudeArgs.join(' ')}`);
    console.error(`[eval-debug] prompt: ${prompt.slice(0, 100)}...`);
  }
  const result = execCommand('claude', claudeArgs, {
    input: prompt,
    cwd: trialDir,
    timeout: 300000,
    maxBuffer: CLAUDE_MAX_BUFFER,
  });
  if (process.env.EVAL_DEBUG) {
    console.error(`[eval-debug] exitCode: ${result.exitCode}`);
    console.error(`[eval-debug] stdout length: ${(result.stdout || '').length}`);
    console.error(`[eval-debug] stderr: ${(result.stderr || '').slice(0, 300)}`);
  }

  const evalName = label ? `${scenario.name}-${label}` : scenario.name;
  // With stream-json, stdout may contain valid tool-use data even on non-zero exit
  // (e.g., max-turns reached). Try stdout first, fall back to stderr.
  const rawOutput = result.stdout || result.stderr || '';
  const { textResult, richTranscript } = parseStreamJsonOutput(rawOutput);
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
    transcript,
    trialDir,
    ...(actions.length > 0 ? { actions } : {}),
    ...(model ? { model } : {}),
    ...(runId ? { runId } : {}),
  };
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
 * Execute a single trial: run → grade → append → callback → cleanup.
 * Shared helper for both sequential and interleaved A/B modes.
 * @param {EvalScenario} trialScenario - Scenario to run (may have skill instruction in context)
 * @param {EvalScenario} gradeScenario - Original scenario for grading (without skill instruction)
 * @param {number} trialNumber - Trial number (1-indexed)
 * @param {number} k - Total trials per condition
 * @param {Object} opts - { projectRoot, label, onTrialComplete }
 * @returns {TrialResult} Graded result
 */
function executeAndGradeTrial(trialScenario, gradeScenario, trialNumber, k, opts) {
  const {
    projectRoot,
    label,
    onTrialComplete,
    isolationSettings,
    isolated,
    model,
    runId,
    pluginDir,
    maxTurns,
  } = opts;
  const result = runTrial(trialScenario, trialNumber, k, {
    projectRoot,
    label,
    isolationSettings,
    isolated,
    model,
    runId,
    pluginDir,
    maxTurns,
  });
  try {
    const graded = graders.gradeTrialResult(result, gradeScenario, projectRoot, result.actions);
    const versioned = gradeScenario.version
      ? { ...graded, version: gradeScenario.version }
      : graded;
    appendResult(versioned, projectRoot);
    if (onTrialComplete) onTrialComplete(label, trialNumber, versioned);
    return versioned;
  } finally {
    cleanupTrialDir(result.trialDir);
  }
}

/**
 * Run an A/B eval: execute k trials for each condition, grade, compute delta.
 * Shared by both skill and workflow evals — only the options differ.
 * @param {EvalScenario} baseScenario - Scenario for baseline trials
 * @param {EvalScenario} treatScenario - Scenario for treatment trials (may differ from base)
 * @param {EvalScenario} gradeScenario - Original scenario for grading
 * @param {number} k - Trials per condition
 * @param {Object} bOpts - Baseline trial options
 * @param {Object} tOpts - Treatment trial options
 * @param {boolean} interleave - Alternate baseline/treatment trials
 * @returns {{ baseline: TrialResult[], treatment: TrialResult[], delta: number }}
 */
function runAbTrials(baseScenario, treatScenario, gradeScenario, k, bOpts, tOpts, interleave) {
  const baseline = [];
  const treatment = [];

  if (interleave) {
    for (let t = 1; t <= k; t++) {
      baseline.push(executeAndGradeTrial(baseScenario, gradeScenario, t, k, bOpts));
      treatment.push(executeAndGradeTrial(treatScenario, gradeScenario, t, k, tOpts));
    }
  } else {
    for (let t = 1; t <= k; t++) {
      baseline.push(executeAndGradeTrial(baseScenario, gradeScenario, t, k, bOpts));
    }
    for (let t = 1; t <= k; t++) {
      treatment.push(executeAndGradeTrial(treatScenario, gradeScenario, t, k, tOpts));
    }
  }

  return { baseline, treatment, delta: stats.computeDelta(baseline, treatment) };
}

/**
 * Run a skill eval as A/B comparison: baseline (without skill) vs treatment (with skill).
 * Both conditions run in isolated environments; the treatment prepends skill instruction.
 * @param {EvalScenario} scenario - Scenario with scope='skill'
 * @param {number} k - Number of trials per condition
 * @param {Object} options - Run options
 * @param {string} [options.projectRoot] - Project root
 * @param {string} [options.skillInstruction] - Instruction to prepend for treatment trials
 * @param {boolean} [options.interleave=false] - Alternate baseline/treatment trials
 * @returns {{ baseline: TrialResult[], treatment: TrialResult[], delta: number }}
 */
function runSkillEval(scenario, k, options = {}) {
  const {
    projectRoot = process.cwd(),
    skillInstruction,
    onTrialComplete,
    interleave = false,
    model,
    runId,
    pluginDir,
    maxTurns,
  } = options;
  const isolationSettings = buildIsolationSettings();

  const treatmentScenario = {
    ...scenario,
    context: skillInstruction ? `${skillInstruction}\n\n${scenario.context}` : scenario.context,
  };

  const bOpts = {
    projectRoot,
    label: 'baseline',
    onTrialComplete,
    isolationSettings,
    model,
    runId,
  };
  const tOpts = {
    projectRoot,
    label: 'treatment',
    onTrialComplete,
    isolationSettings,
    model,
    runId,
    ...(pluginDir ? { pluginDir, isolated: false } : {}),
    ...(maxTurns != null ? { maxTurns } : {}),
  };
  return runAbTrials(scenario, treatmentScenario, scenario, k, bOpts, tOpts, interleave);
}

/**
 * Run a workflow eval as A/B comparison: isolated baseline vs semi-isolated/non-isolated treatment.
 * Baseline always runs fully isolated. Treatment uses semi-isolated mode with --plugin-dir
 * when the scenario has a pluginDir field; otherwise falls back to non-isolated mode.
 * @param {EvalScenario} scenario - Scenario with scope='workflow'
 * @param {number} k - Number of trials per condition
 * @param {Object} options - Run options
 * @param {string} [options.projectRoot] - Project root
 * @param {boolean} [options.interleave=false] - Alternate baseline/treatment trials
 * @param {Function} [options.onTrialComplete] - Callback per trial
 * @returns {{ baseline: TrialResult[], treatment: TrialResult[], delta: number }}
 */
function runWorkflowEval(scenario, k, options = {}) {
  const {
    projectRoot = process.cwd(),
    onTrialComplete,
    interleave = false,
    model,
    runId,
    pluginDir,
    maxTurns,
  } = options;
  const isolationSettings = buildIsolationSettings();
  const resolvedPluginDir = pluginDir || scenario.pluginDir;
  // Cache semi-isolation settings once (avoids spawning `claude plugin list` per trial)
  const semiSettings = resolvedPluginDir
    ? buildIsolationSettings({ excludeClaudeMd: false })
    : undefined;

  const bOpts = {
    projectRoot,
    label: 'baseline',
    onTrialComplete,
    isolationSettings,
    isolated: true,
    model,
    runId,
  };

  const tOpts = {
    projectRoot,
    label: 'treatment',
    onTrialComplete,
    isolated: false,
    model,
    runId,
    ...(resolvedPluginDir ? { pluginDir: resolvedPluginDir, isolationSettings: semiSettings } : {}),
    ...(maxTurns != null ? { maxTurns } : {}),
  };
  return runAbTrials(scenario, scenario, scenario, k, bOpts, tOpts, interleave);
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

/**
 * Append a trial result to the results JSONL file
 * @param {TrialResult} result - Trial result
 * @param {string} projectRoot - Project root directory
 */
function appendResult(result, projectRoot) {
  const resultsPath = path.join(projectRoot, RESULTS_DIR);

  // Truncate output for storage only (grading already used full output)
  const maxStorageLen = 50000;
  const storable =
    result.output && result.output.length > maxStorageLen
      ? { ...result, output: `${result.output.slice(0, maxStorageLen)}\n[truncated for storage]` }
      : result;

  const { scenarioName, condition } = parseEvalName(storable.eval);
  const runId = storable.runId || compactDate(storable.timestamp);
  const runDir = path.join(resultsPath, scenarioName, runId);
  ensureDir(runDir);
  const filePath = path.join(runDir, `${condition}.jsonl`);

  fs.appendFileSync(filePath, `${JSON.stringify(storable)}\n`);
}

/**
 * Load results for a specific eval with optional filtering.
 * Uses exact segment match to avoid cross-eval contamination.
 * @param {string} evalName - Eval scenario name
 * @param {string} projectRoot - Project root directory
 * @param {Object} [options] - Filter options
 * @param {string} [options.version] - Only include results matching this version
 * @param {string} [options.since] - Only include results with timestamp >= this ISO date string
 * @returns {TrialResult[]} Filtered results for this eval
 */
function loadResults(evalName, projectRoot, options = {}) {
  const resultsPath = path.join(projectRoot, RESULTS_DIR);
  if (!fs.existsSync(resultsPath)) {
    return [];
  }

  const results = [];
  const { scenarioName, condition } = parseEvalName(evalName);
  const sinceCompact = options.since ? options.since.slice(0, 10).replace(/-/g, '') : undefined;

  // ── 1. Hierarchical: results/{scenarioName}/*/{condition}.jsonl ──
  const scenarioDir = path.join(resultsPath, scenarioName);
  let foundHierarchical = false;
  if (fs.existsSync(scenarioDir) && fs.statSync(scenarioDir).isDirectory()) {
    foundHierarchical = true;
    const entries = fs.readdirSync(scenarioDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'transcripts') continue;
      // Date filter on runId prefix (first 8 chars = YYYYMMDD)
      if (sinceCompact && entry.name.slice(0, 8) < sinceCompact) continue;

      const jsonlPath = path.join(scenarioDir, entry.name, `${condition}.jsonl`);
      if (!fs.existsSync(jsonlPath)) continue;

      const content = fs.readFileSync(jsonlPath, 'utf8');
      for (const line of content.split('\n').filter((l) => l.trim())) {
        try {
          results.push(JSON.parse(line));
        } catch {
          /* skip malformed lines */
        }
      }
    }
  }

  // ── 2. Legacy flat: results/{date}-{evalName}.jsonl ──
  if (!foundHierarchical) {
    const suffix = `-${evalName}.jsonl`;
    const sinceDate = options.since ? options.since.slice(0, 10) : undefined;
    const files = fs.readdirSync(resultsPath).filter((f) => {
      if (!f.endsWith(suffix)) return false;
      const prefix = f.slice(0, f.length - suffix.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(prefix)) return false;
      if (sinceDate && prefix < sinceDate) return false;
      return true;
    });

    for (const file of files) {
      const content = fs.readFileSync(path.join(resultsPath, file), 'utf8');
      for (const line of content.split('\n').filter((l) => l.trim())) {
        try {
          results.push(JSON.parse(line));
        } catch {
          /* skip malformed lines */
        }
      }
    }
  }

  // ── 3. Apply filters ──
  if (!options.version && !options.since && !options.model) return results;
  return results.filter((r) => {
    if (options.version && (r.version || '1') !== options.version) return false;
    if (options.since && r.timestamp < options.since) return false;
    if (options.model && r.model !== options.model) return false;
    return true;
  });
}

/**
 * Generate a benchmark summary from results
 * @param {string} projectRoot - Project root directory
 * @returns {Object} Benchmark data
 */
function generateBenchmark(projectRoot) {
  const scenarioFiles = listScenarios(projectRoot);
  const benchmarks = {};

  for (const file of scenarioFiles) {
    const scenario = parseScenario(file);
    // For A/B scopes (skill/workflow), prefer treatment results from A/B runs.
    // Fall back to plain name for single-condition runs (eval run, not eval ab).
    const isAb = scenario.scope === 'skill' || scenario.scope === 'workflow';
    const filterOpts = { version: scenario.version };
    let results = isAb ? loadResults(`${scenario.name}-treatment`, projectRoot, filterOpts) : [];
    if (results.length === 0) {
      results = loadResults(scenario.name, projectRoot, filterOpts);
    }

    if (results.length === 0) continue;

    const s = stats.statsFromResults(results);
    const warning = stats.confidenceWarning(results);

    // Group by model for per-model breakdown
    const modelGroups = {};
    for (const r of results) {
      if (!r.model) continue;
      if (!modelGroups[r.model]) modelGroups[r.model] = [];
      modelGroups[r.model].push(r);
    }
    const byModel = {};
    for (const [m, modelResults] of Object.entries(modelGroups)) {
      const ms = stats.statsFromResults(modelResults);
      byModel[m] = {
        trials: ms.count,
        pass_rate: ms.passRate,
        avg_score: ms.avg,
        last_run: modelResults[modelResults.length - 1].timestamp,
      };
    }

    benchmarks[scenario.name] = {
      scope: scenario.scope,
      grader: scenario.grader,
      trials: s.count,
      pass_rate: s.passRate,
      avg_score: s.avg,
      stddev: s.stddev,
      ci95: s.ci95,
      pass_at_k: stats.passAtK(results),
      pass_all_k: stats.passAllK(results),
      last_run: results[results.length - 1].timestamp,
      ...(warning ? { warning } : {}),
      ...(Object.keys(byModel).length > 0 ? { by_model: byModel } : {}),
    };
  }

  const benchmark = {
    generated: getTimestamp(),
    evals: benchmarks,
  };

  const benchmarkPath = path.join(projectRoot, BENCHMARKS_DIR);
  ensureDir(benchmarkPath);
  const json = `${JSON.stringify(benchmark, null, 2)}\n`;
  fs.writeFileSync(path.join(benchmarkPath, 'latest.json'), json);

  // Write timestamped snapshot for history (same-day runs overwrite)
  const dateStr = benchmark.generated.split('T')[0];
  fs.writeFileSync(path.join(benchmarkPath, `${dateStr}.json`), json);

  return benchmark;
}

/**
 * Ensure evals directory structure exists
 * @param {string} projectRoot - Project root directory
 */
function ensureEvalsDir(projectRoot) {
  ensureDir(path.join(projectRoot, SCENARIOS_DIR));
  ensureDir(path.join(projectRoot, RESULTS_DIR));
  ensureDir(path.join(projectRoot, BENCHMARKS_DIR));
}

/**
 * Compare baseline vs treatment results, routing by grader type.
 * Code-graded scenarios get fast programmatic delta.
 * Model/human-graded scenarios also get eval-comparator agent analysis.
 * @param {EvalScenario} scenario - Eval scenario
 * @param {TrialResult[]} baseline - Baseline results
 * @param {TrialResult[]} treatment - Treatment results
 * @param {string} projectRoot - Project root directory
 * @returns {{ delta: number, verdict: string, baseline: Object, treatment: Object, modelAnalysis?: Object }}
 */
function compareResults(scenario, baseline, treatment, projectRoot) {
  const bStats = stats.statsFromResults(baseline);
  const tStats = stats.statsFromResults(treatment);
  const delta = stats.computeDelta(baseline, treatment);
  const deltaCi = stats.ciForDelta(baseline, treatment);
  const baselineWarning = stats.baselineVarianceWarning(baseline, {
    avg: bStats.avg,
    stddev: bStats.stddev,
  });
  const result = {
    delta,
    deltaCi,
    verdict: stats.verdictFromDeltaCI(baseline, treatment),
    baseline: bStats,
    treatment: tStats,
    ...(baselineWarning ? { baselineWarning } : {}),
  };

  if (scenario.grader !== 'code') {
    const metrics = {
      baseline: bStats,
      treatment: tStats,
      delta,
      deltaCi,
      verdict: result.verdict,
      ...(baselineWarning ? { baselineWarning } : {}),
    };
    const modelAnalysis = graders.compareWithModel(
      scenario,
      baseline,
      treatment,
      projectRoot,
      metrics,
    );
    if (modelAnalysis) result.modelAnalysis = modelAnalysis;
  }

  return result;
}

module.exports = {
  // Orchestration
  parseEvalName,
  parseScenario,
  listScenarios,
  findScenario,
  createTrialDir,
  cleanupTrialDir,
  runSetup,
  writeIsolationSettings,
  buildIsolationSettings,
  buildPluginDirSettings: () => buildIsolationSettings({ excludeClaudeMd: false }),
  parseStreamJsonOutput,
  parseActionsFromTranscript,
  resolveMaxTurns,
  runTrial,
  buildTrialPrompt,
  executeAndGradeTrial,
  runSkillEval,
  runWorkflowEval,
  saveTranscript,
  appendResult,
  loadResults,
  generateBenchmark,
  compareResults,
  ensureEvalsDir,
  // Re-export graders for backward compatibility
  ...graders,
  // Re-export stats for backward compatibility
  ...stats,
  // Constants
  EVALS_DIR,
  SCENARIOS_DIR,
  RESULTS_DIR,
  BENCHMARKS_DIR,
};
