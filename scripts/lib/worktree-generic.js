/**
 * worktree-generic.js — generic (non-epic) worktree engine.
 *
 * Backs the `arcforge worktree add|list|remove` CLI subcommands. Generic
 * worktrees reuse the canonical derivation from worktree-paths.js with a
 * null specId (the documented legacy-null hash branch), so they live at
 * ~/.arcforge/worktrees/<project>-<hash6>-<slug>/ beside epic worktrees
 * with no hash collision (epic hashes fold the spec id in).
 *
 * Discrimination needs NO new marker file:
 *   kind = parseWorktreePath × hasArcforgeMarker
 *     managed ∧ marker  → epic     (coordinator lifecycle: expand/cleanup)
 *     managed ∧ ¬marker → generic  (this module)
 *     ¬managed          → base (first such entry) or external
 *
 * Error strategy: lib tier — throw with context. The CLI catch prints the
 * message and exits 1.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { getDefaultInstallCommand } = require('./package-manager');
const { hasArcforgeMarker, readArcforgeMarker } = require('./marker');
const { sanitizeProjectName } = require('./utils');
const { getWorktreeRoot, getWorktreePath, parseWorktreePath } = require('./worktree-paths');

function runGit(args, cwd) {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: err.status || 1,
    };
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function branchExists(projectRoot, branch) {
  return (
    runGit(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], projectRoot).exitCode === 0
  );
}

/**
 * Create a generic worktree at the canonical location.
 *
 * Branch defaults to `name`; an existing branch is checked out as-is, a
 * missing one is created from `from` (default: HEAD of the base checkout).
 *
 * @param {Object} options
 * @param {string} options.projectRoot - Repository root the worktree belongs to.
 * @param {string} options.name - Worktree name; slugified for the directory name.
 * @param {string} [options.branch] - Branch to check out (default: name).
 * @param {string} [options.from] - Base ref when creating a new branch (default: HEAD).
 * @param {boolean} [options.setup=false] - Auto-detect and run the project installer.
 * @returns {{name: string, slug: string, branch: string, branch_created: boolean, path: string}}
 */
function addGenericWorktree({ projectRoot, name, branch, from, setup = false }) {
  requireNonEmptyString(projectRoot, 'projectRoot');
  requireNonEmptyString(name, 'name');
  const root = path.resolve(projectRoot);

  const slug = sanitizeProjectName(name);
  const worktreePath = getWorktreePath(root, null, slug);
  if (fs.existsSync(worktreePath)) {
    throw new Error(`Worktree already exists at ${worktreePath}`);
  }

  const branchName = branch || name;
  const exists = branchExists(root, branchName);
  if (exists && from) {
    throw new Error(
      `Branch '${branchName}' already exists — --from only applies when creating a new branch. ` +
        'Drop --from to check out the existing branch.',
    );
  }

  fs.mkdirSync(getWorktreeRoot(), { recursive: true });
  const gitArgs = exists
    ? ['worktree', 'add', worktreePath, branchName]
    : ['worktree', 'add', worktreePath, '-b', branchName, from || 'HEAD'];
  const result = runGit(gitArgs, root);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to create worktree '${slug}': ${result.stderr.trim()}`);
  }

  const out = { name, slug, branch: branchName, branch_created: !exists, path: worktreePath };
  if (setup) out.setup_command = runProjectSetup(worktreePath, slug);
  return out;
}

/**
 * Auto-detect and run the project installer inside a fresh worktree.
 * Returns the command string that ran, or null when no installer applies.
 */
function runProjectSetup(worktreePath, slug) {
  const installCmd = getDefaultInstallCommand(worktreePath);
  if (!installCmd) return null;
  try {
    const [cmd, ...cmdArgs] = installCmd;
    // stdio: 'inherit' streams installer output live and avoids the 1 MB
    // maxBuffer that `npm install` can exceed (same rationale as the
    // coordinator's _runSubprocess).
    execFileSync(cmd, cmdArgs, { cwd: worktreePath, stdio: 'inherit' });
  } catch (err) {
    throw new Error(
      `Project setup failed for '${slug}' (exit ${err.status || 1}). Command: ${installCmd.join(' ')}`,
    );
  }
  return installCmd.join(' ');
}

/**
 * List every worktree git knows about, annotated by kind.
 *
 * Kinds: `base` (first non-managed entry — the main checkout), `epic`
 * (managed path carrying an .arcforge-epic marker; `epic`/`spec_id` are
 * attached), `generic` (managed, no marker), `external` (any other
 * non-managed entry, e.g. a user-placed raw-git worktree).
 *
 * @param {Object} options
 * @param {string} options.projectRoot - Any checkout of the repository.
 * @returns {{count: number, worktrees: Array<Object>}}
 */
function listWorktrees({ projectRoot }) {
  requireNonEmptyString(projectRoot, 'projectRoot');
  const root = path.resolve(projectRoot);

  const result = runGit(['worktree', 'list', '--porcelain'], root);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to list worktrees: ${result.stderr.trim()}`);
  }

  const entries = [];
  let current = null;
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice(9) };
      entries.push(current);
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice(5);
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    }
  }

  let baseAssigned = false;
  const worktrees = entries.map((entry) => {
    const managed = parseWorktreePath(entry.path) !== null;
    const marked = hasArcforgeMarker(entry.path);
    let kind;
    if (managed) {
      kind = marked ? 'epic' : 'generic';
    } else if (!baseAssigned) {
      kind = 'base';
      baseAssigned = true;
    } else {
      kind = 'external';
    }
    const item = { path: entry.path, branch: entry.branch || null, head: entry.head || null, kind };
    if (marked) {
      const marker = readArcforgeMarker(entry.path);
      item.epic = marker?.epic ?? null;
      item.spec_id = marker?.spec_id ?? null;
    }
    return item;
  });

  return { count: worktrees.length, worktrees };
}

