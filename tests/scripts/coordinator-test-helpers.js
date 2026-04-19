const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { stringifyDagYaml, parseDagYaml } = require('../../scripts/lib/yaml-parser');
const { TaskStatus } = require('../../scripts/lib/models');
const { getEpicBranchName } = require('../../scripts/lib/worktree-paths');

/** Spec id used by default fixtures — tests pass this to Coordinator. */
const DEFAULT_SPEC_ID = 'test-spec';

/**
 * Run a git command in the given directory. Returns stdout.
 */
function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

/**
 * Create a temporary git repo with a per-spec dag.yaml containing two
 * pending epics at `specs/<specId>/dag.yaml`.
 *
 * @param {Object} [options]
 * @param {string} [options.prefix] - tmpdir prefix (default: 'arcforge-test-')
 * @param {string} [options.specId] - spec id (default: 'test-spec')
 * @param {string[]} [options.createBranches] - epic IDs to create as branches with commits
 * @returns {string} Absolute path to the repo root
 */
function setupRepo(options = {}) {
  const { prefix = 'arcforge-test-', createBranches = [], specId = DEFAULT_SPEC_ID } = options;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  runGit(['init', '-q', '-b', 'main'], root);
  runGit(['config', 'user.email', 'test@example.com'], root);
  runGit(['config', 'user.name', 'Test User'], root);
  fs.writeFileSync(path.join(root, 'README.md'), 'base\n');
  runGit(['add', 'README.md'], root);
  runGit(['commit', '-q', '-m', 'init'], root);

  const dagData = {
    epics: [
      {
        id: 'epic-a',
        name: 'Epic A',
        spec_path: `specs/${specId}/epics/epic-a/epic.md`,
        status: TaskStatus.PENDING,
        worktree: null,
        depends_on: [],
        features: [],
      },
      {
        id: 'epic-b',
        name: 'Epic B',
        spec_path: `specs/${specId}/epics/epic-b/epic.md`,
        status: TaskStatus.PENDING,
        worktree: null,
        depends_on: [],
        features: [],
      },
    ],
    blocked: [],
  };
  const dagDir = path.join(root, 'specs', specId);
  fs.mkdirSync(dagDir, { recursive: true });
  fs.writeFileSync(path.join(dagDir, 'dag.yaml'), stringifyDagYaml(dagData));

  for (const id of createBranches) {
    // v2.0.0: epic branches are spec-scoped via getEpicBranchName to allow
    // the same epic id across different specs. Tests build branches here
    // (rather than via expandWorktrees) to exercise merge in isolation, but
    // the branch name still has to match what the production code expects.
    const branchName = getEpicBranchName(specId, id);
    runGit(['checkout', '-q', '-b', branchName], root);
    fs.writeFileSync(path.join(root, `${id}.txt`), `${id} content\n`);
    runGit(['add', `${id}.txt`], root);
    runGit(['commit', '-q', '-m', `feat: ${id}`], root);
    runGit(['checkout', '-q', 'main'], root);
  }

  return root;
}

/**
 * Read and parse dag.yaml from disk.
 * @param {string} root - repo root
 * @param {string} [specId] - spec id (default: 'test-spec')
 */
function readDagFromDisk(root, specId = DEFAULT_SPEC_ID) {
  const content = fs.readFileSync(path.join(root, 'specs', specId, 'dag.yaml'), 'utf8');
  return parseDagYaml(content);
}

/**
 * Remove all linked worktrees and prune git metadata.
 * Best-effort — errors are silently ignored.
 */
function cleanupWorktrees(root) {
  try {
    const list = runGit(['worktree', 'list', '--porcelain'], root);
    for (const line of list.split('\n')) {
      if (!line.startsWith('worktree ')) continue;
      const p = line.slice(9);
      if (p !== root && fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }
    runGit(['worktree', 'prune'], root);
  } catch {
    // ignore — rm -rf root will remove any leftovers
  }
}

module.exports = { runGit, setupRepo, readDagFromDisk, cleanupWorktrees, DEFAULT_SPEC_ID };
