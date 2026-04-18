const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  Coordinator,
  listSpecDagPaths,
  syncAllSpecs,
  rebootAllSpecs,
} = require('../../scripts/lib/coordinator');
const { stringifyDagYaml } = require('../../scripts/lib/yaml-parser');
const { objectToYaml } = require('../../scripts/lib/dag-schema');
const { TaskStatus } = require('../../scripts/lib/models');

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-per-spec-'));
}

function writeSpec(root, specId, epics) {
  const dir = path.join(root, 'specs', specId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'dag.yaml'), stringifyDagYaml({ epics, blocked: [] }));
}

function simpleEpic(id, status = TaskStatus.PENDING) {
  return {
    id,
    name: id,
    spec_path: `epics/${id}/epic.md`,
    status,
    worktree: null,
    depends_on: [],
    features: [],
  };
}

describe('Coordinator constructor — lazy dagPath resolution', () => {
  let root;
  beforeEach(() => {
    root = tmpProject();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('constructing without specId does not throw (lazy)', () => {
    expect(() => new Coordinator(root)).not.toThrow();
  });

  test('pure utilities (_isInWorktree) do not force dagPath resolution', () => {
    const coord = new Coordinator(root);
    expect(coord._isInWorktree()).toBe(false);
  });

  test('explicit specId resolves to specs/<id>/dag.yaml', () => {
    const coord = new Coordinator(root, 'spec-a');
    expect(coord.dagPath).toBe(path.join(root, 'specs', 'spec-a', 'dag.yaml'));
  });

  test('dagPath throws with migration guidance when no spec is resolvable', () => {
    const coord = new Coordinator(root);
    expect(() => coord.dagPath).toThrow(/backfill-markers|specId|spec_id/);
  });

  test('dagPath reads spec_id from .arcforge-epic marker', () => {
    writeSpec(root, 'marker-spec', [simpleEpic('epic-x')]);
    fs.writeFileSync(
      path.join(root, '.arcforge-epic'),
      objectToYaml({ epic: 'epic-x', spec_id: 'marker-spec' }),
    );
    const coord = new Coordinator(root);
    expect(coord.dagPath).toBe(path.join(root, 'specs', 'marker-spec', 'dag.yaml'));
    expect(coord.specId).toBe('marker-spec');
  });
});

describe('listSpecDagPaths', () => {
  let root;
  beforeEach(() => {
    root = tmpProject();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('returns empty when specs/ missing', () => {
    expect(listSpecDagPaths(root)).toEqual([]);
  });

  test('enumerates only specs whose dag.yaml exists', () => {
    writeSpec(root, 'spec-a', [simpleEpic('epic-1')]);
    writeSpec(root, 'spec-b', [simpleEpic('epic-2')]);
    fs.mkdirSync(path.join(root, 'specs', 'spec-no-dag'));
    const result = listSpecDagPaths(root);
    expect(result.map((r) => r.specId).sort()).toEqual(['spec-a', 'spec-b']);
  });
});

describe('rebootAllSpecs', () => {
  let root;
  beforeEach(() => {
    root = tmpProject();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('aggregates counts across specs with totals', () => {
    writeSpec(root, 'spec-a', [
      {
        ...simpleEpic('epic-1', TaskStatus.IN_PROGRESS),
        features: [
          { id: 'f-1', name: 'f-1', status: TaskStatus.COMPLETED, depends_on: [] },
          { id: 'f-2', name: 'f-2', status: TaskStatus.PENDING, depends_on: [] },
        ],
      },
    ]);
    writeSpec(root, 'spec-b', [
      {
        ...simpleEpic('epic-2', TaskStatus.IN_PROGRESS),
        features: [{ id: 'g-1', name: 'g-1', status: TaskStatus.PENDING, depends_on: [] }],
      },
    ]);
    const result = rebootAllSpecs(root);
    expect(Object.keys(result.specs).sort()).toEqual(['spec-a', 'spec-b']);
    expect(result.totals.completed_count).toBe(1);
    expect(result.totals.remaining_count).toBe(2);
  });
});

describe('syncAllSpecs', () => {
  let root;
  beforeEach(() => {
    root = tmpProject();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('no specs → empty result, no throw', () => {
    const result = syncAllSpecs(root);
    expect(result).toEqual({ specs: {} });
  });

  test('scans each spec independently and returns per-spec result', () => {
    writeSpec(root, 'spec-a', [simpleEpic('epic-1')]);
    writeSpec(root, 'spec-b', [simpleEpic('epic-2')]);
    const result = syncAllSpecs(root);
    expect(Object.keys(result.specs).sort()).toEqual(['spec-a', 'spec-b']);
    // Neither spec has a worktree marker — scanned:0, updates:[]
    expect(result.specs['spec-a'].scanned).toBe(0);
    expect(result.specs['spec-a'].updates).toEqual([]);
  });
});

describe('Coordinator — cross-spec worktree path isolation', () => {
  let root;
  beforeEach(() => {
    root = tmpProject();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('same epic id across two specs yields distinct worktree paths', () => {
    const coordA = new Coordinator(root, 'spec-a');
    const coordB = new Coordinator(root, 'spec-b');
    expect(coordA._resolveWorktreePath('epic-1')).not.toBe(coordB._resolveWorktreePath('epic-1'));
  });
});
