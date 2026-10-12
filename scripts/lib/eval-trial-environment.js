/**
 * eval-trial-environment.js - The environment a trial and its Setup run in
 *
 * A contained trial does not inherit the operator's environment. Its PATH is
 * rebuilt from a shim directory holding only the tools the trial itself needs
 * plus the system directories, and only an allowlist of variables is forwarded.
 * eval-trial.js builds the environment once per trial and hands the same object
 * to Setup and to the session. A scenario's `## Environment` section is the one
 * way to change it, and this module owns that section's grammar: the parser, the
 * linter and the trial all read it from here.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');
const { ensureDir } = require('./utils');

// What every POSIX host provides. Nothing else of the operator's PATH survives.
const SYSTEM_PATH = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

// Forwarded to a contained trial; every other variable is dropped. Three groups:
// who and where the user is (HOME and XDG_CONFIG_HOME are where `claude` and git
// find their config and credentials, USER is the keychain account), how `claude`
// authenticates and which provider it talks to, and how the network is reached.
// The last two are families, matched by prefix or suffix: a cloud SDK picks its
// credential provider from whichever of its variables are set (a role, a token
// file, a container endpoint), and a list of names always misses one.
const FORWARDED = {
  names: [
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'TERM',
    'LANG',
    'TZ',
    'TMPDIR',
    'XDG_CONFIG_HOME',
    'CLAUDE_CONFIG_DIR',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLOUD_ML_REGION',
    'NODE_EXTRA_CA_CERTS',
    'CURL_CA_BUNDLE',
    'REQUESTS_CA_BUNDLE',
    'NODE_TLS_REJECT_UNAUTHORIZED',
  ],
  // ANTHROPIC_ covers ANTHROPIC_VERTEX_*, ANTHROPIC_BEDROCK_* and
  // ANTHROPIC_FOUNDRY_* as well. AZURE_ is what Foundry's Entra ID sign-in reads.
  prefixes: [
    'LC_',
    'ANTHROPIC_',
    'CLAUDE_CODE_USE_',
    'AWS_',
    'AZURE_',
    'GOOGLE_',
    'GCLOUD_',
    'CLOUDSDK_',
    'SSL_CERT_',
  ],
  // HTTP_PROXY, HTTPS_PROXY, ALL_PROXY, NO_PROXY and their lowercase forms.
  suffixes: ['_PROXY', '_proxy'],
};

// Dropped whatever the families above say. The model is left out on purpose: a
// row records the --model flag. The rest belong to the Claude Code session an
// eval was started from, and no family may ever widen far enough to pass them.
const NEVER_FORWARDED = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_CODE_SESSION_ID',
];

// Dropped with them: ANTHROPIC_DEFAULT_SONNET_MODEL and its siblings remap what
// `--model sonnet` resolves to while the row still records `sonnet`.
const MODEL_REMAP = { prefix: 'ANTHROPIC_DEFAULT_', suffix: '_MODEL' };

// The variables a scenario may point into its trial, so that an install the
// agent performs lands in the trial directory and not in the operator's caches.
const TRIAL_DIR_VARS = new Set([
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'XDG_BIN_HOME',
  'UV_CACHE_DIR',
  'UV_TOOL_DIR',
  'UV_TOOL_BIN_DIR',
  'UV_PYTHON_INSTALL_DIR',
  'UV_INSTALL_DIR',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PIP_CACHE_DIR',
  'NPM_CONFIG_CACHE',
]);

// Where the shim directory sits under the project root. A scenario may not take
// it off PATH: the trial's hooks and Setup find `claude` and `node` by name there.
const SHIM_DIR = path.join('.eval-trials', '.bin');
const SHIM_REMOVAL = 'would remove the directory claude and node resolve from';

const PATH_OPS = { '+=': 'append', '^=': 'prepend', '-=': 'remove' };
const PLACEHOLDER_RE = /^\$\{(PROJECT_ROOT|TRIAL_DIR)\}/;
// biome-ignore lint/suspicious/noTemplateCurlyInString: the scenario placeholder, not a JS template
const TRIAL_DIR_PREFIX = '${TRIAL_DIR}/';

// A declaration is one printable line: a control character has no business in a
// path, and a NUL in one makes Node refuse the whole environment at spawn.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char validation
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

// One spelling per directory, so that two spellings of it compare equal and
// `//` stays the root: trimmed to nothing it would be an empty PATH entry,
// which a shell reads as the working directory.
function withoutTrailingSlash(dir) {
  const normal = path.posix.normalize(dir);
  return normal.length > 1 ? normal.replace(/\/+$/, '') : normal;
}

function isForwarded(name) {
  if (NEVER_FORWARDED.includes(name)) return false;
  if (name.startsWith(MODEL_REMAP.prefix) && name.endsWith(MODEL_REMAP.suffix)) return false;
  return (
    FORWARDED.names.includes(name) ||
    FORWARDED.prefixes.some((prefix) => name.startsWith(prefix)) ||
    FORWARDED.suffixes.some((suffix) => name.endsWith(suffix))
  );
}

// True when a PATH-= value names the shim directory, by placeholder or literally.
function namesShimDir(value, projectRoot) {
  const root = path.resolve(projectRoot);
  const dir = withoutTrailingSlash(value.replace(/^\$\{PROJECT_ROOT\}/, root));
  return dir === path.join(root, SHIM_DIR);
}

/**
 * The `claude` a contained trial's session is spawned from: the shim itself, by
 * its full path. Nothing a scenario puts on PATH is consulted for it.
 * @param {string} projectRoot - Project root
 * @returns {string} Absolute path (the file is missing when the operator has no `claude`)
 */
