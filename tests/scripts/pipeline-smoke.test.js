/**
 * pipeline-smoke.test.js — deterministic end-to-end smoke for the worktree
 * lifecycle seam chain (SRH-3).
 *
 * This test drives the REAL CLI (`node scripts/cli.js <cmd> --json`) as a
 * subprocess against a freshly-minted git repo, with HOME overridden to a
 * temp dir so canonical worktree paths derive under the test HOME and never
 * touch the real ~/.arcforge/worktrees. Git is never mocked — the worktrees,
 * branches, and merges are real. This is the pipeline an agent (or arc-looping)
 * actually executes, so the assertions are over live engine output, not stubs.
 *
 * The chain has seven load-bearing seams; each step asserts the seam that the
 * preceding capability package fixed:
 *   1. schema --json    — dag schema is a stable, pinnable serialization
 *   2. status --json    — status reports the seeded epics (dag-schema agreement)
 *   3. expand           — creates a real worktree under fake HOME, writes the
 *                         .arcforge-epic marker, and checks out the spec-scoped
 *                         epic branch
 *   4. status .path     — the manifest-promised absolute `path` round-trips
 *                         through parseWorktreePath AND equals getWorktreePath
 *                         (status/manifest agreement, WT-1)
 *   5. complete (in wt) — work happens in the worktree; completion is recorded
 *   6. merge + cleanup  — merge integrates the epic branch into base; cleanup
 *                         removes the worktree and prunes git
 *   7. reboot --json    — handover surfaces the REAL spec title as project_goal
 *                         and a real current_task, never a hardcoded string
 *                         (SRH-1)
 *
 * Plus two structural proofs:
 *   - isolation: every created worktree lives under the fake HOME's
 *     ~/.arcforge/worktrees, never the developer's real home.
 *   - seam regression: monkeypatching the Coordinator back to its pre-SRH-1
 *     hardcoded-goal behavior makes the step-7 assertion fail — proving the
 *     reboot seam assertion actually pins the SRH-1 fix and is not vacuous.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const {
  getWorktreeRoot,
  getWorktreePath,
  parseWorktreePath,
} = require('../../scripts/lib/worktree-paths');
const { Coordinator } = require('../../scripts/lib/coordinator');
const { CLI_MANIFEST } = require('../../scripts/lib/cli-manifest');
const { runGit, setupRepo, DEFAULT_SPEC_ID } = require('./coordinator-test-helpers');

const CLI = path.resolve(__dirname, '../../scripts/cli.js');

// The spec title we seed; reboot must surface this verbatim as project_goal.
const SPEC_TITLE = 'Smoke-test pipeline: ship the seven-seam chain';

/**
 * Run the real CLI as a subprocess. HOME + CLAUDE_PROJECT_DIR are passed
 * explicitly so the engine derives worktree paths under the fake HOME and
 * resolves the project root to the given cwd.
 */
function runCli(args, cwd, home) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], {
      cwd,
      env: { ...process.env, HOME: home, CLAUDE_PROJECT_DIR: cwd },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || err.message, exitCode: err.status };
  }
}

function runCliJson(args, cwd, home) {
  const result = runCli([...args, '--json'], cwd, home);
  if (result.exitCode !== 0) {
    throw new Error(`CLI ${args.join(' ')} exited ${result.exitCode}: ${result.stderr.trim()}`);
  }
  return JSON.parse(result.stdout);
}

/** Seed a spec.xml with a real <title> so reboot can derive project_goal. */
function seedSpecHeader(root, specId, title) {
  const specXml = `<?xml version="1.0" encoding="UTF-8"?>
<spec>
  <overview>
    <spec_id>${specId}</spec_id>
    <spec_version>1</spec_version>
    <status>active</status>
    <source>
      <design_path>docs/plans/${specId}/design.md</design_path>
      <design_iteration>2026-06-14</design_iteration>
    </source>
    <title>${title}</title>
    <description>Smoke-test spec.</description>
    <scope>
      <includes>
        <feature id="epic-a">Epic A</feature>
      </includes>
    </scope>
  </overview>
</spec>
`;
  fs.writeFileSync(path.join(root, 'specs', specId, 'spec.xml'), specXml);
}

