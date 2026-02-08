const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  escapeForJson,
  fileExists,
  readFileSafe,
  writeFileSafe,
  getTempDir,
  findUpwards,
  setSessionIdFromInput,
  clearCachedSessionId,
  getSessionId,
  getSessionDir,
  getDateString,
  getTimestamp,
  createSessionCounter,
  parseStdinJson
} = require('../lib/utils');

describe('escapeForJson', () => {
  it('should handle empty string', () => {
    assert.strictEqual(escapeForJson(''), '');
  });

  it('should handle non-string input', () => {
    assert.strictEqual(escapeForJson(null), '');
    assert.strictEqual(escapeForJson(undefined), '');
    assert.strictEqual(escapeForJson(123), '');
  });

  it('should escape newlines and tabs', () => {
    assert.strictEqual(escapeForJson('line1\nline2'), 'line1\\nline2');
    assert.strictEqual(escapeForJson('col1\tcol2'), 'col1\\tcol2');
  });

  it('should escape quotes and backslashes', () => {
    assert.strictEqual(escapeForJson('say "hello"'), 'say \\"hello\\"');
    assert.strictEqual(escapeForJson('path\\to\\file'), 'path\\\\to\\\\file');
  });

  it('should escape control characters', () => {
    const result = escapeForJson('\x00\x1f');
    assert.ok(result.includes('\\u0000'));
    assert.ok(result.includes('\\u001f'));
  });
});

describe('fileExists', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-utils-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should return true for existing file', () => {
    const filePath = path.join(testDir, 'exists.txt');
    fs.writeFileSync(filePath, 'test');
    assert.strictEqual(fileExists(filePath), true);
  });

  it('should return false for non-existing file', () => {
    const filePath = path.join(testDir, 'not-exists.txt');
    assert.strictEqual(fileExists(filePath), false);
  });
});

describe('readFileSafe', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-utils-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should read existing file', () => {
    const filePath = path.join(testDir, 'test.txt');
    fs.writeFileSync(filePath, 'hello world');
    assert.strictEqual(readFileSafe(filePath), 'hello world');
  });

  it('should return null for non-existing file', () => {
    assert.strictEqual(readFileSafe('/nonexistent/path'), null);
  });
});

describe('writeFileSafe', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-utils-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should write file successfully', () => {
    const filePath = path.join(testDir, 'output.txt');
    const result = writeFileSafe(filePath, 'test content');
    assert.strictEqual(result, true);
    assert.strictEqual(fs.readFileSync(filePath, 'utf8'), 'test content');
  });

  it('should create parent directories', () => {
    const filePath = path.join(testDir, 'nested', 'deep', 'file.txt');
    const result = writeFileSafe(filePath, 'nested content');
    assert.strictEqual(result, true);
    assert.strictEqual(fs.readFileSync(filePath, 'utf8'), 'nested content');
  });
});

describe('getTempDir', () => {
  it('should return os temp directory', () => {
    assert.strictEqual(getTempDir(), os.tmpdir());
  });
});

describe('findUpwards', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-findupwards-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should find file in start directory', () => {
    const filePath = path.join(testDir, 'target.json');
    fs.writeFileSync(filePath, '{}');
    const result = findUpwards('target.json', testDir);
    assert.strictEqual(result, filePath);
  });

  it('should find file in parent directory', () => {
    const parentFile = path.join(testDir, 'config.json');
    fs.writeFileSync(parentFile, '{}');
    const childDir = path.join(testDir, 'child');
    fs.mkdirSync(childDir);
    const result = findUpwards('config.json', childDir);
    assert.strictEqual(result, parentFile);
  });

  it('should find file in ancestor directory', () => {
    const ancestorFile = path.join(testDir, 'tsconfig.json');
    fs.writeFileSync(ancestorFile, '{}');
    const deepDir = path.join(testDir, 'a', 'b', 'c');
    fs.mkdirSync(deepDir, { recursive: true });
    const result = findUpwards('tsconfig.json', deepDir);
    assert.strictEqual(result, ancestorFile);
  });

  it('should return null when file not found', () => {
    const result = findUpwards('nonexistent.json', testDir);
    assert.strictEqual(result, null);
  });

  it('should find closest file when multiple exist', () => {
    // Create file in both parent and grandparent
    const parentFile = path.join(testDir, 'a', 'package.json');
    const grandparentFile = path.join(testDir, 'package.json');
    fs.writeFileSync(grandparentFile, '{}');
    fs.mkdirSync(path.join(testDir, 'a', 'b'), { recursive: true });
    fs.writeFileSync(parentFile, '{}');

    const result = findUpwards('package.json', path.join(testDir, 'a', 'b'));
    assert.strictEqual(result, parentFile); // Should find closer one
  });
});

