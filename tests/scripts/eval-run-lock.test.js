/**
 * eval-run-lock.test.js - The one-live-eval-per-checkout lock.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { acquireRunLock, RUN_LOCK_RELATIVE } = require('../../scripts/lib/eval-run-lock');

/** A PID that existed and is gone: a child that has already exited. */
function deadPid() {
  return spawnSync(process.execPath, ['-e', '']).pid;
}

describe('acquireRunLock', () => {
  let root;
  let lockPath;
  const held = [];
  const take = (command = 'eval run demo') => {
    const lock = acquireRunLock(root, command);
    held.push(lock);
    return lock;
  };
  const plant = (holder) => {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, typeof holder === 'string' ? holder : JSON.stringify(holder));
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcforge-run-lock-'));
    lockPath = path.join(root, RUN_LOCK_RELATIVE);
  });

  afterEach(() => {
    for (const lock of held.splice(0)) lock.release();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes the PID, start time and command under .eval-trials/', () => {
    const lock = take('eval preflight demo');

    expect(lock.lockPath).toBe(lockPath);
    expect(path.relative(root, lockPath).split(path.sep)[0]).toBe('.eval-trials');
    const holder = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    expect(holder.pid).toBe(process.pid);
    expect(holder.command).toBe('eval preflight demo');
    expect(Number.isNaN(Date.parse(holder.started))).toBe(false);
  });

  it('refuses a second acquisition at once, naming the path, PID, start and command', () => {
    take('eval preflight demo');
    const { started } = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

    const before = Date.now();
    let message;
    try {
      acquireRunLock(root, 'eval ab demo');
    } catch (err) {
      message = err.message;
    }

    expect(Date.now() - before).toBeLessThan(1000);
    expect(message).toContain('Another eval is running in this checkout');
    expect(message).toContain(lockPath);
    expect(message).toContain(`PID ${process.pid}`);
    expect(message).toContain(started);
    expect(message).toContain('eval preflight demo');
    // The refused run leaves the holder's lock as it was.
    expect(JSON.parse(fs.readFileSync(lockPath, 'utf8')).command).toBe('eval preflight demo');
  });

  it('release removes the lock, so the next run takes it', () => {
    take().release();

    expect(fs.existsSync(lockPath)).toBe(false);
    expect(() => take('eval ab demo')).not.toThrow();
  });

  it('release is idempotent and drops its exit listener', () => {
    const listeners = process.listenerCount('exit');
    const lock = take();
    expect(process.listenerCount('exit')).toBe(listeners + 1);

    lock.release();
    lock.release();

    expect(process.listenerCount('exit')).toBe(listeners);
  });

  it('reclaims a lock whose process is gone', () => {
    plant({ pid: deadPid(), started: '2026-10-01T00:00:00.000Z', command: 'eval ab crashed' });

    take('eval run demo');

    const holder = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    expect(holder.pid).toBe(process.pid);
    expect(holder.command).toBe('eval run demo');
  });

  it('does not reclaim a live holder however old its lock is', () => {
    plant({ pid: process.ppid, started: '2020-01-01T00:00:00.000Z', command: 'eval ab long' });
    const old = new Date('2020-01-01T00:00:00.000Z');
    fs.utimesSync(lockPath, old, old);

    expect(() => acquireRunLock(root, 'eval run demo')).toThrow(`PID ${process.ppid}`);
    expect(JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid).toBe(process.ppid);
  });

  it('treats a process it may not signal as alive, and leaves its lock in place', () => {
    // PID 1 always exists; signalling it fails with EPERM for any user but root.
    const init = { pid: 1, started: '2026-10-01T00:00:00.000Z', command: 'eval ab other-user' };
    plant(init);

    expect(() => acquireRunLock(root, 'eval run demo')).toThrow('PID 1,');
    expect(JSON.parse(fs.readFileSync(lockPath, 'utf8'))).toEqual(init);
  });

  it('refuses a lock file that names no process, and leaves it in place', () => {
    plant('not json');

    expect(() => acquireRunLock(root, 'eval run demo')).toThrow(
      `${lockPath} exists but names no process`,
    );
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('not json');
  });

  it('release leaves a lock another process holds', () => {
    const lock = take();
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.ppid, started: 'x', command: 'eval ab other' }),
    );

    lock.release();

    expect(JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid).toBe(process.ppid);
  });

  it('refuses while another run holds the takeover reservation, naming it', () => {
    plant({ pid: deadPid(), started: 'x', command: 'eval ab crashed' });
    fs.writeFileSync(`${lockPath}.reclaim`, '{}');

    expect(() => acquireRunLock(root, 'eval run demo')).toThrow(`remove ${lockPath}.reclaim`);
    expect(JSON.parse(fs.readFileSync(lockPath, 'utf8')).command).toBe('eval ab crashed');
  });

  it('clears its takeover reservation', () => {
    plant({ pid: deadPid(), started: 'x', command: 'eval ab crashed' });

    take();

    expect(fs.existsSync(`${lockPath}.reclaim`)).toBe(false);
  });

  it('leaves a lock another run took over between its two looks', () => {
    const live = { pid: process.ppid, started: 'x', command: 'eval ab quicker' };
    plant({ pid: deadPid(), started: 'x', command: 'eval ab crashed' });
    // The other run finishes its takeover just as this one makes its reservation.
    const write = fs.writeFileSync;
    jest.spyOn(fs, 'writeFileSync').mockImplementation((file, ...rest) => {
      if (file === `${lockPath}.reclaim`) write(lockPath, JSON.stringify(live));
      return write(file, ...rest);
    });

    expect(() => acquireRunLock(root, 'eval run demo')).toThrow(`PID ${process.ppid}`);

    jest.restoreAllMocks();
    expect(JSON.parse(fs.readFileSync(lockPath, 'utf8'))).toEqual(live);
    expect(fs.existsSync(`${lockPath}.reclaim`)).toBe(false);
  });

  it('lets exactly one of many concurrent runs take over a dead lock, every round', async () => {
    const modulePath = require.resolve('../../scripts/lib/eval-run-lock');
    // Each contender waits for the shared start instant, tries once, reports,
    // and holds a win until told to stop.
    const contender = `
      const { acquireRunLock } = require(${JSON.stringify(modulePath)});
      while (Date.now() < Number(process.argv[2])) {}
      try {
        acquireRunLock(process.argv[1], 'eval run racer');
        process.stdout.write('won');
        process.stdin.resume().on('data', () => process.exit(0));
      } catch (err) {
        process.stdout.write('refused: ' + err.message);
      }`;
    for (let round = 0; round < 5; round++) {
      fs.rmSync(path.dirname(lockPath), { recursive: true, force: true });
      plant({ pid: deadPid(), started: 'x', command: 'eval ab crashed' });
      const startAt = String(Date.now() + 500);
      const children = Array.from({ length: 12 }, () =>
        spawn(process.execPath, ['-e', contender, root, startAt]),
      );
      const closed = Promise.all(children.map((c) => new Promise((r) => c.once('close', r))));
      try {
        // A contender that dies without a word reports '', which is neither.
        const reports = await Promise.all(
          children.map(
            (child) =>
              new Promise((resolve) => {
                child.stdout.once('data', (d) => resolve(`${d}`));
                child.once('close', () => resolve(''));
              }),
          ),
        );
        const winners = children.filter((_c, i) => reports[i] === 'won');
        const others = reports.filter((r) => r !== 'won');

        expect(winners).toHaveLength(1);
        expect(others.every((r) => r.startsWith('refused: '))).toBe(true);
        expect(JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid).toBe(winners[0].pid);

        winners[0].stdin.write('stop');
        await closed;
        expect(fs.existsSync(lockPath)).toBe(false);
      } finally {
        // A failed round must not leave its winners holding the lock and stdin.
        for (const child of children) child.kill();
        await closed;
      }
    }
  }, 60000);

  it('a holder that calls process.exit without releasing leaves no lock file', () => {
    const modulePath = require.resolve('../../scripts/lib/eval-run-lock');
    const result = spawnSync(process.execPath, [
      '-e',
      `require(${JSON.stringify(modulePath)}).acquireRunLock(process.argv[1], 'eval preflight demo');
       if (!require('node:fs').existsSync(${JSON.stringify(lockPath)})) process.exit(7);
       process.exit(1);`,
      root,
    ]);

    expect(result.status).toBe(1);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('rejects an empty project root', () => {
    expect(() => acquireRunLock('', 'eval run demo')).toThrow('projectRoot must be a non-empty');
  });
});
