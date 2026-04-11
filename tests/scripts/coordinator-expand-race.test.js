const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { Coordinator } = require('../../scripts/lib/coordinator');
const { parseDagYaml, stringifyDagYaml } = require('../../scripts/lib/yaml-parser');
const { TaskStatus } = require('../../scripts/lib/models');

// Regression guard for the same read-modify-write race as the merge
// path, but in the expand path. Two processes expanding different
// epics concurrently would each load a stale dag, set their own
// epic's worktree field and in_progress status, and the second save
// would clobber the first — leaving the first epic's DAG state as
// pending/no-worktree even though its worktree directory exists on
// disk and is tracked by git.
//
// Same helper (_dagTransaction) applies; this test exists to prove
// the helper covers the expand path too.

function runGit(args, cwd) {
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function setupRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-expand-race-'));

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
        spec_path: 'specs/epic-a.md',
        status: TaskStatus.PENDING,
        worktree: null,
        depends_on: [],
        features: [],
      },
      {
        id: 'epic-b',
        name: 'Epic B',
        spec_path: 'specs/epic-b.md',
        status: TaskStatus.PENDING,
        worktree: null,
        depends_on: [],
        features: [],
      },
    ],
    blocked: [],
  };
  fs.writeFileSync(path.join(root, 'dag.yaml'), stringifyDagYaml(dagData));
  return root;
}

function readDagFromDisk(root) {
  const content = fs.readFileSync(path.join(root, 'dag.yaml'), 'utf8');
  return parseDagYaml(content);
}

function cleanupWorktrees(root) {
  // Best-effort git-level cleanup before rm -rf so stale worktree
  // metadata in the main .git doesn't confuse subsequent tests.
  try {
    const list = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
    });
    for (const line of list.split('\n')) {
      if (!line.startsWith('worktree ')) continue;
      const p = line.slice(9);
      if (p !== root && fs.existsSync(p)) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }
    execFileSync('git', ['worktree', 'prune'], { cwd: root });
  } catch {
    // ignore — rm -rf root will remove any leftovers
  }
}

describe('Coordinator expand concurrency', () => {
  let root;

  beforeEach(() => {
    root = setupRepo();
  });

  afterEach(() => {
    cleanupWorktrees(root);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('concurrent expands preserve both epic worktree assignments', () => {
    // Two Coordinator instances representing two teammate processes
    // that both loaded the dag before either wrote back.
    const coordA = new Coordinator(root);
    const coordB = new Coordinator(root);

    // Force lazy load — both see all epics pending with no worktree.
    expect(coordA.dag.epics.find((e) => e.id === 'epic-a').worktree).toBeNull();
    expect(coordB.dag.epics.find((e) => e.id === 'epic-a').worktree).toBeNull();

    // coordA expands epic-a: creates the worktree directory, mutates
    // its own in-memory epic-a, and saves.
    coordA.expandWorktrees({ epicId: 'epic-a' });

    // coordB's in-memory dag is stale — epic-a still shows no worktree.
    expect(coordB._dag.epics.find((e) => e.id === 'epic-a').worktree).toBeNull();

    // coordB expands epic-b. Without the fix, coordB's save writes
    // its stale snapshot (epic-a worktree=null), clobbering coordA's
    // epic-a assignment on disk. With _dagTransaction, coordB re-reads
    // the dag under the lock, sees epic-a's worktree, and preserves it.
    coordB.expandWorktrees({ epicId: 'epic-b' });

    const finalDag = readDagFromDisk(root);
    const epicA = finalDag.epics.find((e) => e.id === 'epic-a');
    const epicB = finalDag.epics.find((e) => e.id === 'epic-b');

    // Both must have their worktree field set and be in_progress.
    expect(epicA.worktree).toBe('epic-a');
    expect(epicA.status).toBe(TaskStatus.IN_PROGRESS);
    expect(epicB.worktree).toBe('epic-b');
    expect(epicB.status).toBe(TaskStatus.IN_PROGRESS);
  });

  test('single expand still updates status correctly', () => {
    const coord = new Coordinator(root);
    coord.expandWorktrees({ epicId: 'epic-a' });

    const finalDag = readDagFromDisk(root);
    expect(finalDag.epics.find((e) => e.id === 'epic-a').worktree).toBe('epic-a');
    expect(finalDag.epics.find((e) => e.id === 'epic-a').status).toBe(TaskStatus.IN_PROGRESS);
    // epic-b untouched
    expect(finalDag.epics.find((e) => e.id === 'epic-b').worktree).toBeNull();
    expect(finalDag.epics.find((e) => e.id === 'epic-b').status).toBe(TaskStatus.PENDING);
  });
});
