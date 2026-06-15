const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

describe('arc-remind command classification', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../arc-remind/main')];
  });

  it('recognizes common test runners', () => {
    const { isTestCommand } = require('../arc-remind/main');
    for (const c of ['npm test', 'npm run test', 'pytest -q', 'go test ./...', 'cargo test']) {
      assert.ok(isTestCommand(c), `should detect: ${c}`);
    }
  });

  it('does not treat non-test commands as tests', () => {
    const { isTestCommand } = require('../arc-remind/main');
    for (const c of ['git status', 'npm install', 'node build.js', 'gh pr create']) {
      assert.strictEqual(isTestCommand(c), false, `should not detect: ${c}`);
    }
  });

  it('recognizes PR-boundary commands only', () => {
    const { isPrBoundary } = require('../arc-remind/main');
    assert.ok(isPrBoundary('gh pr create --fill'));
    assert.ok(isPrBoundary('gh pr merge 12 --squash'));
    assert.strictEqual(isPrBoundary('gh pr view 12'), false);
    assert.strictEqual(isPrBoundary('gh pr list'), false);
    assert.strictEqual(isPrBoundary('git push'), false);
  });
});

describe('arc-remind buildReminder', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../arc-remind/main')];
  });

  it('returns null for non-PR commands', () => {
    const { buildReminder } = require('../arc-remind/main');
    assert.strictEqual(buildReminder('git commit -m x', false), null);
    assert.strictEqual(buildReminder('npm test', true), null);
  });

  it('reminds about verify + review at the PR boundary', () => {
    const { buildReminder } = require('../arc-remind/main');
    const msg = buildReminder('gh pr create', false);
    assert.ok(msg, 'should produce a reminder');
    assert.ok(msg.includes('arc-verifying'), 'should mention arc-verifying');
    assert.ok(msg.includes('arc-requesting-review'), 'should mention arc-requesting-review');
  });

  it('notes when no test was observed this session', () => {
    const { buildReminder } = require('../arc-remind/main');
    assert.ok(buildReminder('gh pr create', false).includes('No test command'));
  });

  it('notes when a test was observed this session', () => {
    const { buildReminder } = require('../arc-remind/main');
    assert.ok(buildReminder('gh pr merge 3', true).includes('A test command ran'));
  });
});

describe('arc-remind worktree-add + ship-a-skill nudges', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  beforeEach(() => {
    delete require.cache[require.resolve('../arc-remind/main')];
  });

  it('classifies worktree-add and ship commands', () => {
    const { isWorktreeAdd, isShipCommand } = require('../arc-remind/main');
    assert.ok(isWorktreeAdd('git worktree add ../wt feature'));
    assert.strictEqual(isWorktreeAdd('git worktree list'), false);
    assert.ok(isShipCommand('git commit -m x'));
    assert.ok(isShipCommand('git push origin head'));
    assert.strictEqual(isShipCommand('git status'), false);
  });

  it('recognizes SKILL.md edits only', () => {
    const { isSkillFile } = require('../arc-remind/main');
    assert.ok(isSkillFile('skills/arc-tdd/SKILL.md'));
    assert.ok(isSkillFile('/abs/path/skills/arc-x/SKILL.md'));
    assert.strictEqual(isSkillFile('skills/arc-tdd/README.md'), false);
    assert.strictEqual(isSkillFile('SKILL.md.bak'), false);
  });

  it('detects an arcforge project by the specs/ directory', () => {
    const { isArcforgeProject } = require('../arc-remind/main');
    const withSpecs = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-remind-as-'));
    const without = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-remind-ns-'));
    try {
      fs.mkdirSync(path.join(withSpecs, 'specs'));
      assert.strictEqual(isArcforgeProject(withSpecs), true);
      assert.strictEqual(isArcforgeProject(without), false);
    } finally {
      fs.rmSync(withSpecs, { recursive: true, force: true });
      fs.rmSync(without, { recursive: true, force: true });
    }
  });

  it('builds the worktree-add and eval-before-ship nudges', () => {
    const { worktreeAddNudge, evalBeforeShipNudge } = require('../arc-remind/main');
    assert.ok(worktreeAddNudge().includes('arcforge expand'));
    assert.ok(evalBeforeShipNudge().includes('arc-writing-skills'));
  });
});