function claudeShim(projectRoot) {
  return path.join(path.resolve(projectRoot), SHIM_DIR, 'claude');
}

/**
 * Find an executable the way a shell would, skipping one directory.
 * @param {string} name - Command name
 * @param {string} [pathValue] - PATH to search
 * @param {string} [skipDir] - Directory to ignore (the shim directory itself)
 * @returns {string|undefined} The first match, as an absolute path: a relative
 *   PATH entry is resolved against the working directory, as a shell would, and
 *   an empty entry (`:/usr/bin`) is the working directory itself
 */
function resolveOnPath(name, pathValue, skipDir) {
  if (!pathValue) return undefined;
  for (const dir of String(pathValue).split(path.delimiter)) {
    if (path.resolve(dir) === skipDir) continue;
    const candidate = path.resolve(dir, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* not here — keep looking */
    }
  }
  return undefined;
}

/**
 * Point the shim directory at the tools a trial needs: `claude` (the session,
 * and any hook that spawns one), `node` (every arcforge hook is a node script),
 * the npm and npx that ship beside that node, and `python3` (fixture Setup
 * scripts call it, and pyenv or Homebrew keep it off the system directories).
 *
 * A shim directory, not the tools' own directories: `claude` installs into
 * ~/.local/bin and node into a version manager's bin, and both hold whatever
 * else the operator installed there (uv, global npm CLIs), which would come
 * along and could not be taken away without taking `claude` with it.
 * @param {string} binDir - Shim directory (created when missing)
 * @param {string} [pathValue] - The parent's PATH, searched for `claude` and `python3`
 * @returns {string} binDir
 */
function ensureToolShims(binDir, pathValue) {
  ensureDir(binDir);
  const nodeDir = path.dirname(process.execPath);
  const tools = {
    claude: resolveOnPath('claude', pathValue, binDir),
    node: process.execPath,
    npm: path.join(nodeDir, 'npm'),
    npx: path.join(nodeDir, 'npx'),
    python3: resolveOnPath('python3', pathValue, binDir),
  };
  for (const [name, target] of Object.entries(tools)) {
    const link = path.join(binDir, name);
    const current = readLink(link);
    // A missing `claude` leaves no shim: the spawn then fails, and the row says so.
    // A missing `python3` leaves none either, and a Setup that calls it fails.
    const wanted = target && fs.existsSync(target) ? target : undefined;
    if (current === wanted) continue;
    fs.rmSync(link, { force: true });
    if (wanted) fs.symlinkSync(wanted, link);
  }
  return binDir;
}

function readLink(link) {
  try {
    return fs.readlinkSync(link);
  } catch {
    return undefined; // no shim yet
  }
}

/**
 * The declarations in a `## Environment` section: its lines, minus blanks and
 * `#` comments.
 * @param {string[]} [sectionLines] - The section's raw lines
 * @returns {Array<{ text: string, offset: number }>} offset is the 0-based line
 *   within the section
 */
