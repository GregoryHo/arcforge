const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { Coordinator } = require('../../scripts/lib/coordinator');
const { parseDagYaml, stringifyDagYaml } = require('../../scripts/lib/yaml-parser');
const { TaskStatus } = require('../../scripts/lib/models');

// Regression guard for a read-modify-write race in the dag merge path.
//
// In the real qmd 2026-04-11 dispatch, each teammate was a separate node
// process. Each process created a fresh Coordinator, ran `_loadDag()`
// once (loading the current dag snapshot from disk), mutated its own
// epic's status in memory, and called `_saveDag()`. Because `_loadDag`
// happens OUTSIDE the withLock boundary but `_saveDag` happens INSIDE,
// two processes could both load a stale snapshot (both seeing all epics
// as pending), then the locked writes would serialize — but the second
// write would clobber the first, leaving one epic stuck at in_progress
// on disk even though its branch had been merged successfully.
//
// To reproduce this in-process we must call `_mergeEpicsInBase` directly
// on two separate Coordinator instances that have each already triggered
// their lazy `_loadDag`. The public `mergeEpics()` can't reproduce the
// race in-process because its delegation path (`new Coordinator(basePath)`)
// creates a fresh coordinator per call, masking the in-memory staleness
// that the cross-process scenario depends on.

function runGit(args, cwd) {
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

function setupRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-merge-race-'));

  runGit(['init', '-q', '-b', 'main'], root);
  runGit(['config', 'user.email', 'test@example.com'], root);
  runGit(['config', 'user.name', 'Test User'], root);

  // Initial commit so HEAD is born and we have a parent for branches
  fs.writeFileSync(path.join(root, 'README.md'), 'base\n');
  runGit(['add', 'README.md'], root);
  runGit(['commit', '-q', '-m', 'init'], root);

  // dag.yaml with 2 pending epics
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

  // Create epic branches with one distinct commit each
  for (const id of ['epic-a', 'epic-b']) {
    runGit(['checkout', '-q', '-b', id], root);
    fs.writeFileSync(path.join(root, `${id}.txt`), `${id} content\n`);
    runGit(['add', `${id}.txt`], root);
    runGit(['commit', '-q', '-m', `feat: ${id}`], root);
    runGit(['checkout', '-q', 'main'], root);
  }

  return root;
}

function readDagFromDisk(root) {
  const content = fs.readFileSync(path.join(root, 'dag.yaml'), 'utf8');
  return parseDagYaml(content);
}

describe('Coordinator merge concurrency', () => {
  let root;

  beforeEach(() => {
    root = setupRepo();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('concurrent merges preserve both epic completions', () => {
    // Two Coordinator instances pointing at the same project — each
    // represents a separate teammate *process* that has already done
    // its `_loadDag` before the other started saving.
    const coordA = new Coordinator(root);
    const coordB = new Coordinator(root);

    // Force the lazy load on both BEFORE either mutates. This is the
    // critical setup for the race: both hold an in-memory snapshot
    // where epic-a and epic-b are still pending.
    expect(coordA.dag.epics.find((e) => e.id === 'epic-a').status).toBe(TaskStatus.PENDING);
    expect(coordB.dag.epics.find((e) => e.id === 'epic-a').status).toBe(TaskStatus.PENDING);

    // Call `_mergeEpicsInBase` directly rather than the public
    // `mergeEpics`. The public method's path-canonicalization branch
    // (`basePath !== this.projectRoot`) creates a fresh `new Coordinator`
    // per call, which auto-reloads and masks the in-memory race within
    // a single process. We need to exercise the path where a coordinator
    // with already-loaded stale dag performs the mutation — that's the
    // exact shape of the cross-process race in real dispatch.
    const mergedA = coordA._mergeEpicsInBase(null, ['epic-a']);
    expect(mergedA).toHaveLength(1);
    expect(mergedA[0].id).toBe('epic-a');

    // coordB's in-memory dag is now stale relative to disk — coordA's
    // save is on disk, but coordB still holds the pre-save snapshot.
    expect(coordB._dag.epics.find((e) => e.id === 'epic-a').status).toBe(TaskStatus.PENDING);

    // coordB merges epic-b. Without the fix, coordB would write its
    // stale in-memory snapshot (epic-a=pending, epic-b=completed),
    // clobbering coordA's epic-a update. With _dagTransaction, coordB
    // re-reads the dag under lock, sees epic-a as completed, preserves
    // it, and writes the correct merged state.
    const mergedB = coordB._mergeEpicsInBase(null, ['epic-b']);
    expect(mergedB).toHaveLength(1);
    expect(mergedB[0].id).toBe('epic-b');

    // Read the final dag from disk — both epics must be completed.
    // This assertion fails on pre-fix code because coordB's save
    // overwrites epic-a back to pending.
    const finalDag = readDagFromDisk(root);
    const epicA = finalDag.epics.find((e) => e.id === 'epic-a');
    const epicB = finalDag.epics.find((e) => e.id === 'epic-b');
    expect(epicA.status).toBe(TaskStatus.COMPLETED);
    expect(epicB.status).toBe(TaskStatus.COMPLETED);
  });

  test('single merge still updates status correctly', () => {
    // Sanity check — the transaction wrapper does not break the
    // non-concurrent happy path via the public API.
    const coord = new Coordinator(root);
    coord.mergeEpics({ epicIds: ['epic-a'] });

    const finalDag = readDagFromDisk(root);
    expect(finalDag.epics.find((e) => e.id === 'epic-a').status).toBe(TaskStatus.COMPLETED);
    expect(finalDag.epics.find((e) => e.id === 'epic-b').status).toBe(TaskStatus.PENDING);
  });

  test('merge with no matching epics returns empty array', () => {
    // Calling mergeEpics() without epicIds filters to status=completed;
    // in our fixture none are completed yet, so nothing merges.
    const coord = new Coordinator(root);
    const result = coord.mergeEpics({});
    expect(result).toEqual([]);

    // Dag on disk should be unchanged — all pending.
    const finalDag = readDagFromDisk(root);
    expect(finalDag.epics.every((e) => e.status === TaskStatus.PENDING)).toBe(true);
  });
});