describe('arc-remind main-branch nudge', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  beforeEach(() => {
    delete require.cache[require.resolve('../arc-remind/main')];
  });

  it('parses the branch from .git/HEAD contents', () => {
    const { branchFromHead } = require('../arc-remind/main');
    assert.strictEqual(branchFromHead('ref: refs/heads/main\n'), 'main');
    assert.strictEqual(branchFromHead('ref: refs/heads/feat/x-y\n'), 'feat/x-y');
    assert.strictEqual(branchFromHead('a1b2c3d4 (detached)\n'), null);
  });

  it('distinguishes code files from docs', () => {
    const { isCodeFile } = require('../arc-remind/main');
    assert.ok(isCodeFile('src/app.js'));
    assert.ok(isCodeFile('Makefile'));
    assert.strictEqual(isCodeFile('README.md'), false);
    assert.strictEqual(isCodeFile('notes.txt'), false);
  });

  it('detects main/master via .git/HEAD, false otherwise', () => {
    const { isMainBranch } = require('../arc-remind/main');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-remind-git-'));
    try {
      fs.mkdirSync(path.join(dir, '.git'));
      fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
      assert.strictEqual(isMainBranch(dir), true);
      fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/feat/x\n');
      assert.strictEqual(isMainBranch(dir), false);
      assert.strictEqual(isMainBranch(path.join(dir, 'nonexistent')), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds the main-branch nudge', () => {
    const { mainBranchNudge } = require('../arc-remind/main');
    const msg = mainBranchNudge();
    assert.ok(msg.includes('main'));
    assert.ok(msg.includes('arc-executing-tasks') || msg.includes('branch'));
  });
});

describe('arc-remind SDD spec→dag nudge', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  beforeEach(() => {
    delete require.cache[require.resolve('../arc-remind/main')];
  });

  it('extracts the spec-id only from specs/<id>/spec.xml', () => {
    const { specIdFromSpecXml } = require('../arc-remind/main');
    assert.strictEqual(specIdFromSpecXml('specs/my-feature/spec.xml'), 'my-feature');
    assert.strictEqual(specIdFromSpecXml('/abs/specs/sdd-x/spec.xml'), 'sdd-x');
    assert.strictEqual(specIdFromSpecXml('specs/my-feature/details/x.xml'), null);
    assert.strictEqual(specIdFromSpecXml('spec.xml'), null);
    assert.strictEqual(specIdFromSpecXml('src/specs.xml'), null);
  });

  it('reports dag missing from the spec.xml sibling dir, not a global scan', () => {
    const { dagMissingForSpec } = require('../arc-remind/main');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-remind-sdd-'));
    try {
      // spec A: no dag yet → missing; spec B: has a dag → present
      fs.mkdirSync(path.join(root, 'specs', 'a'), { recursive: true });
      fs.mkdirSync(path.join(root, 'specs', 'b'), { recursive: true });
      fs.writeFileSync(path.join(root, 'specs', 'b', 'dag.yaml'), 'nodes: []\n');
      assert.strictEqual(dagMissingForSpec('specs/a/spec.xml', root), true);
      assert.strictEqual(dagMissingForSpec('specs/b/spec.xml', root), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('names the spec and points to arc-planning', () => {
    const { planAfterSpecNudge } = require('../arc-remind/main');
    const msg = planAfterSpecNudge('my-feature');
    assert.ok(msg.includes('my-feature'));
    assert.ok(msg.includes('arc-planning'));
  });
});

describe('arc-remind freshness-aware eval-before-ship nudge', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const os = require('node:os');
  const { afterEach } = require('node:test');
  const { clearCachedSessionId } = require('../../scripts/lib/utils');

  let root;
  let savedSessionId;

  beforeEach(() => {
    delete require.cache[require.resolve('../arc-remind/main')];
    savedSessionId = process.env.CLAUDE_SESSION_ID;
    process.env.CLAUDE_SESSION_ID = `rv6-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    clearCachedSessionId();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'arc-remind-fresh-'));
  });

  afterEach(() => {
    try {
      const { skillEditStatePath } = require('../arc-remind/main');
      fs.rmSync(skillEditStatePath(), { force: true });
    } catch {
      // best-effort cleanup
    }
    if (savedSessionId === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = savedSessionId;
    clearCachedSessionId();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeSkill(name) {
    const dir = path.join(root, 'skills', name);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'SKILL.md');
    fs.writeFileSync(file, '# skill\n');
    return file;
  }

  function writeBenchmark(content) {
    const dir = path.join(root, 'evals', 'benchmarks');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'latest.json');
    fs.writeFileSync(file, content);
    return file;
  }

  it('records SKILL.md paths in hook-local session state, resolved and deduped', () => {
    const { recordSkillEdit, readSkillEdits } = require('../arc-remind/main');
    makeSkill('arc-x');
    recordSkillEdit('skills/arc-x/SKILL.md', root);
    recordSkillEdit(path.join(root, 'skills', 'arc-x', 'SKILL.md'), root); // same, absolute
    assert.deepStrictEqual(readSkillEdits(), [path.join(root, 'skills', 'arc-x', 'SKILL.md')]);
    makeSkill('arc-y');
    recordSkillEdit('skills/arc-y/SKILL.md', root);
    assert.strictEqual(readSkillEdits().length, 2);
  });

  it('reads the benchmark time from latest.json `generated`', () => {
    const { latestBenchmarkTime } = require('../arc-remind/main');
    const iso = '2026-01-02T03:04:05.000Z';
    writeBenchmark(JSON.stringify({ generated: iso }));
    assert.strictEqual(latestBenchmarkTime(root), Date.parse(iso));
  });

  it('falls back to file mtime when latest.json is malformed', () => {
    const { latestBenchmarkTime } = require('../arc-remind/main');
    const file = writeBenchmark('{not json!!');
    assert.strictEqual(latestBenchmarkTime(root), fs.statSync(file).mtimeMs);
  });

  it('falls back to file mtime when `generated` is missing or unparseable', () => {
    const { latestBenchmarkTime } = require('../arc-remind/main');
    let file = writeBenchmark(JSON.stringify({ evals: {} }));
    assert.strictEqual(latestBenchmarkTime(root), fs.statSync(file).mtimeMs);
    file = writeBenchmark(JSON.stringify({ generated: 'soon' }));
    assert.strictEqual(latestBenchmarkTime(root), fs.statSync(file).mtimeMs);
  });

  it('returns null benchmark time when latest.json does not exist', () => {
    const { latestBenchmarkTime } = require('../arc-remind/main');
    assert.strictEqual(latestBenchmarkTime(root), null);
  });

  it('degrades byte-identically to the generic nudge when latest.json is missing', () => {
    const { buildEvalShipNudge, evalBeforeShipNudge, recordSkillEdit } =
      require('../arc-remind/main');
    makeSkill('arc-x');
    recordSkillEdit('skills/arc-x/SKILL.md', root);
    assert.strictEqual(buildEvalShipNudge(root), evalBeforeShipNudge());
  });

  it('degrades byte-identically when no recorded skill edit is datable', () => {
    const { buildEvalShipNudge, evalBeforeShipNudge, recordSkillEdit } =
      require('../arc-remind/main');
    const file = makeSkill('arc-x');
    recordSkillEdit('skills/arc-x/SKILL.md', root);
    fs.rmSync(file); // deleted since the edit — nothing to date the edit by
    writeBenchmark(JSON.stringify({ generated: new Date().toISOString() }));
    assert.strictEqual(buildEvalShipNudge(root), evalBeforeShipNudge());
  });

  it('says no newer eval result exists when the benchmark predates the edit', () => {
    const { buildEvalShipNudge, evalBeforeShipNudge, recordSkillEdit } =
      require('../arc-remind/main');
    makeSkill('arc-x'); // mtime: now
    recordSkillEdit('skills/arc-x/SKILL.md', root);
    writeBenchmark(JSON.stringify({ generated: '2020-01-01T00:00:00.000Z' }));
    const msg = buildEvalShipNudge(root);
    assert.ok(msg.includes('No eval result newer'), 'should state staleness concretely');
    assert.ok(msg.includes('arc-x'), 'should name the edited skill');
    assert.ok(msg.includes('2020-01-01T00:00:00.000Z'), 'should cite the benchmark time');
    assert.notStrictEqual(msg, evalBeforeShipNudge());
  });

  it('confirms fresh evidence when the benchmark postdates the edit', () => {
    const { buildEvalShipNudge, recordSkillEdit } = require('../arc-remind/main');
    const file = makeSkill('arc-x');
    const past = new Date('2020-01-02T00:00:00.000Z');
    fs.utimesSync(file, past, past); // edit predates the benchmark
    recordSkillEdit('skills/arc-x/SKILL.md', root);
    writeBenchmark(JSON.stringify({ generated: new Date().toISOString() }));
    const msg = buildEvalShipNudge(root);
    assert.ok(msg.includes('newer than your skill edit'), 'should confirm freshness');
    assert.ok(msg.includes('arc-x'), 'should name the edited skill');
  });

  it('branches on mtime when latest.json is malformed', () => {
    const { buildEvalShipNudge, recordSkillEdit } = require('../arc-remind/main');
    makeSkill('arc-x'); // mtime: now
    recordSkillEdit('skills/arc-x/SKILL.md', root);
    const file = writeBenchmark('{not json!!');
    const past = new Date('2020-01-01T00:00:00.000Z');
    fs.utimesSync(file, past, past);
    const msg = buildEvalShipNudge(root);
    assert.ok(msg.includes('No eval result newer'), 'mtime fallback should report stale');
  });

  it('keeps the once-per-session limit through main() (e2e)', () => {
    const { spawnSync } = require('node:child_process');
    const script = path.join(__dirname, '..', 'arc-remind', 'main.js');
    const sessionId = process.env.CLAUDE_SESSION_ID;
    makeSkill('arc-x');
    writeBenchmark(JSON.stringify({ generated: '2020-01-01T00:00:00.000Z' }));

    function run(toolName, toolInput) {
      const input = {
        session_id: sessionId,
        cwd: root,
        hook_event_name: 'PostToolUse',
        tool_name: toolName,
        tool_input: toolInput,
      };
      const r = spawnSync('node', [script], {
        input: JSON.stringify(input),
        encoding: 'utf-8',
        timeout: 15000,
      });
      return r.stdout || '';
    }

    try {
      const editOut = run('Edit', { file_path: 'skills/arc-x/SKILL.md' });
      assert.strictEqual(editOut, '', 'skill edit alone should not nudge');
      const firstShip = run('Bash', { command: 'git commit -m x' });
      assert.ok(firstShip.includes('No eval result newer'), 'first ship should nudge with stale');
      const secondShip = run('Bash', { command: 'git commit -m y' });
      assert.strictEqual(secondShip, '', 'second ship should be rate-limited');
    } finally {
      for (const f of fs.readdirSync(os.tmpdir())) {
        if (f.includes(sessionId)) fs.rmSync(path.join(os.tmpdir(), f), { force: true });
      }
    }
  });
});
