const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

describe('user-message-counter', () => {
  // Save original env
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-user-'));
    process.env.TMPDIR = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-user-session';
    // Clear module cache before each test
    delete require.cache[require.resolve('../user-message-counter/main')];
    delete require.cache[require.resolve('../lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should initialize with count 0', () => {
    const { readCount } = require('../user-message-counter/main');
    assert.strictEqual(readCount(), 0);
  });

  it('should increment count', () => {
    const { readCount, writeCount } = require('../user-message-counter/main');
    writeCount(1);
    assert.strictEqual(readCount(), 1);
    writeCount(5);
    assert.strictEqual(readCount(), 5);
  });

  it('should reset counter', () => {
    const { readCount, writeCount, resetCounter } = require('../user-message-counter/main');
    writeCount(10);
    resetCounter();
    assert.strictEqual(readCount(), 0);
  });

  it('should use separate counter file from tool counter', () => {
    const { getCounterFilePath } = require('../user-message-counter/main');
    const filePath = getCounterFilePath();
    assert.ok(filePath.includes('arcforge-user-count'));
    assert.ok(!filePath.includes('tool-count'));
  });
});

describe('counter independence', () => {
  // Save original env
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-indep-'));
    process.env.TMPDIR = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-indep-session';
    // Clear all related module caches
    delete require.cache[require.resolve('../user-message-counter/main')];
    delete require.cache[require.resolve('../compact-suggester/main')];
    delete require.cache[require.resolve('../lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should not conflict with compact-suggester counter', () => {
    const {
      readCount: readUserCount,
      writeCount: writeUserCount,
    } = require('../user-message-counter/main');
    const { readCount: readToolCount } = require('../compact-suggester/main');
    const { createSessionCounter } = require('../lib/utils');
    const toolCounter = createSessionCounter('tool-count');

    // Set different values
    writeUserCount(42);
    toolCounter.write(100);

    // Verify independence
    assert.strictEqual(readUserCount(), 42);
    assert.strictEqual(readToolCount(), 100);
  });
});