/**
 * Remove a generic worktree and prune git's registry.
 *
 * Refuses epic (marker-bearing) worktrees — those belong to the
 * coordinator's `arcforge cleanup` — and refuses non-managed paths
 * outright (external worktrees are managed with raw git). A dirty tree
 * is refused unless `force` is set.
 *
 * @param {Object} options
 * @param {string} options.projectRoot - Repository root the worktree belongs to.
 * @param {string} options.target - Worktree name, or an absolute managed path.
 * @param {boolean} [options.force=false] - Remove even with uncommitted changes.
 * @returns {{removed: boolean, path: string}}
 */
function removeGenericWorktree({ projectRoot, target, force = false }) {
  requireNonEmptyString(projectRoot, 'projectRoot');
  requireNonEmptyString(target, 'target');
  const root = path.resolve(projectRoot);

  const resolved = path.isAbsolute(target)
    ? path.resolve(target)
    : getWorktreePath(root, null, sanitizeProjectName(target));
  if (parseWorktreePath(resolved) === null) {
    throw new Error(
      `Not an arcforge-managed worktree: ${resolved}. External worktrees are removed with raw git (git worktree remove).`,
    );
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Worktree not found: ${resolved}`);
  }
  if (hasArcforgeMarker(resolved)) {
    throw new Error(
      `Refusing to remove epic worktree ${resolved} — it is tracked by the coordinator DAG. Use \`arcforge cleanup\` instead.`,
    );
  }

  const status = runGit(['status', '--porcelain'], resolved);
  if (status.exitCode !== 0) {
    throw new Error(`Failed to check worktree status: ${status.stderr.trim()}`);
  }
  if (status.stdout.trim() && !force) {
    throw new Error(
      `Worktree has uncommitted changes: ${resolved}. Pass --force to remove anyway.`,
    );
  }

  // Filesystem remove + one prune, same approach as the coordinator's
  // cleanupWorktrees: `git worktree remove` is fragile around untracked
  // files, while rm + prune has the same net effect on git state.
  fs.rmSync(resolved, { recursive: true, force: true });
  const prune = runGit(['worktree', 'prune'], root);
  if (prune.exitCode !== 0) {
    throw new Error(`git worktree prune failed: ${prune.stderr.trim()}`);
  }

  return { removed: true, path: resolved };
}

/**
 * Single dispatch entry for the `worktree` CLI command. Returns the result
 * object for the caller to print; throws on usage errors and failures.
 *
 * @param {Object} args - Parsed CLI args ({ positional, flags, options }).
 * @param {string} projectRoot
 * @returns {Object}
 */
function runWorktreeCommand(args, projectRoot) {
  const sub = args.positional[0];
  if (sub === 'add') {
    const name = args.positional[1];
    if (!name)
      throw new Error('Usage: worktree add <name> [--branch <b>] [--from <ref>] [--setup]');
    return addGenericWorktree({
      projectRoot,
      name,
      branch: args.options.branch,
      from: args.options.from,
      setup: Boolean(args.flags.setup),
    });
  }
  if (sub === 'list') {
    return listWorktrees({ projectRoot });
  }
  if (sub === 'remove') {
    const target = args.positional[1];
    if (!target) throw new Error('Usage: worktree remove <name> [--force]');
    return removeGenericWorktree({ projectRoot, target, force: Boolean(args.flags.force) });
  }
  throw new Error(
    'Usage: worktree add <name> [--branch <b>] [--from <ref>] [--setup] | worktree list [--json] | worktree remove <name> [--force]',
  );
}

module.exports = {
  addGenericWorktree,
  listWorktrees,
  removeGenericWorktree,
  runWorktreeCommand,
};