describe('setSessionIdFromInput', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearCachedSessionId();
  });

  afterEach(() => {
    clearCachedSessionId();
    process.env = { ...originalEnv };
  });

  it('should cache session_id from input object', () => {
    setSessionIdFromInput({ session_id: 'from-input-123' });
    assert.strictEqual(getSessionId(), 'session-from-input-123');
  });

  it('should return cached session ID', () => {
    const result = setSessionIdFromInput({ session_id: 'cached-456' });
    assert.strictEqual(result, 'cached-456');
  });

  it('should handle null input', () => {
    const result = setSessionIdFromInput(null);
    assert.strictEqual(result, null);
  });

  it('should handle input without session_id', () => {
    const result = setSessionIdFromInput({ other_field: 'value' });
    assert.strictEqual(result, null);
  });

  it('should take priority over environment variables', () => {
    process.env.CLAUDE_SESSION_ID = 'env-id';
    setSessionIdFromInput({ session_id: 'input-id' });
    assert.strictEqual(getSessionId(), 'session-input-id');
  });
});

describe('getSessionId', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearCachedSessionId();
  });

  afterEach(() => {
    clearCachedSessionId();
    process.env = { ...originalEnv };
  });

  it('should return session-{CLAUDE_SESSION_ID} when set', () => {
    process.env.CLAUDE_SESSION_ID = 'claude-123';
    assert.strictEqual(getSessionId(), 'session-claude-123');
  });

  it('should fallback to process.ppid when no env var', () => {
    delete process.env.CLAUDE_SESSION_ID;
    const result = getSessionId();
    // Should be session-{ppid} or session-default
    assert.ok(result.startsWith('session-'));
    if (process.ppid) {
      assert.strictEqual(result, `session-${process.ppid}`);
    }
  });
});

describe('getSessionDir', () => {
  it('should combine project and date correctly', () => {
    const result = getSessionDir('my-project', '2025-01-01');
    assert.ok(result.includes('my-project'));
    assert.ok(result.includes('2025-01-01'));
    assert.ok(result.includes('.claude'));
    assert.ok(result.includes('sessions'));
  });
});

describe('getDateString', () => {
  it('should return YYYY-MM-DD format', () => {
    const result = getDateString();
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result));
  });
});

describe('getTimestamp', () => {
  it('should return ISO format', () => {
    const result = getTimestamp();
    assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(result));
  });
});

describe('createSessionCounter', () => {
  let testDir;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-counter-'));
    process.env.TMPDIR = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-session-123';
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it('should initialize with count 0', () => {
    const counter = createSessionCounter('test');
    assert.strictEqual(counter.read(), 0);
  });

  it('should write and read count correctly', () => {
    const counter = createSessionCounter('test');
    counter.write(5);
    assert.strictEqual(counter.read(), 5);
  });

  it('should reset count to 0', () => {
    const counter = createSessionCounter('test');
    counter.write(10);
    counter.reset();
    assert.strictEqual(counter.read(), 0);
  });

  it('should use session-scoped file path', () => {
    const counter = createSessionCounter('myname');
    const filePath = counter.getFilePath();
    assert.ok(filePath.includes('arcforge-myname'));
    assert.ok(filePath.includes('test-session-123'));
  });

  it('should keep counters independent', () => {
    const counter1 = createSessionCounter('counter1');
    const counter2 = createSessionCounter('counter2');
    counter1.write(100);
    counter2.write(200);
    assert.strictEqual(counter1.read(), 100);
    assert.strictEqual(counter2.read(), 200);
  });
});

describe('parseStdinJson', () => {
  it('should parse valid JSON', () => {
    const result = parseStdinJson('{"key": "value"}');
    assert.deepStrictEqual(result, { key: 'value' });
  });

  it('should return null for invalid JSON', () => {
    assert.strictEqual(parseStdinJson('not json'), null);
    assert.strictEqual(parseStdinJson(''), null);
  });
});