function environmentLines(sectionLines = []) {
  return sectionLines
    .map((line, offset) => ({ text: line.trim(), offset }))
    .filter(({ text }) => text && !text.startsWith('#'));
}

/**
 * Why a declared path is not acceptable, or undefined when it is. A path is one
 * directory, absolute once expanded: it starts with `/` or with one of the two
 * placeholders, and never climbs with `..`.
 * @param {string} value - The declared value, placeholders unexpanded
 * @returns {string|undefined} Reason
 */
function pathProblem(value) {
  if (!value) return 'has no value';
  if (/[\s:]/.test(value)) return 'takes one directory, with no whitespace and no ":"';
  const rest = value.replace(PLACEHOLDER_RE, '');
  if (/[$~]/.test(rest)) {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the scenario placeholders, not a JS template
    return 'expands only a leading ${PROJECT_ROOT} or ${TRIAL_DIR}; no other variable and no "~"';
  }
  if (rest === value && !value.startsWith('/')) return 'must be an absolute path';
  if (rest !== value && rest && !rest.startsWith('/')) return 'needs a "/" after the placeholder';
  if (rest.split('/').includes('..')) return 'must not contain a ".." segment';
  return undefined;
}

/**
 * Parse one declaration.
 *
 *   PATH+=<dir>   append a directory        PATH^=<dir>   prepend one
 *   PATH-=<dir>   remove one                <VAR>=<dir>   point a cache variable
 *                                                         inside the trial
 * @param {string} text - One trimmed, non-comment line
 * @param {string} projectRoot - Project root, whose shim directory stays on PATH
 * @returns {{ directive?: { name: string, op: string, value: string }, error?: string }}
 */
function parseEnvironmentLine(text, projectRoot) {
  if (CONTROL_CHAR_RE.test(text)) return { error: 'contains a control character' };
  const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)(\+=|\^=|-=|=)(.*)$/);
  if (!match) return { error: 'expected PATH+=<dir>, PATH^=<dir>, PATH-=<dir> or <VAR>=<dir>' };
  const [, name, operator, value] = match;
  if (name === 'PATH') {
    if (operator === '=') {
      return { error: 'PATH cannot be replaced; use PATH+= (append), PATH^= (prepend) or PATH-=' };
    }
    const problem =
      pathProblem(value) ||
      (operator === '-=' && namesShimDir(value, projectRoot) ? SHIM_REMOVAL : undefined);
    return problem
      ? { error: `PATH${operator} ${problem}` }
      : { directive: { name, op: PATH_OPS[operator], value } };
  }
  if (!TRIAL_DIR_VARS.has(name)) {
    return {
      error: `${name} is not a variable a scenario may declare (PATH, ${[...TRIAL_DIR_VARS].join(', ')})`,
    };
  }
  if (operator !== '=') return { error: `${name} takes "=", not "${operator}"` };
  const problem =
    pathProblem(value) ||
    (value.startsWith(TRIAL_DIR_PREFIX) && value.length > TRIAL_DIR_PREFIX.length
      ? undefined
      : `must point inside the trial: start it with ${TRIAL_DIR_PREFIX}`);
  return problem ? { error: `${name} ${problem}` } : { directive: { name, op: 'set', value } };
}

/**
 * Parse a scenario's declarations, collecting every problem.
 * @param {string[]} [declarations] - Lines as environmentLines() returns their text
 * @param {string} [projectRoot] - Project root (defaults to the working directory)
 * @returns {{ directives: Object[], errors: Array<{ index: number, message: string }> }}
 */
function parseEnvironment(declarations = [], projectRoot = process.cwd()) {
  const directives = [];
  const errors = [];
  const set = new Set();
  declarations.forEach((text, index) => {
    const { directive, error } = parseEnvironmentLine(text, projectRoot);
    const repeated = directive?.op === 'set' && set.has(directive.name);
    if (error || repeated) {
      errors.push({ index, message: error || `${directive.name} is declared twice` });
    } else {
      if (directive.op === 'set') set.add(directive.name);
      directives.push(directive);
    }
  });
  return { directives, errors };
}

/**
 * A scenario's directives, or a refusal naming every bad line. Trials call this
 * before they create anything, so a bad declaration costs no fixture.
 * @param {EvalScenario} [scenario]
 * @param {string} [projectRoot] - Project root (defaults to the working directory)
 * @returns {Object[]} Directives, in declared order
 */