describe('SRH-3 deterministic pipeline smoke', () => {
  const originalHome = process.env.HOME;
  let home;
  let root;

  beforeEach(() => {
    const realTmp = fs.realpathSync(os.tmpdir());
    home = fs.mkdtempSync(path.join(realTmp, 'smoke-home-'));
    // process.env.HOME covers in-process os.homedir() reads; the spy is needed
    // because Jest sandboxes process.env so the mutation alone does not reach
    // the os module's cached environment.
    process.env.HOME = home;
    jest.spyOn(os, 'homedir').mockReturnValue(home);

    root = fs.realpathSync(setupRepo({ prefix: 'smoke-repo-' }));
    seedSpecHeader(root, DEFAULT_SPEC_ID, SPEC_TITLE);
    // Commit the seeded dag + spec so the epic worktree checkout carries them.
    runGit(['add', '.'], root);
    runGit(['commit', '-q', '-m', 'chore: seed dag + spec'], root);
  });

  afterEach(() => {
    // Best-effort: remove any worktrees, then the temp HOME and repo.
    try {
      const list = runGit(['worktree', 'list', '--porcelain'], root);
      for (const line of list.split('\n')) {
        if (!line.startsWith('worktree ')) continue;
        const p = line.slice(9);
        if (p !== root && fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
      }
      runGit(['worktree', 'prune'], root);
    } catch {
      // ignore
    }
    jest.restoreAllMocks();
    process.env.HOME = originalHome;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });

  test('seven-seam chain: schema → status → expand → path → complete → merge+cleanup → reboot', () => {
    // Seam 1 — schema --json is a stable serialization and agrees with the
    // frozen manifest skeleton (epics + blocked top-level keys present).
    const schema = runCliJson(['schema'], root, home);
    expect(Object.keys(schema)).toEqual(
      expect.arrayContaining(Object.keys(CLI_MANIFEST.schema.output)),
    );

    // Seam 2 — status --json reports the two seeded pending epics; the per-epic
    // shape carries the manifest-promised keys (including the additive `path`).
    const status0 = runCliJson(['status'], root, home);
    const ids0 = status0.epics.map((e) => e.id).sort();
    expect(ids0).toEqual(['epic-a', 'epic-b']);
    for (const e of status0.epics) {
      expect(e).toHaveProperty('worktree');
      expect(e).toHaveProperty('path');
      expect(e.path).toBeNull(); // unexpanded
    }

    // Seam 3 — expand creates a real worktree (under fake HOME), writes the
    // marker, and checks out the spec-scoped epic branch.
    const expandRes = runCli(['expand', '--epic', 'epic-a', '--json'], root, home);
    expect(expandRes.exitCode).toBe(0);
    const worktreePath = getWorktreePath(root, DEFAULT_SPEC_ID, 'epic-a');
    expect(fs.existsSync(worktreePath)).toBe(true);
    expect(fs.existsSync(path.join(worktreePath, '.arcforge-epic'))).toBe(true);
    const wtBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath).trim();
    expect(wtBranch).toBe(`${DEFAULT_SPEC_ID}/epic-a`);

    // Seam 4 — status .path (from BASE) is absolute, round-trips through
    // parseWorktreePath, and equals the canonical derivation (WT-1 + manifest).
    const status1 = runCliJson(['status'], root, home);
    const epicA1 = status1.epics.find((e) => e.id === 'epic-a');
    expect(path.isAbsolute(epicA1.path)).toBe(true);
    expect(parseWorktreePath(epicA1.path)).not.toBeNull();
    expect(epicA1.path).toBe(worktreePath);

    // Seam 5 — work happens in the worktree, then completion is recorded.
    // Make a real commit on the epic branch so merge has something to integrate.
    fs.writeFileSync(path.join(worktreePath, 'epic-a.txt'), 'epic-a work\n');
    runGit(['add', 'epic-a.txt'], worktreePath);
    runGit(['commit', '-q', '-m', 'feat: epic-a work'], worktreePath);
    const completeRes = runCliJson(['complete', 'epic-a'], root, home);
    expect(completeRes.success).toBe(true);

    // Seam 6 — merge integrates the epic branch into base; cleanup removes the
    // worktree and prunes. After cleanup the worktree dir is gone.
    const mergeRes = runCli(['merge', 'epic-a', '--json'], root, home);
    expect(mergeRes.exitCode).toBe(0);
    // base HEAD now contains the epic's file (merge actually happened).
    expect(fs.existsSync(path.join(root, 'epic-a.txt'))).toBe(true);
    const cleanupRes = runCli(['cleanup', 'epic-a', '--json'], root, home);
    expect(cleanupRes.exitCode).toBe(0);
    expect(fs.existsSync(worktreePath)).toBe(false);

    // Seam 7 — reboot surfaces the REAL spec title and a real task, not a
    // hardcoded string (SRH-1). epic-b is still pending → current_task non-null.
    const reboot = runCliJson(['reboot'], root, home);
    expect(reboot.project_goal).toBe(SPEC_TITLE);
    expect(reboot.project_goal).not.toBe('Build a skill-based autonomous agent toolkit');
    expect(reboot.current_task).not.toBeNull();
    expect(reboot.current_task.id).toBe('epic-b');
    expect(reboot.research_files).toContain(`specs/${DEFAULT_SPEC_ID}/spec.xml`);
  });

  test('isolation proof: created worktrees live under the fake HOME, never the real home', () => {
    runCli(['expand', '--epic', 'epic-a', '--json'], root, home);
    const worktreePath = getWorktreePath(root, DEFAULT_SPEC_ID, 'epic-a');
    const fakeWorktreeRoot = getWorktreeRoot(home);

    // The derived path is under the fake HOME's worktree root.
    expect(worktreePath.startsWith(fakeWorktreeRoot)).toBe(true);
    expect(fs.existsSync(worktreePath)).toBe(true);

    // And NOT under the developer's real home.
    const realWorktreeRoot = getWorktreeRoot(originalHome || os.homedir());
    expect(worktreePath.startsWith(realWorktreeRoot)).toBe(false);
    expect(fakeWorktreeRoot).not.toBe(realWorktreeRoot);
  });

  test('seam regression: reverting SRH-1 (hardcoded goal) makes the step-7 assertion fail', () => {
    // Expand + complete + merge so a real pipeline state exists, identical to
    // the chain test's first steps but exercised in-process via the Coordinator.
    new Coordinator(root, DEFAULT_SPEC_ID).expandWorktrees({ epicId: 'epic-a' });

    // GREEN baseline: with SRH-1 in place, reboot surfaces the real title.
    const realReboot = new Coordinator(root, DEFAULT_SPEC_ID).rebootContext();
    expect(realReboot.project_goal).toBe(SPEC_TITLE);
    expect(realReboot.current_task).not.toBeNull();

    // Temporarily revert SRH-1: restore the pre-fix behavior (hardcoded goal,
    // null current_task) by monkeypatching the derivation methods. This is the
    // exact code SRH-1 replaced (coordinator-core.js, pre-de3e121).
    const goalSpy = jest
      .spyOn(Coordinator.prototype, '_projectGoalFromSpec')
      .mockReturnValue('Build a skill-based autonomous agent toolkit');
    const nextSpy = jest.spyOn(Coordinator.prototype, 'nextTask').mockReturnValue(null);

    const revertedReboot = new Coordinator(root, DEFAULT_SPEC_ID).rebootContext();

    // The step-7 seam assertions MUST now fail — proving they pin the SRH-1 fix.
    expect(() => {
      expect(revertedReboot.project_goal).toBe(SPEC_TITLE);
    }).toThrow();
    expect(() => {
      expect(revertedReboot.current_task).not.toBeNull();
    }).toThrow();

    // And specifically: the reverted goal is the hardcoded string the seam
    // exists to eliminate.
    expect(revertedReboot.project_goal).toBe('Build a skill-based autonomous agent toolkit');
    expect(revertedReboot.current_task).toBeNull();

    goalSpy.mockRestore();
    nextSpy.mockRestore();
  });
});
