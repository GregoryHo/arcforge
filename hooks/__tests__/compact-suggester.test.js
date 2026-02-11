const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

describe('compact-suggester counter', () => {
  // Save original env
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-compact-'));
    process.env.TMPDIR = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-compact-session';
    // Clear module cache before each test
    delete require.cache[require.resolve('../compact-suggester/main')];
    delete require.cache[require.resolve('../lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should initialize with count 0', () => {
    const { readCount } = require('../compact-suggester/main');
    assert.strictEqual(readCount(), 0);
  });

  it('should track counter file path', () => {
    const { getCounterFilePath } = require('../compact-suggester/main');
    const filePath = getCounterFilePath();
    assert.ok(filePath.includes('arcforge-tool-count'));
    assert.ok(filePath.includes('test-compact-session'));
  });

  it('should reset counter', () => {
    const { readCount, resetCounter } = require('../compact-suggester/main');
    // Manually write a count
    const { createSessionCounter } = require('../lib/utils');
    const counter = createSessionCounter('tool-count');
    counter.write(50);

    resetCounter();
    assert.strictEqual(readCount(), 0);
  });
});

describe('shouldSuggest logic', () => {
  // Test the threshold logic directly (no file system needed)
  const THRESHOLD = 50;
  const INTERVAL = 25;

  function shouldSuggest(count) {
    return count >= THRESHOLD && (count - THRESHOLD) % INTERVAL === 0;
  }

  it('should not suggest below threshold', () => {
    assert.strictEqual(shouldSuggest(0), false);
    assert.strictEqual(shouldSuggest(25), false);
    assert.strictEqual(shouldSuggest(49), false);
  });

  it('should suggest at threshold (50)', () => {
    assert.strictEqual(shouldSuggest(50), true);
  });

  it('should suggest at intervals (75, 100, 125)', () => {
    assert.strictEqual(shouldSuggest(75), true);
    assert.strictEqual(shouldSuggest(100), true);
    assert.strictEqual(shouldSuggest(125), true);
  });

  it('should not suggest between intervals', () => {
    assert.strictEqual(shouldSuggest(51), false);
    assert.strictEqual(shouldSuggest(60), false);
    assert.strictEqual(shouldSuggest(74), false);
    assert.strictEqual(shouldSuggest(99), false);
  });
});
