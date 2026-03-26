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
    delete require.cache[require.resolve('../../scripts/lib/utils')];
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
    const { createSessionCounter } = require('../../scripts/lib/utils');
    const counter = createSessionCounter('tool-count');
    counter.write(50);

    resetCounter();
    assert.strictEqual(readCount(), 0);
  });
});

describe('shouldSuggest logic', () => {
  // Test the exported function directly (no file system needed)
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-suggest-'));
    process.env.TMPDIR = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-suggest-session';
    delete require.cache[require.resolve('../compact-suggester/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should not suggest below threshold', () => {
    const { shouldSuggest } = require('../compact-suggester/main');
    assert.strictEqual(shouldSuggest(0), false);
    assert.strictEqual(shouldSuggest(25), false);
    assert.strictEqual(shouldSuggest(49), false);
  });

  it('should suggest at threshold (50)', () => {
    const { shouldSuggest } = require('../compact-suggester/main');
    assert.strictEqual(shouldSuggest(50), true);
  });

  it('should suggest at intervals (75, 100, 125)', () => {
    const { shouldSuggest } = require('../compact-suggester/main');
    assert.strictEqual(shouldSuggest(75), true);
    assert.strictEqual(shouldSuggest(100), true);
    assert.strictEqual(shouldSuggest(125), true);
  });

  it('should not suggest between intervals', () => {
    const { shouldSuggest } = require('../compact-suggester/main');
    assert.strictEqual(shouldSuggest(51), false);
    assert.strictEqual(shouldSuggest(60), false);
    assert.strictEqual(shouldSuggest(74), false);
    assert.strictEqual(shouldSuggest(99), false);
  });
});

describe('phase-aware messaging', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-phase-'));
    process.env.TMPDIR = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-phase-session';
    // Fresh module load resets memReadCount/memWriteCount to 0
    delete require.cache[require.resolve('../compact-suggester/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should detect read-heavy phase and include exploration message at threshold', () => {
    const { trackToolType, buildMessage } = require('../compact-suggester/main');
    // Simulate 11 reads, 1 write (>70% reads, >10 samples)
    for (let i = 0; i < 11; i++) trackToolType({ tool_name: 'Read' });
    trackToolType({ tool_name: 'Edit' });

    const msg = buildMessage(50);
    assert.ok(msg.includes('mostly reads'), 'should mention mostly reads');
    assert.ok(
      msg.includes('exploration') || msg.includes('research'),
      'should reference exploration/research phase',
    );
  });

  it('should detect write-heavy phase and warn against mid-implementation compaction', () => {
    const { trackToolType, buildMessage } = require('../compact-suggester/main');
    // Simulate 8 writes, 4 reads (>60% writes, >10 samples)
    for (let i = 0; i < 8; i++) trackToolType({ tool_name: 'Write' });
    for (let i = 0; i < 4; i++) trackToolType({ tool_name: 'Grep' });

    const msg = buildMessage(50);
    assert.ok(msg.includes('active implementation'), 'should mention active implementation');
    assert.ok(
      msg.includes('Mid-implementation'),
      'should warn about mid-implementation compaction',
    );
  });

  it('should show generic message when no phase dominates', () => {
    const { trackToolType, buildMessage } = require('../compact-suggester/main');
    // Simulate balanced: 6 reads, 6 writes (50/50 — neither threshold met)
    for (let i = 0; i < 6; i++) trackToolType({ tool_name: 'Glob' });
    for (let i = 0; i < 6; i++) trackToolType({ tool_name: 'Edit' });

    const msg = buildMessage(50);
    assert.ok(msg.includes('workflow phases'), 'should show generic phase message');
  });

  it('should show generic message when too few samples', () => {
    const { trackToolType, buildMessage } = require('../compact-suggester/main');
    // Only 5 reads — below MIN_PHASE_SAMPLES (10)
    for (let i = 0; i < 5; i++) trackToolType({ tool_name: 'Read' });

    const msg = buildMessage(50);
    assert.ok(
      msg.includes('workflow phases'),
      'should show generic message with insufficient samples',
    );
  });

  it('should show read-heavy follow-up message at 75+ calls', () => {
    const { trackToolType, buildMessage } = require('../compact-suggester/main');
    // 11 reads, 1 write — read-heavy
    for (let i = 0; i < 11; i++) trackToolType({ tool_name: 'Grep' });
    trackToolType({ tool_name: 'Write' });

    const msg = buildMessage(75);
    assert.ok(msg.includes('heavy read phase'), 'should mention heavy read phase at 75+');
    assert.ok(
      msg.includes('research') || msg.includes('findings'),
      'should reference research context',
    );
  });

  it('should suppress non-critical reminders during write-heavy phase', () => {
    const { trackToolType, shouldSuppressReminder } = require('../compact-suggester/main');
    // 8 writes, 4 reads — write-heavy (>60%)
    for (let i = 0; i < 8; i++) trackToolType({ tool_name: 'Edit' });
    for (let i = 0; i < 4; i++) trackToolType({ tool_name: 'Read' });

    // Suppressed at non-threshold count below 100
    assert.strictEqual(shouldSuppressReminder(75), true);
    // NOT suppressed at threshold
    assert.strictEqual(shouldSuppressReminder(50), false);
    // NOT suppressed at 100+
    assert.strictEqual(shouldSuppressReminder(100), false);
  });

  it('should not suppress reminders during read-heavy phase', () => {
    const { trackToolType, shouldSuppressReminder } = require('../compact-suggester/main');
    // 11 reads, 1 write — read-heavy
    for (let i = 0; i < 11; i++) trackToolType({ tool_name: 'Grep' });
    trackToolType({ tool_name: 'Write' });

    assert.strictEqual(shouldSuppressReminder(75), false);
  });

  it('should track Read, Glob, Grep as reads', () => {
    const { trackToolType, getReadWriteRatio } = require('../compact-suggester/main');
    trackToolType({ tool_name: 'Read' });
    trackToolType({ tool_name: 'Glob' });
    trackToolType({ tool_name: 'Grep' });
    const { reads, writes } = getReadWriteRatio();
    assert.strictEqual(reads, 3);
    assert.strictEqual(writes, 0);
  });

  it('should track Write, Edit, NotebookEdit as writes', () => {
    const { trackToolType, getReadWriteRatio } = require('../compact-suggester/main');
    trackToolType({ tool_name: 'Write' });
    trackToolType({ tool_name: 'Edit' });
    trackToolType({ tool_name: 'NotebookEdit' });
    const { reads, writes } = getReadWriteRatio();
    assert.strictEqual(reads, 0);
    assert.strictEqual(writes, 3);
  });

  it('should not count unrelated tools as reads or writes', () => {
    const { trackToolType, getReadWriteRatio } = require('../compact-suggester/main');
    trackToolType({ tool_name: 'Bash' });
    trackToolType({ tool_name: 'Agent' });
    trackToolType({ tool_name: 'Task' });
    const { total } = getReadWriteRatio();
    assert.strictEqual(total, 0);
  });
});
