#!/usr/bin/env node
/**
 * Cross-process mutual-exclusion test for locking.js (TEST-2).
 *
 * Same-process synchronous tests cannot prove a mutex — the busy-wait in
 * acquireLock means a single-threaded caller never actually contends with
 * itself. This test forks a REAL child process that holds the lock for a
 * fixed window and asserts the parent's withLock blocks until the child
 * releases, with the two critical sections never overlapping.
 *
 * Coordination is signal-file based (deterministic), NOT a fixed-sleep race:
 *   - The child writes a "ready" file *inside* its locked fn, after it has
 *     entered its critical section.
 *   - The parent polls for "ready" before attempting its own withLock, so it
 *     provably attempts acquisition WHILE the child holds the lock.
 *
 * Critical-section markers (ENTER/EXIT) are appended to a shared file by both
 * processes; correct mutual exclusion produces a well-nested, non-interleaved
 * ordering.
 *
 * Uses the self-fork pattern: forking __filename with a 'child' argv branch
 * avoids a second worker file that the test-*.js glob might pick up.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { once } = require('node:events');

const { withLock } = require('../../scripts/lib/locking');

const HOLD_WINDOW_MS = 800; // child holds the lock this long (well under 5s default timeout)
const READY_FILE = 'child-ready';
const SHARED_FILE = 'critical-section.log';

/**
 * Append a marker line to the shared file. Each line is "<who> <event> <ts>".
 * Appends are individually flushed so ordering reflects real execution.
 */
function mark(sharedFile, who, event) {
  fs.appendFileSync(sharedFile, `${who} ${event} ${Date.now()}\n`);
}

/**
 * Synchronous busy-wait for a fixed number of milliseconds. Mirrors the
 * busy-wait idiom in locking.js — required here because the lock only exists
 * for the synchronous duration of withLock's fn callback. A setTimeout/await
 * would let fn return immediately and release the lock, proving nothing.
 */
function busyWait(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // intentional busy-wait
  }
}

// ---------------------------------------------------------------------------
// Child branch: acquire the lock, signal ready, hold for a fixed window.
// ---------------------------------------------------------------------------
if (process.argv[2] === 'child') {
  const projectRoot = process.argv[3];
  const sharedFile = path.join(projectRoot, SHARED_FILE);
  const readyFile = path.join(projectRoot, READY_FILE);

  try {
    withLock(projectRoot, () => {
      mark(sharedFile, 'child', 'ENTER');
      // Signal the parent only after we are inside the critical section, so
      // the parent's acquisition attempt is guaranteed to contend with us.
      fs.writeFileSync(readyFile, 'ready');
      busyWait(HOLD_WINDOW_MS);
      mark(sharedFile, 'child', 'EXIT');
    });
    process.exit(0);
  } catch (err) {
    console.error(`child error: ${err.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Parent test branch.
// ---------------------------------------------------------------------------

/**
 * Poll for the child's ready file. Uses node timers (not the blocked Bash
 * `sleep`); resolves once the child is provably inside its critical section.
 */
function waitForReady(readyFile, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      if (fs.existsSync(readyFile)) {
        resolve();
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('timed out waiting for child to acquire lock'));
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

function parseMarkers(sharedFile) {
  return fs
    .readFileSync(sharedFile, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [who, event, ts] = line.split(' ');
      return { who, event, ts: Number(ts) };
    });
}

async function main() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-lock-mutex-'));
  const sharedFile = path.join(testDir, SHARED_FILE);
  const readyFile = path.join(testDir, READY_FILE);
  let child;

  console.log('Testing locking.js cross-process mutual exclusion...\n');

  try {
    // Spawn a real child process that acquires and holds the lock.
    child = fork(__filename, ['child', testDir], { stdio: 'inherit' });
    const childExited = once(child, 'exit');

    // Block until the child is provably inside its critical section.
    await waitForReady(readyFile, 5000);

    console.log('  Child holds lock; parent attempting withLock...');
    // The parent attempts acquisition WHILE the child holds the lock. withLock
    // must busy-wait-retry until the child releases — proving it blocks.
    const parentAcquireStart = Date.now();
    withLock(testDir, () => {
      mark(sharedFile, 'parent', 'ENTER');
      busyWait(50);
      mark(sharedFile, 'parent', 'EXIT');
    });
    const parentWaited = Date.now() - parentAcquireStart;
    console.log(`    ✓ parent withLock returned (waited ~${parentWaited}ms for lock)`);

    // Wait for the child to fully exit before reading final state.
    const [childCode] = await childExited;
    assert.strictEqual(childCode, 0, `child should exit cleanly, got code ${childCode}`);
    console.log('    ✓ child process exited cleanly');

    // --- Assert mutual exclusion from the shared critical-section log. ---
    const markers = parseMarkers(sharedFile);

    console.log('  Verifying critical sections never overlapped...');
    assert.strictEqual(
      markers.length,
      4,
      `expected exactly 4 markers, got ${markers.length}: ${JSON.stringify(markers)}`,
    );

    const sequence = markers.map((m) => `${m.who}:${m.event}`);
    assert.deepStrictEqual(
      sequence,
      ['child:ENTER', 'child:EXIT', 'parent:ENTER', 'parent:EXIT'],
      `critical sections interleaved — mutex broken. Sequence: ${sequence.join(', ')}`,
    );
    console.log('    ✓ ordering is well-nested (child fully before parent)');

    // No two ENTERs without an intervening EXIT (defends against any ordering
    // that happens to have 4 markers but overlapping sections).
    let depth = 0;
    for (const m of markers) {
      if (m.event === 'ENTER') {
        depth++;
        assert.strictEqual(
          depth,
          1,
          'two critical sections were open simultaneously — mutex broken',
        );
      } else {
        depth--;
      }
    }
    console.log('    ✓ no two critical sections open simultaneously');

    // Directly back the "parent BLOCKS until child releases" claim: the parent
    // entered its section only after the child exited, and waited a meaningful
    // fraction of the hold window.
    const childExit = markers.find((m) => m.who === 'child' && m.event === 'EXIT');
    const parentEnter = markers.find((m) => m.who === 'parent' && m.event === 'ENTER');
    assert.ok(parentEnter.ts >= childExit.ts, 'parent entered before child exited — mutex broken');
    assert.ok(
      parentWaited >= HOLD_WINDOW_MS / 2,
      `parent withLock returned too fast (${parentWaited}ms) — it likely did not block on the held lock`,
    );
    console.log('    ✓ parent acquisition blocked until child released');

    console.log('\n✅ All cross-process locking tests passed!\n');
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`\n❌ FAILED: ${err.message}\n`);
  process.exit(1);
});