function declaredEnvironment(scenario = {}, projectRoot = process.cwd()) {
  const declarations = scenario.environment || [];
  const { directives, errors } = parseEnvironment(declarations, projectRoot);
  if (errors.length > 0) {
    // JSON-quoted, so a control character in a refused line is shown escaped.
    const detail = errors
      .map((e) => `${JSON.stringify(declarations[e.index])}: ${e.message}`)
      .join('; ');
    throw new Error(`Scenario ${scenario.name || ''} has a bad ## Environment line: ${detail}`);
  }
  return directives;
}

/**
 * Apply a scenario's directives to an environment, in declared order.
 * @param {Object} trialEnvironment - Environment to change (the caller's own copy)
 * @param {Object[]} directives - From declaredEnvironment()
 * @param {{ projectRoot: string, trialDir: string }} roots - Placeholder values
 * @throws {Error} when a value does not expand to an absolute directory
 */
function applyDirectives(trialEnvironment, directives, { projectRoot, trialDir }) {
  const expand = (value) =>
    withoutTrailingSlash(
      value.replace(PLACEHOLDER_RE, (_m, name) =>
        name === 'TRIAL_DIR' ? trialDir : path.resolve(projectRoot),
      ),
    );
  let entries = String(trialEnvironment.PATH || '')
    .split(path.delimiter)
    .filter(Boolean);
  for (const { name, op, value } of directives) {
    const dir = expand(value);
    if (!path.posix.isAbsolute(dir)) {
      throw new Error(`"${value}" expands to "${dir}", not an absolute directory`);
    }
    if (op === 'set') {
      trialEnvironment[name] = dir;
      continue;
    }
    entries = entries.filter((entry) => withoutTrailingSlash(entry) !== dir);
    if (op === 'append') entries.push(dir);
    if (op === 'prepend') entries.unshift(dir);
  }
  trialEnvironment.PATH = entries.join(path.delimiter);
}

/**
 * Build the environment one trial runs in. Setup gets the same object.
 *
 * Contained (isolated or plugin-dir): the allowlist above, and a PATH of the
 * shim directory plus the system directories. Not contained (`--no-isolate`):
 * the operator's environment as it is, since that mode measures the operator's
 * own toolkit and its MCP servers start from the operator's PATH. Either way
 * the arcforge data home points into the trial, so the trial's SessionStart
 * hook reads the Setup-written fixture and never the real ~/.arcforge; HOME is
 * kept so `claude` still resolves its auth. The scenario's `## Environment`
 * directives are applied last, the same for every arm.
 * @param {string} trialDir - Trial directory
 * @param {EvalScenario} [scenario] - The scenario the trial runs; its
 *   `environment` lines are the only part read
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot] - Project root; the shim directory lives
 *   under its .eval-trials/ (defaults to the working directory)
 * @param {boolean} [opts.contained=true] - False for a `--no-isolate` trial
 * @param {Object} [opts.parentEnv] - Environment to build from (injectable for tests)
 * @returns {Object} Environment for the trial's subprocesses
 * @throws {Error} when a `## Environment` line is not valid, or expands to no
 *   absolute directory
 */
function trialEnv(trialDir, scenario = {}, opts = {}) {
  const { projectRoot = process.cwd(), contained = true, parentEnv = process.env } = opts;
  const directives = declaredEnvironment(scenario, projectRoot);
  const trialEnvironment = contained ? {} : { ...parentEnv };
  if (contained) {
    for (const name of Object.keys(parentEnv)) {
      if (isForwarded(name)) trialEnvironment[name] = parentEnv[name];
    }
    const binDir = path.join(path.resolve(projectRoot), SHIM_DIR);
    trialEnvironment.PATH = [ensureToolShims(binDir, parentEnv.PATH), ...SYSTEM_PATH].join(
      path.delimiter,
    );
  }
  trialEnvironment.ARCFORGE_HOME = path.join(trialDir, '.arcforge');
  if (directives.length > 0)
    applyDirectives(trialEnvironment, directives, { projectRoot, trialDir });
  return trialEnvironment;
}

module.exports = {
  SYSTEM_PATH,
  TRIAL_DIR_VARS,
  claudeShim,
  resolveOnPath,
  ensureToolShims,
  environmentLines,
  parseEnvironment,
  declaredEnvironment,
  trialEnv,
};
