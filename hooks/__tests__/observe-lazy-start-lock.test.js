const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// A daemon killed without removing its lock leaves the lock behind. The lazy
// start treats the lock as held only while its PID runs observer-daemon.sh;
// otherwise it falls through and leaves the reclaim to the daemon's acquire_lock.
describe('observe: lazy start ignores a lock whose PID is not a live daemon', () => {
  const originalEnv = { ...process.env };
  let testDir;
  let child;
  let obsPath;
  let pidFile;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-lazylock-'));
    process.env.HOME = testDir;
    delete process.env.ARCFORGE_HOME;
    // Never start a real daemon: past the lock check the call stops at the spawn gate.
    process.env.ARCFORGE_OBSERVE_NO_SPAWN = '1';
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];

    const { getObservationsPath, getObserverPidFile } = require('../../scripts/lib/session-utils');
    const { LAZY_START_THRESHOLD } = require('../observe/main');
    obsPath = getObservationsPath('test-project');
    fs.mkdirSync(path.dirname(obsPath), { recursive: true });
    const rows = Array.from({ length: LAZY_START_THRESHOLD }, (_, i) => JSON.stringify({ i }));
    fs.writeFileSync(obsPath, `${rows.join('\n')}\n`, 'utf-8');
    pidFile = getObserverPidFile();
    fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  });

  afterEach(() => {
    if (child) child.kill('SIGKILL');
    child = undefined;
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  async function waitFor(predicate, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return false;
  }

  it('falls through to the spawn gate when the lock PID is dead', () => {
    const exited = spawnSync('true');
    fs.writeFileSync(pidFile, String(exited.pid), 'utf-8');
    const { spawnDaemonIfNeeded } = require('../observe/main');

    assert.strictEqual(spawnDaemonIfNeeded(obsPath), 'no-spawn-env');
    assert.ok(fs.existsSync(pidFile), 'the hook leaves the lock for the daemon to reclaim');
  });

  // A daemon claiming the lock truncates the pid file before writing its PID, so
  // an empty one may be a start in progress; a spawned `start` would take that
  // lock from it as stale. Only a PID proven not to be a daemon falls through.
  it('treats a lock with an empty pid file as held', () => {
    fs.writeFileSync(pidFile, '', 'utf-8');
    const { spawnDaemonIfNeeded } = require('../observe/main');

    assert.strictEqual(spawnDaemonIfNeeded(obsPath), 'pid-exists');
  });

  // Between the daemon's mkdir of the lock and its first PID write, the lock
  // directory exists with no pid file in it — a start in progress.
  it('treats a lock directory with no pid file as held', () => {
    const { spawnDaemonIfNeeded } = require('../observe/main');

    assert.ok(fs.existsSync(path.dirname(pidFile)), 'fixture: the lock directory exists');
    assert.strictEqual(spawnDaemonIfNeeded(obsPath), 'pid-exists');
  });

  async function startDaemonStub() {
    const stub = path.join(testDir, 'observer-daemon.sh');
    const ready = path.join(testDir, 'ready');
    fs.writeFileSync(stub, `touch "${ready}"\nwhile true; do sleep 0.1; done\n`);
    child = spawn('bash', [stub], { stdio: 'ignore' });
    assert.ok(await waitFor(() => fs.existsSync(ready)), 'stub never became ready');
    fs.writeFileSync(pidFile, String(child.pid), 'utf-8');
  }

  // A PATH with no `ps` on it: the hook cannot tell what a live PID is running.
  function hidePs() {
    const empty = path.join(testDir, 'empty-path');
    fs.mkdirSync(empty);
    process.env.PATH = empty;
  }

  it('returns "pid-exists" when the lock PID runs observer-daemon.sh', async () => {
    await startDaemonStub();
    const { spawnDaemonIfNeeded } = require('../observe/main');

    assert.strictEqual(spawnDaemonIfNeeded(obsPath), 'pid-exists');
  });

  // Without ps a live daemon cannot be told from a stale lock, and the daemon's
  // own acquire_lock would then take the lock and run a second daemon.
  it('treats a live lock PID as held when ps cannot run', async () => {
    await startDaemonStub();
    hidePs();
    const { spawnDaemonIfNeeded } = require('../observe/main');

    assert.strictEqual(spawnDaemonIfNeeded(obsPath), 'pid-exists');
  });

  it('still falls through for a dead lock PID when ps cannot run', () => {
    fs.writeFileSync(pidFile, String(spawnSync('true').pid), 'utf-8');
    hidePs();
    const { spawnDaemonIfNeeded } = require('../observe/main');

    assert.strictEqual(spawnDaemonIfNeeded(obsPath), 'no-spawn-env');
  });
});
