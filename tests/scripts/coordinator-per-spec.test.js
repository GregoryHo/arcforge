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

function writeSpecXml(root, specId, title) {
  const dir = path.join(root, 'specs', specId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'spec.xml'),
    [
      '<spec>',
      '  <overview>',
      `    <spec_id>${specId}</spec_id>`,
      '    <spec_version>1</spec_version>',
      '    <status>active</status>',
      `    <title>${title}</title>`,
      '    <description>Fixture spec</description>',
      '  </overview>',
      '</spec>',
    ].join('\n'),
  );
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

  test('dagPath throws with actionable guidance when no spec is resolvable', () => {
    const coord = new Coordinator(root);
    expect(() => coord.dagPath).toThrow(/--spec-id|specId|spec_id/);
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

  test('per-spec entries carry spec-derived handover fields without changing totals shape', () => {
    writeSpec(root, 'spec-a', [
      {
        ...simpleEpic('epic-1', TaskStatus.IN_PROGRESS),
        features: [{ id: 'f-1', name: 'f-1', status: TaskStatus.PENDING, depends_on: [] }],
      },
    ]);
    writeSpecXml(root, 'spec-a', 'Goal A');
    const result = rebootAllSpecs(root);
    expect(result.specs['spec-a'].project_goal).toBe('Goal A');
    expect(result.specs['spec-a'].current_task).toMatchObject({ id: 'f-1', type: 'feature' });
    expect(result.totals).toEqual({
      completed_count: 0,
      remaining_count: 1,
      blocked_count: 0,
    });
  });
});

describe('rebootContext — spec-derived handover', () => {
  let root;
  beforeEach(() => {
    root = tmpProject();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('derives project_goal from the spec.xml title', () => {
    writeSpec(root, 'spec-a', [simpleEpic('epic-1')]);
    writeSpecXml(root, 'spec-a', 'Ship the payments API');
    const ctx = new Coordinator(root, 'spec-a').rebootContext();
    expect(ctx.project_goal).toBe('Ship the payments API');
  });

  test('project_goal is null when spec.xml is absent (dag-only project)', () => {
    writeSpec(root, 'spec-a', [simpleEpic('epic-1')]);
    const ctx = new Coordinator(root, 'spec-a').rebootContext();
    expect(ctx.project_goal).toBeNull();
  });

  test('project_goal is null when spec.xml has no parseable title', () => {
    writeSpec(root, 'spec-a', [simpleEpic('epic-1')]);
    fs.writeFileSync(
      path.join(root, 'specs', 'spec-a', 'spec.xml'),
      '<spec><overview><spec_id>spec-a</spec_id></overview></spec>',
    );
    const ctx = new Coordinator(root, 'spec-a').rebootContext();
    expect(ctx.project_goal).toBeNull();
  });

  test('current_task surfaces the in-progress feature', () => {
    writeSpec(root, 'spec-a', [
      {
        ...simpleEpic('epic-1', TaskStatus.IN_PROGRESS),
        features: [
          { id: 'f-1', name: 'auth', status: TaskStatus.IN_PROGRESS, depends_on: [] },
          { id: 'f-2', name: 'tokens', status: TaskStatus.PENDING, depends_on: [] },
        ],
      },
    ]);
    const ctx = new Coordinator(root, 'spec-a').rebootContext();
    expect(ctx.current_task).toEqual({
      id: 'f-1',
      name: 'auth',
      type: 'feature',
      status: TaskStatus.IN_PROGRESS,
    });
  });

  test('research_files enumerates spec-dir docs and details, excluding dag.yaml', () => {
    writeSpec(root, 'spec-a', [simpleEpic('epic-1')]);
    writeSpecXml(root, 'spec-a', 'Ship the payments API');
    const dir = path.join(root, 'specs', 'spec-a');
    fs.writeFileSync(path.join(dir, 'vision.md'), '# vision');
    fs.writeFileSync(path.join(dir, 'decisions.yml'), 'decisions: []');
    fs.mkdirSync(path.join(dir, 'details'));
    fs.writeFileSync(path.join(dir, 'details', 'fr-2.xml'), '<detail/>');
    fs.writeFileSync(path.join(dir, 'details', 'fr-1.xml'), '<detail/>');
    fs.writeFileSync(path.join(dir, 'details', 'notes.txt'), 'not xml');
    const ctx = new Coordinator(root, 'spec-a').rebootContext();
    expect(ctx.research_files).toEqual([
      'specs/spec-a/vision.md',
      'specs/spec-a/spec.xml',
      'specs/spec-a/decisions.yml',
      'specs/spec-a/details/fr-1.xml',
      'specs/spec-a/details/fr-2.xml',
    ]);
  });

  test('research_files is empty when the spec dir holds only dag.yaml', () => {
    writeSpec(root, 'spec-a', [simpleEpic('epic-1')]);
    const ctx = new Coordinator(root, 'spec-a').rebootContext();
    expect(ctx.research_files).toEqual([]);
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

  test('expand uses spec-scoped branch name so same epic id across specs does not collide', () => {
    // Regression guard for Codex P1: branch name `-b <epic>` was global → second
    // expand across specs with overlapping epic ids failed. v2.0.0 scopes the
    // branch to `<spec-id>/<epic-id>`.
    writeSpec(root, 'spec-a', [simpleEpic('shared-epic')]);
    writeSpec(root, 'spec-b', [simpleEpic('shared-epic')]);

    // Minimal git init so `git worktree add -b` can succeed.
    const { execFileSync } = require('node:child_process');
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 't@x'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: root });
    fs.writeFileSync(path.join(root, 'README.md'), 'x');
    execFileSync('git', ['add', 'README.md'], { cwd: root });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: root });

    const coordA = new Coordinator(root, 'spec-a');
    const coordB = new Coordinator(root, 'spec-b');

    try {
      const createdA = coordA.expandWorktrees();
      const createdB = coordB.expandWorktrees();
      expect(createdA.map((e) => e.id)).toEqual(['shared-epic']);
      expect(createdB.map((e) => e.id)).toEqual(['shared-epic']);
      // Both worktrees exist without branch collision.
      const branches = execFileSync('git', ['branch', '--list'], { cwd: root, encoding: 'utf8' });
      expect(branches).toMatch(/spec-a\/shared-epic/);
      expect(branches).toMatch(/spec-b\/shared-epic/);
    } finally {
      // Clean up created worktrees to avoid leaking ~/.arcforge/worktrees/ dirs.
      try {
        const list = execFileSync('git', ['worktree', 'list', '--porcelain'], {
          cwd: root,
          encoding: 'utf8',
        });
        for (const line of list.split('\n')) {
          if (!line.startsWith('worktree ')) continue;
          const p = line.slice(9);
          if (p !== root && fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
        }
        execFileSync('git', ['worktree', 'prune'], { cwd: root });
      } catch {
        /* best-effort */
      }
    }
  });
});
