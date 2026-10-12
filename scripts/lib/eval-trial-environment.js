/**
 * eval-trial-environment.js - The environment a trial and its Setup run in
 *
 * A contained trial does not inherit the operator's environment. Its PATH is
 * rebuilt from a shim directory holding only the tools the trial itself needs
 * plus the system directories, and only an allowlist of variables is forwarded.
 * eval-trial.js builds the environment once per trial and hands the same object
 * to Setup and to the session.
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
// Model and effort variables are left out on purpose: a row records the flag.
const FORWARDED = new Set([
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
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_CUSTOM_HEADERS',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  'CLOUD_ML_REGION',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'AWS_PROFILE',
  'AWS_REGION',
  'AWS_DEFAULT_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_BEARER_TOKEN_BEDROCK',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
]);

const isForwarded = (name) => FORWARDED.has(name) || name.startsWith('LC_');

/**
 * Find an executable the way a shell would, skipping one directory.
 * @param {string} name - Command name
 * @param {string} [pathValue] - PATH to search
 * @param {string} [skipDir] - Directory to ignore (the shim directory itself)
 * @returns {string|undefined} The first match, as the PATH entry spells it
 */
function resolveOnPath(name, pathValue, skipDir) {
  for (const dir of String(pathValue || '').split(path.delimiter)) {
    if (!dir || path.resolve(dir) === skipDir) continue;
    const candidate = path.join(dir, name);
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
 * and any hook that spawns one), `node` (every arcforge hook is a node script)
 * and the npm and npx that ship beside that node.
 *
 * A shim directory, not the tools' own directories: `claude` installs into
 * ~/.local/bin and node into a version manager's bin, and both hold whatever
 * else the operator installed there (uv, global npm CLIs), which would come
 * along and could not be taken away without taking `claude` with it.
 * @param {string} binDir - Shim directory (created when missing)
 * @param {string} [pathValue] - The parent's PATH, searched for `claude`
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
  };
  for (const [name, target] of Object.entries(tools)) {
    const link = path.join(binDir, name);
    const current = readLink(link);
    // A missing `claude` leaves no shim: the spawn then fails by name, as before.
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
 * Build the environment one trial runs in. Setup gets the same object.
 *
 * Contained (isolated or plugin-dir): the allowlist above, and a PATH of the
 * shim directory plus the system directories. Not contained (`--no-isolate`):
 * the operator's environment as it is, since that mode measures the operator's
 * own toolkit and its MCP servers start from the operator's PATH. Either way
 * the arcforge data home points into the trial, so the trial's SessionStart
 * hook reads the Setup-written fixture and never the real ~/.arcforge; HOME is
 * kept so `claude` still resolves its auth.
 * @param {string} trialDir - Trial directory
 * @param {EvalScenario} [_scenario] - The scenario the trial runs
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot] - Project root; the shim directory lives
 *   under its .eval-trials/ (defaults to the working directory)
 * @param {boolean} [opts.contained=true] - False for a `--no-isolate` trial
 * @param {Object} [opts.parentEnv] - Environment to build from (injectable for tests)
 * @returns {Object} Environment for the trial's subprocesses
 */
function trialEnv(trialDir, _scenario = {}, opts = {}) {
  const { projectRoot = process.cwd(), contained = true, parentEnv = process.env } = opts;
  const trialEnvironment = contained ? {} : { ...parentEnv };
  if (contained) {
    for (const name of Object.keys(parentEnv)) {
      if (isForwarded(name)) trialEnvironment[name] = parentEnv[name];
    }
    const binDir = path.join(path.resolve(projectRoot), '.eval-trials', '.bin');
    trialEnvironment.PATH = [ensureToolShims(binDir, parentEnv.PATH), ...SYSTEM_PATH].join(
      path.delimiter,
    );
  }
  trialEnvironment.ARCFORGE_HOME = path.join(trialDir, '.arcforge');
  return trialEnvironment;
}

module.exports = {
  SYSTEM_PATH,
  resolveOnPath,
  ensureToolShims,
  trialEnv,
};
