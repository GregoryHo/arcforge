/**
 * locking.js - Cross-platform file locking for dag.yaml
 *
 * Uses a simple lock file approach instead of fcntl (which is Unix-only).
 * This works across macOS, Linux, and Windows.
 *
 * Lock strategy:
 * 1. Try to create lock file exclusively (O_EXCL)
 * 2. If exists, check if stale (older than timeout)
 * 3. Retry with exponential backoff
 * 4. Release by unlinking lock file
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Default lock timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 5000;

/**
 * Default stale threshold - if lock file is older than this, consider it stale
 */
const STALE_THRESHOLD = 30000; // 30 seconds

/**
 * Error thrown when lock acquisition fails
 */
class LockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LockError';
  }
}

/**
 * Acquire a lock for DAG operations
 *
 * @param {string} projectRoot - Project root directory
 * @param {Object} options - Lock options
 * @param {number} options.timeout - Timeout in ms (default: 5000)
 * @param {number} options.retryInterval - Initial retry interval in ms (default: 50)
 * @returns {Object} Lock handle with release() method
 */
function acquireLock(projectRoot, options = {}) {
  const lockPath = path.join(projectRoot, '.arcforge-lock');
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const retryInterval = options.retryInterval || 50;
  const startTime = Date.now();

  let currentInterval = retryInterval;
  let acquired = false;

  while (!acquired) {
    try {
      // Try to create lock file exclusively
      const fd = fs.openSync(
        lockPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      );

      // Write PID and timestamp for debugging
      const lockData = JSON.stringify({
        pid: process.pid,
        timestamp: new Date().toISOString(),
        hostname: require('node:os').hostname(),
      });
      fs.writeSync(fd, lockData);
      fs.closeSync(fd);

      acquired = true;
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Lock file exists - check if stale
        try {
          const stat = fs.statSync(lockPath);
          const age = Date.now() - stat.mtimeMs;

          if (age > STALE_THRESHOLD) {
            // Stale lock - try to remove and retry
            try {
              fs.unlinkSync(lockPath);
              continue; // Retry immediately
            } catch (_unlinkErr) {
              // Another process might have removed it, continue
            }
          }
        } catch (_statErr) {
          // File might have been removed, continue
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new LockError(`Failed to acquire DAG lock after ${timeout}ms`);
        }

        // Wait and retry with exponential backoff
        const waitTime = Math.min(currentInterval, 500);
        const endWait = Date.now() + waitTime;
        while (Date.now() < endWait) {
          // Busy wait (Node.js doesn't have sleep)
        }
        currentInterval = Math.min(currentInterval * 2, 500);
      } else {
        throw err;
      }
    }
  }

  // Return lock handle
  return {
    lockPath,
    release() {
      releaseLock(lockPath);
    },
  };
}

/**
 * Release a lock
 *
 * @param {string} lockPath - Path to lock file
 */
function releaseLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch (err) {
    // Ignore if already removed
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Execute a function with DAG lock
 *
 * @param {string} projectRoot - Project root directory
 * @param {Function} fn - Function to execute while holding lock
 * @param {Object} options - Lock options
 * @returns {*} Return value of fn
 */
function withLock(projectRoot, fn, options = {}) {
  const lock = acquireLock(projectRoot, options);
  try {
    return fn();
  } finally {
    lock.release();
  }
}


module.exports = {
  withLock,
};
