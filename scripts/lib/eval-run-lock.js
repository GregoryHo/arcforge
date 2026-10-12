/**
 * eval-run-lock.js - One live eval per checkout
 *
 * Two live evals in one project root abort each other: the trial write guard
 * snapshots the project around every trial, so a record the other run writes
 * (under `evals/preflight/`, say) reads as the trial's own write and stops the
 * run. `eval run`, `eval preflight` and `eval ab` therefore hold this lock for
 * as long as they run, and `eval report` while it writes its benchmark.
 *
 * Unlike `locking.js` it never waits and never expires by age: a run takes
 * minutes to hours, so a second run is refused at once, and a lock is reclaimed
 * only when the process that wrote it is gone. The lock file sits under
 * `.eval-trials/`, which the write guard skips and `.gitignore` covers.
 *
 * Residuals, neither prevented here:
 * - A lock whose PID was reused by an unrelated process is refused until the
 *   file is removed by hand.
 * - The lock follows the eval process, not its trial. A trial is a synchronous
 *   `claude` child, which a plain `kill <pid>` of the eval does not reach, so a
 *   run killed mid-trial can leave that child alive; the next run finds a dead
 *   holder and reclaims the lock while the orphan may still be writing.
 *
 * Zero external dependencies — Node.js standard library only.
 */

const fs = require('node:fs');
const path = require('node:path');

const RUN_LOCK_RELATIVE = path.join('.eval-trials', 'run.lock');

/**
 * Whether a process with this PID exists. EPERM means it exists under another
 * user, so only ESRCH counts as gone.
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code !== 'ESRCH';
  }
}

/**
 * Read the holder a lock file names.
 * @param {string} lockPath
 * @returns {{ pid: number, started: string, command: string }|null} null when
 *   the file is unreadable or names no PID
 */
function readHolder(lockPath) {
  try {
    const holder = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    return Number.isInteger(holder.pid) && holder.pid > 0 ? holder : null;
  } catch {
    return null; // vanished, half-written or not JSON: no holder to name
  }
}

/**
 * Create a file that must not exist yet.
 * @param {string} filePath
 * @param {string} content
 * @returns {boolean} false when it already exists
 */
function createExclusive(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, { flag: 'wx' });
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') return false;
    throw new Error(`Failed to create eval run lock ${filePath}: ${err.message}`);
  }
}

/**
 * Throw when the lock belongs to a live process, or cannot say whose it is.
 * @param {string} lockPath
 * @returns {{ pid: number, started: string, command: string }|null} The holder
 *   whose process is gone, or null when there is no lock file
 */
function refuseIfHeld(lockPath) {
  const holder = readHolder(lockPath);
  if (!holder) {
    if (!fs.existsSync(lockPath)) return null;
    throw new Error(
      `Another eval may be running in this checkout: ${lockPath} exists but names no process (a run may be starting). If no eval is running, remove that file and rerun.`,
    );
  }
  if (!isProcessAlive(holder.pid)) return holder;
  throw new Error(
    `Another eval is running in this checkout: \`${holder.command}\` (PID ${holder.pid}, started ${holder.started}) holds ${lockPath}. One checkout runs one live eval at a time; wait for it to finish, or use a second checkout. If PID ${holder.pid} is not an eval, remove that file and rerun.`,
  );
}

/**
 * Take the checkout's run lock, or throw at once when a live eval holds it.
 * A lock whose process is gone is removed and taken over. Released by the
 * returned handle, and on process exit if the caller never got there.
 * @param {string} projectRoot - Project root the eval runs from
 * @param {string} command - What is running, for the refusal another run sees
 * @returns {{ lockPath: string, release: () => void }}
 */
function acquireRunLock(projectRoot, command) {
  if (typeof projectRoot !== 'string' || !projectRoot.trim()) {
    throw new Error('acquireRunLock: projectRoot must be a non-empty string');
  }
  const lockPath = path.resolve(projectRoot, RUN_LOCK_RELATIVE);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const record = JSON.stringify({ pid: process.pid, started: new Date().toISOString(), command });

  if (createExclusive(lockPath, record)) return holdRunLock(lockPath);
  const dead = refuseIfHeld(lockPath);

  // No live holder. Only the run that creates the reservation may remove a
  // lock, and only the dead one it saw before reserving: a lock that appeared
  // or changed since then is another run's, taken while this one looked away.
  const claimPath = `${lockPath}.reclaim`;
  const lostRace = `Failed to take eval run lock ${lockPath}: another eval was taking it over at the same moment. Rerun once it finishes.`;
  if (!createExclusive(claimPath, record)) {
    throw new Error(`${lostRace} If no eval is running, remove ${claimPath}.`);
  }
  try {
    const current = refuseIfHeld(lockPath);
    if (current) {
      if (current.pid !== dead?.pid || current.started !== dead.started) {
        throw new Error(
          `${lostRace} The lock now names \`${current.command}\` (PID ${current.pid}, started ${current.started}).`,
        );
      }
      fs.rmSync(lockPath, { force: true });
    }
    if (!createExclusive(lockPath, record)) {
      refuseIfHeld(lockPath); // name the run that created it first
      throw new Error(lostRace);
    }
  } finally {
    fs.rmSync(claimPath, { force: true });
  }
  return holdRunLock(lockPath);
}

/**
 * Build the handle for a lock this process just created.
 * @param {string} lockPath
 * @returns {{ lockPath: string, release: () => void }}
 */
function holdRunLock(lockPath) {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    process.removeListener('exit', release);
    // Only ever remove our own lock, never one another run holds.
    if (readHolder(lockPath)?.pid === process.pid) fs.rmSync(lockPath, { force: true });
  };
  // `process.exit()` skips a caller's finally block; this does not.
  process.once('exit', release);
  return { lockPath, release };
}

/**
 * Run `fn`, handing it a function that takes the run lock when the run is
 * about to start; the lock, if taken, is released however `fn` ends. `take`
 * returns the handle, for a caller that must release before `process.exit()`.
 * @param {string} projectRoot - Project root the eval runs from
 * @param {(take: (command: string) => { release: () => void }) => *} fn - May be async
 * @returns {Promise<*>} What `fn` returned
 */
async function withRunLock(projectRoot, fn) {
  let lock;
  try {
    return await fn((command) => {
      lock = acquireRunLock(projectRoot, command);
      return lock;
    });
  } finally {
    lock?.release();
  }
}

module.exports = { acquireRunLock, withRunLock, RUN_LOCK_RELATIVE };
