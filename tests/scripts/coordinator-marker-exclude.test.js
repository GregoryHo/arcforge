const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { Coordinator } = require('../../scripts/lib/coordinator');
const { setupRepo, runGit, cleanupWorktrees } = require('./coordinator-test-helpers');

// Regression guard for the `.arcforge-epic` marker leaking into git
// commit history. The fix adds `.arcforge-epic` to the main repo's
// `.git/info/exclude` at expand time — linked worktrees share this
// file via `commondir`, so one write covers all worktrees.

describe('arcforge marker git-exclude', () => {
  let root;

  beforeEach(() => {
    root = setupRepo();
  });

  afterEach(() => {
    cleanupWorktrees(root);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('expand writes .arcforge-epic exclude to main repo info/exclude', () => {
    const coord = new Coordinator(root);
    coord.expandWorktrees({ epicId: 'epic-a' });

    const excludePath = path.join(root, '.git', 'info', 'exclude');
    expect(fs.existsSync(excludePath)).toBe(true);
    const content = fs.readFileSync(excludePath, 'utf8');
    expect(content.split('\n')).toContain('.arcforge-epic');
  });

  test('git status in the linked worktree does not show the marker', () => {
    const coord = new Coordinator(root);
    coord.expandWorktrees({ epicId: 'epic-a' });

    // The linked worktree is outside the project dir (~/.arcforge/worktrees/...)
    // — look it up from the coordinator's dag state.
    const epic = coord.dag.epics.find((e) => e.id === 'epic-a');
    const worktreePath = coord._resolveWorktreePath(epic.worktree);

    // Sanity: the marker file exists in the worktree
    expect(fs.existsSync(path.join(worktreePath, '.arcforge-epic'))).toBe(true);

    // But git doesn't see it as untracked
    const status = runGit(['status', '--porcelain'], worktreePath);
    expect(status).not.toContain('.arcforge-epic');

    // check-ignore confirms it's covered by the info/exclude rule
    // (check-ignore exits 0 when the file IS ignored, 1 when not)
    let checkIgnoreOk = false;
    try {
      execFileSync('git', ['check-ignore', '-q', '.arcforge-epic'], {
        cwd: worktreePath,
        stdio: 'pipe',
      });
      checkIgnoreOk = true;
    } catch {
      checkIgnoreOk = false;
    }
    expect(checkIgnoreOk).toBe(true);
  });

  test('exclude rule is idempotent across multiple expands', () => {
    const coord = new Coordinator(root);
    coord.expandWorktrees({ epicId: 'epic-a' });
    coord.expandWorktrees({ epicId: 'epic-b' });

    const excludePath = path.join(root, '.git', 'info', 'exclude');
    const content = fs.readFileSync(excludePath, 'utf8');
    const matchCount = content.split('\n').filter((line) => line === '.arcforge-epic').length;
    expect(matchCount).toBe(1);
  });

  test('existing info/exclude content is preserved', () => {
    // Pre-populate exclude with unrelated rules
    const excludePath = path.join(root, '.git', 'info', 'exclude');
    fs.writeFileSync(excludePath, '# user rules\n*.log\nnode_modules/\n');

    const coord = new Coordinator(root);
    coord.expandWorktrees({ epicId: 'epic-a' });

    const content = fs.readFileSync(excludePath, 'utf8');
    expect(content).toContain('*.log');
    expect(content).toContain('node_modules/');
    expect(content.split('\n')).toContain('.arcforge-epic');
  });

  test('git add -A in worktree does not stage the marker', () => {
    // This is the real-world scenario — an arc-implementing teammate
    // running blanket `git add -A` during a TDD commit cycle.
    const coord = new Coordinator(root);
    coord.expandWorktrees({ epicId: 'epic-a' });

    const epic = coord.dag.epics.find((e) => e.id === 'epic-a');
    const worktreePath = coord._resolveWorktreePath(epic.worktree);

    // Teammate authors some code
    fs.writeFileSync(path.join(worktreePath, 'feature.txt'), 'work\n');

    // Blanket add (the pattern that caused the qmd leak)
    runGit(['add', '-A'], worktreePath);

    // The marker must NOT be in the staged list
    const staged = runGit(['diff', '--cached', '--name-only'], worktreePath);
    expect(staged).not.toContain('.arcforge-epic');
    // feature.txt WAS staged — proves `git add -A` was genuinely invoked
    expect(staged).toContain('feature.txt');
  });
});
