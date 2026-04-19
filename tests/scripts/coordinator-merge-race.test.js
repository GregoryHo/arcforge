const fs = require('node:fs');
const path = require('node:path');

const { Coordinator } = require('../../scripts/lib/coordinator');
const { parseDagYaml, stringifyDagYaml } = require('../../scripts/lib/yaml-parser');
const { TaskStatus } = require('../../scripts/lib/models');
const { setupRepo, readDagFromDisk, DEFAULT_SPEC_ID } = require('./coordinator-test-helpers');

// Regression guard for a read-modify-write race in the dag merge path.
// Two processes merging different epics concurrently could both load a
// stale dag snapshot, then the second save clobbers the first —
// leaving one epic stuck at in_progress despite its branch being merged.

describe('Coordinator merge concurrency', () => {
  let root;

  beforeEach(() => {
    root = setupRepo({
      prefix: 'arcforge-merge-race-',
      createBranches: ['epic-a', 'epic-b'],
    });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('concurrent merges preserve both epic completions', () => {
    // Two Coordinator instances pointing at the same project — each
    // represents a separate teammate *process* that has already done
    // its `_loadDag` before the other started saving.
    const coordA = new Coordinator(root, DEFAULT_SPEC_ID);
    const coordB = new Coordinator(root, DEFAULT_SPEC_ID);

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
    const coord = new Coordinator(root, DEFAULT_SPEC_ID);
    coord.mergeEpics({ epicIds: ['epic-a'] });

    const finalDag = readDagFromDisk(root);
    expect(finalDag.epics.find((e) => e.id === 'epic-a').status).toBe(TaskStatus.COMPLETED);
    expect(finalDag.epics.find((e) => e.id === 'epic-b').status).toBe(TaskStatus.PENDING);
  });

  test('merge updates .arcforge-epic marker to completed', () => {
    // Expand creates .arcforge-epic with local.status: in_progress.
    // After merge, the marker should be updated to completed so that
    // subsequent sync propagates the correct status.
    const worktreePath = path.join(root, 'worktrees', 'epic-a');
    fs.mkdirSync(worktreePath, { recursive: true });

    // Simulate what expand() writes to .arcforge-epic
    const { objectToYaml } = require('../../scripts/lib/dag-schema');
    const markerData = {
      epic: 'epic-a',
      spec_id: DEFAULT_SPEC_ID,
      base_worktree: root,
      base_branch: 'main',
      local: {
        status: TaskStatus.IN_PROGRESS,
        started_at: new Date().toISOString(),
      },
      synced: null,
    };
    fs.writeFileSync(path.join(worktreePath, '.arcforge-epic'), objectToYaml(markerData));

    // Point the DAG's worktree field to our mock worktree
    const dagPath = path.join(root, 'specs', DEFAULT_SPEC_ID, 'dag.yaml');
    const dagContent = fs.readFileSync(dagPath, 'utf8');
    const dagData = parseDagYaml(dagContent);
    dagData.epics.find((e) => e.id === 'epic-a').worktree = worktreePath;
    fs.writeFileSync(dagPath, stringifyDagYaml(dagData));

    const coord = new Coordinator(root, DEFAULT_SPEC_ID);
    coord.mergeEpics({ epicIds: ['epic-a'] });

    // Read the marker back — local.status should now be 'completed'
    const updatedMarker = parseDagYaml(
      fs.readFileSync(path.join(worktreePath, '.arcforge-epic'), 'utf8'),
    );
    expect(updatedMarker.local.status).toBe(TaskStatus.COMPLETED);
  });

  test('merge with no matching epics returns empty array', () => {
    // Calling mergeEpics() without epicIds filters to status=completed;
    // in our fixture none are completed yet, so nothing merges.
    const coord = new Coordinator(root, DEFAULT_SPEC_ID);
    const result = coord.mergeEpics({});
    expect(result).toEqual([]);

    // Dag on disk should be unchanged — all pending.
    const finalDag = readDagFromDisk(root);
    expect(finalDag.epics.every((e) => e.status === TaskStatus.PENDING)).toBe(true);
  });
});
