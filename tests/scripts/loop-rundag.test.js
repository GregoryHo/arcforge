/**
 * loop-rundag.test.js — AF-7 worktree isolation for the DAG loop pattern.
 *
 * runDag must run every ready (and resumable in-progress) epic in its own git
 * worktree: spawn cwd is the canonical worktree root (never the base
 * projectRoot), the per-worktree installer runs, successful sessions merge back
 * to base and clean up, and a single ready epic per round (chain/diamond) still
 * takes the isolated path. A stub `claude` on PATH records its cwd and makes a
 * commit so merge-back has content; _runSubprocess is spied so the installer
 * seam is asserted without a real `npm install`.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { Coordinator } = require('../../scripts/lib/coordinator');
const {
  getWorktreePath,
  getWorktreeRoot,
  parseWorktreePath,
} = require('../../scripts/lib/worktree-paths');
const { runDag } = require('../../scripts/loop');
const { stringifyDagYaml } = require('../../scripts/lib/yaml-parser');
const { TaskStatus } = require('../../scripts/lib/models');

const SPEC_ID = 'rundag-spec';

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

/** Initialise a git repo with a per-spec dag.yaml and a node project. */
function setupRepo(epics) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rundag-')));
  runGit(['init', '-q', '-b', 'work'], root);
  runGit(['config', 'user.email', 'test@example.com'], root);
  runGit(['config', 'user.name', 'Test User'], root);
  // A node project so getDefaultInstallCommand resolves (installer seam fires).
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0', scripts: { test: 'jest' } }),
  );
  fs.writeFileSync(path.join(root, 'package-lock.json'), '{}');
  fs.writeFileSync(path.join(root, 'README.md'), 'base\n');

  const dagDir = path.join(root, 'specs', SPEC_ID);
  fs.mkdirSync(dagDir, { recursive: true });
  fs.writeFileSync(path.join(dagDir, 'dag.yaml'), stringifyDagYaml({ epics, blocked: [] }));

  runGit(['add', '-A'], root);
  runGit(['commit', '-q', '-m', 'init'], root);
  return root;
}

function epic(id, overrides = {}) {
  return {
    id,
    name: `Epic ${id}`,
    spec_path: `specs/${SPEC_ID}/epics/${id}/epic.md`,
    status: TaskStatus.PENDING,
    worktree: null,
    depends_on: [],
    features: [],
    ...overrides,
  };
}

/**
 * Install a fake `claude` on PATH that: records its cwd to CLAUDE_CWD_LOG,
 * makes a commit in that cwd (so the epic branch diverges and merge-back yields
 * a real integrate commit), and emits valid session JSON. exitCode is taken
 * from CLAUDE_EXIT (default 0); a non-zero value simulates a failed session.
 */
function installFakeClaude(binDir, cwdLog) {
  fs.mkdirSync(binDir, { recursive: true });
  const claudePath = path.join(binDir, 'claude');
  const script = `#!/usr/bin/env bash
set -e
echo "$PWD" >> "${cwdLog}"
if [ "\${CLAUDE_EXIT:-0}" = "0" ]; then
  # Make a unique commit so the epic branch has content to merge back.
  marker="work-$(basename "$PWD").txt"
  echo "done in $PWD" > "$marker"
  git add "$marker" >/dev/null 2>&1 || true
  git commit -q -m "feat: session work" >/dev/null 2>&1 || true
fi
echo '{"total_cost_usd":0,"result":"done"}'
exit "\${CLAUDE_EXIT:-0}"
`;
  fs.writeFileSync(claudePath, script, { mode: 0o755 });
  return claudePath;
}

