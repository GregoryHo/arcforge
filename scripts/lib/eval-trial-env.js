/**
 * eval-trial-env.js - Trial directory lifecycle and isolation settings
 *
 * Extracted from eval.js to maintain file size limits. Manages the isolated
 * temp directories each trial runs in: creation, git boundary, cleanup, setup
 * command execution, and the .claude/settings.json isolation payload.
 *
 * Dependency direction is one-way: eval.js imports and re-exports the public
 * functions here; this module never imports from ./eval.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execCommand, ensureDir, sanitizeFilename } = require('./utils');

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
  const trialDir = fs.mkdtempSync(path.join(base, prefix));
  initializeGitBoundary(trialDir);
  return trialDir;
}

/**
 * Initialize a minimal git repository boundary in a trial directory.
 * This is best-effort and intentionally avoids spawning git so unit-test exec
 * mocks and eval process accounting are not affected.
 * @param {string} trialDir - Trial directory path
 */
function initializeGitBoundary(trialDir) {
  try {
    const gitDir = path.join(trialDir, '.git');
    fs.mkdirSync(path.join(gitDir, 'objects'), { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs', 'tags'), { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(
      path.join(gitDir, 'config'),
      '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n',
    );
  } catch {
    /* silent — git boundary is best-effort */
  }
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

module.exports = {
  createTrialDir,
  cleanupTrialDir,
  runSetup,
  writeIsolationSettings,
  buildIsolationSettings,
};
