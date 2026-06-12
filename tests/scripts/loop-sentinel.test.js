/**
 * loop-sentinel.test.js — AF-2 lifecycle-aware loop sentinel matrix.
 *
 * loopSentinelPresent(dir) semantics under test:
 *   - terminal status (anything !== 'running') or finished_at present → false
 *   - status 'running' + fresh heartbeat (mtime)                      → true
 *   - status 'running' + stale heartbeat (> LOOP_HEARTBEAT_STALE_MS)  → false
 *   - unparseable JSON + fresh heartbeat (conservative)               → true
 *   - dir with .arcforge-epic marker resolves to marker.base_worktree
 *     before checking the sentinel (S6-1 worktree-aware)
 *   - no marker → today's behavior (check dir itself)
 *   - the state file is NEVER deleted or moved by the check (AF-5 resume)
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  LOOP_SENTINEL,
  LOOP_HEARTBEAT_STALE_MS,
  loopSentinelPresent,
} = require('../../scripts/lib/sdd-utils');

describe('loopSentinelPresent (lifecycle-aware, AF-2)', () => {
  let tmpDirs;

  beforeEach(() => {
    tmpDirs = [];
  });

  afterEach(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });

  function makeDir(prefix = 'loop-sentinel-') {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(d);
    return d;
  }

  function writeSentinel(dir, content) {
    const p = path.join(dir, LOOP_SENTINEL);
    fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
    return p;
  }

  /** Backdate a file's mtime past the heartbeat staleness window. */
  function makeStale(filePath) {
    const past = new Date(Date.now() - LOOP_HEARTBEAT_STALE_MS - 60 * 1000);
    fs.utimesSync(filePath, past, past);
  }

  /** Write an .arcforge-epic marker pointing at a base worktree. */
  function writeMarker(worktreeDir, baseDir) {
    fs.writeFileSync(
      path.join(worktreeDir, '.arcforge-epic'),
      `epic: epic-1\nspec_id: my-spec\nbase_worktree: ${baseDir}\nbase_branch: main\n`,
    );
  }

  // -------------------------------------------------------------------------
  // Lifecycle matrix (no marker — dir is the project root).
  // -------------------------------------------------------------------------

  it('no sentinel file → false', () => {
    expect(loopSentinelPresent(makeDir())).toBe(false);
  });

  it('terminal status (complete) → false even with fresh mtime', () => {
    const dir = makeDir();
    writeSentinel(dir, { iteration: 3, status: 'complete' });
    expect(loopSentinelPresent(dir)).toBe(false);
  });

  it('terminal status (failed) → false', () => {
    const dir = makeDir();
    writeSentinel(dir, { iteration: 2, status: 'failed' });
    expect(loopSentinelPresent(dir)).toBe(false);
  });

  it('finished_at present → false even if status is running', () => {
    const dir = makeDir();
    writeSentinel(dir, { status: 'running', finished_at: '2026-06-11T00:00:00Z' });
    expect(loopSentinelPresent(dir)).toBe(false);
  });

  it('status running + fresh heartbeat → true', () => {
    const dir = makeDir();
    writeSentinel(dir, { iteration: 1, status: 'running' });
    expect(loopSentinelPresent(dir)).toBe(true);
  });

  it('status running + stale heartbeat → false', () => {
    const dir = makeDir();
    const p = writeSentinel(dir, { iteration: 1, status: 'running' });
    makeStale(p);
    expect(loopSentinelPresent(dir)).toBe(false);
  });

  it('unparseable JSON + fresh heartbeat → true (conservative)', () => {
    const dir = makeDir();
    writeSentinel(dir, '{not json');
    expect(loopSentinelPresent(dir)).toBe(true);
  });

  it('unparseable JSON + stale heartbeat → false', () => {
    const dir = makeDir();
    const p = writeSentinel(dir, '{not json');
    makeStale(p);
    expect(loopSentinelPresent(dir)).toBe(false);
  });

  it('parseable JSON without a status field + fresh heartbeat → true (conservative)', () => {
    // Ambiguous lifecycle (e.g. legacy/foreign sentinel) falls back to the
    // heartbeat, mirroring the unparseable-file conservatism.
    const dir = makeDir();
    writeSentinel(dir, { iteration: 1, running: true });
    expect(loopSentinelPresent(dir)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Worktree-aware resolution (S6-1).
  // -------------------------------------------------------------------------

  it('marker worktree + base running sentinel → true', () => {
    const base = makeDir('loop-sentinel-base-');
    const worktree = makeDir('loop-sentinel-wt-');
    writeSentinel(base, { iteration: 1, status: 'running' });
    writeMarker(worktree, base);
    expect(loopSentinelPresent(worktree)).toBe(true);
  });

  it('marker worktree + base terminal sentinel → false', () => {
    const base = makeDir('loop-sentinel-base-');
    const worktree = makeDir('loop-sentinel-wt-');
    writeSentinel(base, { iteration: 3, status: 'complete', finished_at: '2026-06-11T00:00:00Z' });
    writeMarker(worktree, base);
    expect(loopSentinelPresent(worktree)).toBe(false);
  });

  it('marker worktree + no sentinel at base → false', () => {
    const base = makeDir('loop-sentinel-base-');
    const worktree = makeDir('loop-sentinel-wt-');
    writeMarker(worktree, base);
    expect(loopSentinelPresent(worktree)).toBe(false);
  });

  it("directory without marker keeps today's behavior (checks dir itself)", () => {
    // A running sentinel in the dir itself is honored — no marker, no redirect.
    const dir = makeDir();
    writeSentinel(dir, { iteration: 1, status: 'running' });
    expect(loopSentinelPresent(dir)).toBe(true);
    // And a sibling dir is unaffected.
    expect(loopSentinelPresent(makeDir())).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Non-destructive invariant (AF-5 resume depends on the state file).
  // -------------------------------------------------------------------------

  it('never deletes or moves the state file, for any lifecycle state', () => {
    const terminal = makeDir();
    const tPath = writeSentinel(terminal, { status: 'complete', finished_at: 'x' });
    const running = makeDir();
    const rPath = writeSentinel(running, { status: 'running' });
    const stale = makeDir();
    const sPath = writeSentinel(stale, { status: 'running' });
    makeStale(sPath);

    loopSentinelPresent(terminal);
    loopSentinelPresent(running);
    loopSentinelPresent(stale);

    expect(fs.existsSync(tPath)).toBe(true);
    expect(fs.existsSync(rPath)).toBe(true);
    expect(fs.existsSync(sPath)).toBe(true);
    // Content untouched too.
    expect(JSON.parse(fs.readFileSync(tPath, 'utf8')).status).toBe('complete');
  });

  it('returns false on unusable input instead of throwing', () => {
    expect(loopSentinelPresent(path.join(makeDir(), 'does-not-exist'))).toBe(false);
  });
});