describe('runDag worktree isolation (AF-7)', () => {
  const originalHome = process.env.HOME;
  const originalPath = process.env.PATH;
  const originalProjectDir = process.env.CLAUDE_PROJECT_DIR;
  const originalExit = process.env.CLAUDE_EXIT;
  let testHome;
  let binDir;
  let cwdLog;
  let root;
  let subprocessCalls;

  beforeEach(() => {
    const realTmp = fs.realpathSync(os.tmpdir());
    testHome = fs.mkdtempSync(path.join(realTmp, 'rundag-home-'));
    process.env.HOME = testHome;
    jest.spyOn(os, 'homedir').mockReturnValue(testHome);

    binDir = fs.mkdtempSync(path.join(realTmp, 'rundag-bin-'));
    cwdLog = path.join(binDir, 'cwd.log');
    installFakeClaude(binDir, cwdLog);
    process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;

    // Spy the installer seam: record per-worktree install invocations and
    // short-circuit the real `npm install` so the test stays fast/offline.
    subprocessCalls = [];
    jest.spyOn(Coordinator.prototype, '_runSubprocess').mockImplementation((workdir, command) => {
      subprocessCalls.push({ workdir, command });
      return { exitCode: 0 };
    });

    // Quiet the loop's heavy stdout while keeping assertions on state/git.
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    try {
      const list = runGit(['worktree', 'list', '--porcelain'], root);
      for (const line of list.split('\n')) {
        if (!line.startsWith('worktree ')) continue;
        const p = line.slice(9);
        if (p !== root && fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
      }
    } catch {
      /* root may not exist */
    }
    for (const dir of [root, testHome, binDir]) {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
    process.env.HOME = originalHome;
    process.env.PATH = originalPath;
    if (originalProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = originalProjectDir;
    if (originalExit === undefined) delete process.env.CLAUDE_EXIT;
    else process.env.CLAUDE_EXIT = originalExit;
  });

  // The fake claude logs its $PWD verbatim. Those worktrees may already be
  // cleaned up after a successful merge, so do NOT realpathSync the logged
  // paths — testHome is realpath'd and getWorktreeRoot uses the mocked
  // homedir, so the logged paths are already canonical and comparable as-is.
  function loggedCwds() {
    if (!fs.existsSync(cwdLog)) return [];
    return fs
      .readFileSync(cwdLog, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  function baseOptions(overrides = {}) {
    return {
      pattern: 'dag',
      maxRuns: 10,
      maxCost: null,
      epic: null,
      maxParallel: 5,
      projectSetup: true,
      projectRoot: root,
      specId: SPEC_ID,
      taskTimeoutMs: 60000,
      permissionMode: null,
      allowedTools: null,
      ...overrides,
    };
  }

  test('spawns every session in its canonical worktree root, never the base', async () => {
    root = setupRepo([epic('epic-a'), epic('epic-b')]);
    await runDag(baseOptions());

    const cwds = loggedCwds();
    expect(cwds.length).toBe(2);
    const expected = ['epic-a', 'epic-b'].map((id) => getWorktreePath(root, SPEC_ID, id)).sort();
    expect(cwds.sort()).toEqual(expected);
    // None of the sessions ran in the base projectRoot.
    expect(cwds).not.toContain(root);
    // Every spawn cwd is under the canonical worktree root and parses as managed.
    const wtRoot = getWorktreeRoot();
    for (const c of cwds) {
      expect(c.startsWith(wtRoot)).toBe(true);
      expect(parseWorktreePath(c)).not.toBeNull();
    }
  });

  test('runs the per-worktree installer for each expanded epic', async () => {
    root = setupRepo([epic('epic-a'), epic('epic-b')]);
    await runDag(baseOptions());

    const installWorktrees = subprocessCalls.map((c) => c.workdir).sort();
    const expected = ['epic-a', 'epic-b'].map((id) => getWorktreePath(root, SPEC_ID, id)).sort();
    expect(installWorktrees).toEqual(expected);
    // The recorded command is the detected installer (npm for this fixture).
    expect(subprocessCalls[0].command).toEqual(['npm', 'install']);
  });

  test('--no-project-setup skips the installer', async () => {
    root = setupRepo([epic('epic-a')]);
    await runDag(baseOptions({ projectSetup: false }));
    expect(subprocessCalls.length).toBe(0);
  });

  test('merges successful epics back to base and marks them completed + cleaned', async () => {
    root = setupRepo([epic('epic-a'), epic('epic-b')]);
    await runDag(baseOptions());

    const baseLog = runGit(['log', '--oneline'], root);
    expect(baseLog).toContain('integrate epic-a');
    expect(baseLog).toContain('integrate epic-b');

    const status = new Coordinator(root, SPEC_ID).status();
    for (const e of status.epics) {
      expect(e.status).toBe(TaskStatus.COMPLETED);
      // Worktree cleaned up after a successful merge.
      expect(e.worktree).toBeNull();
    }
    expect(fs.existsSync(getWorktreePath(root, SPEC_ID, 'epic-a'))).toBe(false);
  });

  test('honors --max-parallel: 7 ready epics with cap 5 → 5 then 2', async () => {
    const epics = Array.from({ length: 7 }, (_, i) => epic(`epic-${i + 1}`));
    root = setupRepo(epics);
    await runDag(baseOptions({ maxParallel: 5 }));

    // 7 total spawns across two rounds; round 1 caps at 5 (the first 5
    // append-ordered cwd-log entries are 5 distinct worktrees), round 2 = 2.
    const cwds = loggedCwds();
    expect(cwds.length).toBe(7);
    expect(new Set(cwds.slice(0, 5)).size).toBe(5);
    const status = new Coordinator(root, SPEC_ID).status();
    expect(status.epics.every((e) => e.status === TaskStatus.COMPLETED)).toBe(true);
  });

  test('--max-parallel 2 caps each round at two epics', async () => {
    root = setupRepo([epic('epic-1'), epic('epic-2'), epic('epic-3')]);
    await runDag(baseOptions({ maxParallel: 2 }));

    // Round 1 spawns exactly 2 distinct worktrees, round 2 spawns the last 1.
    const cwds = loggedCwds();
    expect(cwds.length).toBe(3);
    expect(new Set(cwds.slice(0, 2)).size).toBe(2);
    const status = new Coordinator(root, SPEC_ID).status();
    expect(status.epics.every((e) => e.status === TaskStatus.COMPLETED)).toBe(true);
  });

  test('chain DAG (one ready epic per round) still takes the isolated path', async () => {
    root = setupRepo([
      epic('epic-1'),
      epic('epic-2', { depends_on: ['epic-1'] }),
      epic('epic-3', { depends_on: ['epic-2'] }),
    ]);
    await runDag(baseOptions());

    // Each link ran in its own worktree (never the base) and merged back.
    const cwds = loggedCwds();
    expect(cwds.length).toBe(3);
    expect(cwds).not.toContain(root);
    const baseLog = runGit(['log', '--oneline'], root);
    expect(baseLog).toContain('integrate epic-1');
    expect(baseLog).toContain('integrate epic-2');
    expect(baseLog).toContain('integrate epic-3');
  });

  test('resumes an interrupted in-progress epic that already has a worktree', async () => {
    root = setupRepo([epic('epic-a')]);
    // Simulate an interrupted overnight run: expand created the worktree and
    // flipped the epic to in_progress, but the session never completed.
    new Coordinator(root, SPEC_ID).expandWorktrees({ epicId: 'epic-a' });
    const wtPath = getWorktreePath(root, SPEC_ID, 'epic-a');

    await runDag(baseOptions());

    // The resume respawned the session in the EXISTING worktree (not a no-op
    // "All tasks complete"), and integrated it.
    expect(loggedCwds()).toContain(wtPath);
    const status = new Coordinator(root, SPEC_ID).status();
    expect(status.epics[0].status).toBe(TaskStatus.COMPLETED);
  });

  test('a merge conflict aborts the base merge and blocks the epic, base stays clean', async () => {
    root = setupRepo([epic('epic-a')]);
    // Build a real divergence on shared.txt: expand epic-a to its worktree,
    // commit one side on the epic branch and the conflicting side on base,
    // and leave the epic in_progress so runDag RESUMES it (the resumed session
    // adds another commit, then merge-back conflicts on shared.txt).
    const wtPath = getWorktreePath(root, SPEC_ID, 'epic-a');
    new Coordinator(root, SPEC_ID).expandWorktrees({ epicId: 'epic-a' });
    fs.writeFileSync(path.join(wtPath, 'shared.txt'), 'epic side\n');
    runGit(['add', 'shared.txt'], wtPath);
    runGit(['commit', '-q', '-m', 'feat: epic edits shared'], wtPath);
    fs.writeFileSync(path.join(root, 'shared.txt'), 'base side\n');
    runGit(['add', 'shared.txt'], root);
    runGit(['commit', '-q', '-m', 'chore: base edits shared'], root);

    await runDag(baseOptions());

    // Base is clean (merge was aborted — no half-merged MERGE_HEAD).
    const gitDir = runGit(['rev-parse', '--git-dir'], root).trim();
    expect(fs.existsSync(path.join(root, gitDir, 'MERGE_HEAD'))).toBe(false);
    expect(runGit(['status', '--porcelain', 'shared.txt'], root).trim()).toBe('');
    // Epic is blocked, not completed; worktree retained for resolution.
    const status = new Coordinator(root, SPEC_ID).status({ blockedOnly: false });
    expect(status.epics[0].status).toBe(TaskStatus.BLOCKED);
    expect(status.blocked.some((b) => b.task_id === 'epic-a')).toBe(true);
    expect(fs.existsSync(wtPath)).toBe(true);
  });

  test('a failed session blocks the epic and retains its worktree', async () => {
    root = setupRepo([epic('epic-a')]);
    process.env.CLAUDE_EXIT = '1';

    await runDag(baseOptions());

    const status = new Coordinator(root, SPEC_ID).status();
    expect(status.epics[0].status).toBe(TaskStatus.BLOCKED);
    // Worktree retained (failures are not cleaned up).
    expect(fs.existsSync(getWorktreePath(root, SPEC_ID, 'epic-a'))).toBe(true);
  });

  test('a per-worktree installer failure blocks that epic, not the whole loop', async () => {
    root = setupRepo([epic('epic-a'), epic('epic-b')]);
    // epic-a's installer fails; expandWorktrees throws — runDag must catch it,
    // block epic-a, and still run + integrate epic-b (no loop-level throw).
    Coordinator.prototype._runSubprocess.mockImplementation((workdir) => {
      subprocessCalls.push({ workdir });
      return workdir.endsWith('epic-a') ? { exitCode: 1 } : { exitCode: 0 };
    });

    await expect(runDag(baseOptions())).resolves.toBeUndefined();

    const status = new Coordinator(root, SPEC_ID).status({ blockedOnly: false });
    const byId = Object.fromEntries(status.epics.map((e) => [e.id, e.status]));
    expect(byId['epic-a']).toBe(TaskStatus.BLOCKED);
    expect(byId['epic-b']).toBe(TaskStatus.COMPLETED);
    expect(status.blocked.some((b) => /setup failed/.test(b.reason))).toBe(true);
  });
});
