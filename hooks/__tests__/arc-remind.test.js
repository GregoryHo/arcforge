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
