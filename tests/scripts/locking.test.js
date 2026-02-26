const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { withLock } = require('../../scripts/lib/locking');

describe('locking.js', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-lock-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('withLock', () => {
    it('should execute function and return its result', () => {
      const result = withLock(testDir, () => 42);
      expect(result).toBe(42);
    });

    it('should remove lock file after successful execution', () => {
      withLock(testDir, () => {});
      const lockPath = path.join(testDir, '.arcforge-lock');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('should release lock even if function throws', () => {
      const lockPath = path.join(testDir, '.arcforge-lock');
      expect(() => {
        withLock(testDir, () => {
          throw new Error('deliberate');
        });
      }).toThrow('deliberate');
      expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('should create lock file during execution', () => {
      let lockExisted = false;
      const lockPath = path.join(testDir, '.arcforge-lock');
      withLock(testDir, () => {
        lockExisted = fs.existsSync(lockPath);
      });
      expect(lockExisted).toBe(true);
    });

    it('should write PID and timestamp to lock file', () => {
      let lockContent = null;
      const lockPath = path.join(testDir, '.arcforge-lock');
      withLock(testDir, () => {
        lockContent = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      });
      expect(lockContent.pid).toBe(process.pid);
      expect(lockContent.timestamp).toBeDefined();
      expect(lockContent.hostname).toBeDefined();
    });

    it('should handle stale lock files', () => {
      const lockPath = path.join(testDir, '.arcforge-lock');
      // Create a stale lock file (pretend it's old)
      fs.writeFileSync(lockPath, JSON.stringify({ pid: 99999, timestamp: '2020-01-01' }));
      // Backdate the file modification time by 60 seconds
      const past = new Date(Date.now() - 60000);
      fs.utimesSync(lockPath, past, past);

      const result = withLock(testDir, () => 'acquired');
      expect(result).toBe('acquired');
    });

    it('should timeout when lock is held by another process', () => {
      const lockPath = path.join(testDir, '.arcforge-lock');
      // Create a fresh (non-stale) lock file
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }),
      );

      expect(() => {
        withLock(testDir, () => {}, { timeout: 200, retryInterval: 50 });
      }).toThrow(/Failed to acquire DAG lock/);
    });

    it('should allow sequential lock acquisitions', () => {
      const results = [];
      results.push(withLock(testDir, () => 1));
      results.push(withLock(testDir, () => 2));
      results.push(withLock(testDir, () => 3));
      expect(results).toEqual([1, 2, 3]);
    });
  });
});
