const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

describe('observe: truncate', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CLAUDE_SESSION_ID = 'test-observe-session';
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should return original string when under maxLen', () => {
    const { truncate } = require('../observe/main');
    assert.strictEqual(truncate('hello', 10), 'hello');
  });

  it('should return original string when exactly maxLen', () => {
    const { truncate } = require('../observe/main');
    assert.strictEqual(truncate('12345', 5), '12345');
  });

  it('should truncate and add indicator when over maxLen', () => {
    const { truncate } = require('../observe/main');
    const result = truncate('hello world', 5);
    assert.strictEqual(result, 'hello...[truncated]');
  });

  it('should return empty string for null input', () => {
    const { truncate } = require('../observe/main');
    assert.strictEqual(truncate(null, 10), '');
  });

  it('should return empty string for undefined input', () => {
    const { truncate } = require('../observe/main');
    assert.strictEqual(truncate(undefined, 10), '');
  });

  it('should return empty string for empty string input', () => {
    const { truncate } = require('../observe/main');
    assert.strictEqual(truncate('', 10), '');
  });
});

describe('observe: getArchiveDir', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-observe-'));
    process.env.HOME = testDir;
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should return path ending in /archive', () => {
    const { getArchiveDir } = require('../observe/main');
    const result = getArchiveDir('test-project');
    assert.ok(result.endsWith('/archive'), `Expected path ending in /archive, got: ${result}`);
  });

  it('should include project name in path', () => {
    const { getArchiveDir } = require('../observe/main');
    const result = getArchiveDir('my-project');
    assert.ok(result.includes('my-project'), `Expected project in path, got: ${result}`);
  });
});

describe('observe: getPidFile', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete require.cache[require.resolve('../observe/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
    delete require.cache[require.resolve('../../scripts/lib/session-utils')];
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should return path containing .observer.lock/pid', () => {
    const { getPidFile } = require('../observe/main');
    const result = getPidFile();
    assert.ok(
      result.includes('.observer.lock') && result.endsWith('pid'),
      `Expected .observer.lock/pid in path, got: ${result}`,
    );
  });

  it('should be under .arcforge/instincts/', () => {
    const { getPidFile } = require('../observe/main');
    const result = getPidFile();
    assert.ok(
      result.includes('.arcforge') && result.includes('instincts'),
      `Expected .arcforge/instincts/ in path, got: ${result}`,
    );
  });
});
