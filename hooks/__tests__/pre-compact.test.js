const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

describe('pre-compact: logCompactionEvent', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-precompact-'));
    process.env.HOME = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-precompact-session';
    // Create sessions directory
    fs.mkdirSync(path.join(testDir, '.claude', 'sessions', 'test-project'), { recursive: true });
    delete require.cache[require.resolve('../pre-compact/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should create compaction log file', () => {
    const { logCompactionEvent } = require('../pre-compact/main');
    logCompactionEvent('test-project', '2025-01-15T10:00:00Z', 'session-123');

    const logPath = path.join(testDir, '.claude', 'sessions', 'test-project', 'compaction-log.txt');
    assert.ok(fs.existsSync(logPath), 'compaction-log.txt should exist');
  });

  it('should append formatted entry with timestamp and session', () => {
    const { logCompactionEvent } = require('../pre-compact/main');
    logCompactionEvent('test-project', '2025-01-15T10:00:00Z', 'session-123');

    const logPath = path.join(testDir, '.claude', 'sessions', 'test-project', 'compaction-log.txt');
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('2025-01-15T10:00:00Z'), 'should contain timestamp');
    assert.ok(content.includes('session-123'), 'should contain session ID');
  });

  it('should append to existing log content', () => {
    const { logCompactionEvent } = require('../pre-compact/main');
    logCompactionEvent('test-project', '2025-01-15T10:00:00Z', 'session-1');
    logCompactionEvent('test-project', '2025-01-15T11:00:00Z', 'session-2');

    const logPath = path.join(testDir, '.claude', 'sessions', 'test-project', 'compaction-log.txt');
    const content = fs.readFileSync(logPath, 'utf-8');
    assert.ok(content.includes('session-1'), 'should contain first entry');
    assert.ok(content.includes('session-2'), 'should contain second entry');
  });
});

describe('pre-compact: updateSessionFile', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-precompact-'));
    process.env.HOME = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-precompact-session';
    delete require.cache[require.resolve('../pre-compact/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should add compaction markers to session JSON', () => {
    const { updateSessionFile } = require('../pre-compact/main');

    // Create a session file
    const sessionDir = path.join(testDir, '.claude', 'sessions', 'test-project', '2025-01-15');
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, 'session-123.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ toolCalls: 10, compactions: [] }));

    const result = updateSessionFile('test-project', '2025-01-15', '2025-01-15T10:30:00Z', 'session-123');
    assert.strictEqual(result, true);

    const updated = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    assert.strictEqual(updated.compactions.length, 1);
    assert.strictEqual(updated.compactions[0], '2025-01-15T10:30:00Z');
    assert.strictEqual(updated.lastCompaction, '2025-01-15T10:30:00Z');
    assert.strictEqual(updated.lastUpdated, '2025-01-15T10:30:00Z');
  });

  it('should return false for missing session file', () => {
    const { updateSessionFile } = require('../pre-compact/main');
    const result = updateSessionFile('test-project', '2025-01-15', '2025-01-15T10:30:00Z', 'nonexistent');
    assert.strictEqual(result, false);
  });

  it('should append multiple compaction markers', () => {
    const { updateSessionFile } = require('../pre-compact/main');

    const sessionDir = path.join(testDir, '.claude', 'sessions', 'test-project', '2025-01-15');
    fs.mkdirSync(sessionDir, { recursive: true });
    const sessionFile = path.join(sessionDir, 'session-123.json');
    fs.writeFileSync(sessionFile, JSON.stringify({ toolCalls: 10 }));

    updateSessionFile('test-project', '2025-01-15', '2025-01-15T10:30:00Z', 'session-123');
    updateSessionFile('test-project', '2025-01-15', '2025-01-15T11:00:00Z', 'session-123');

    const updated = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    assert.strictEqual(updated.compactions.length, 2);
  });
});

describe('pre-compact: getMarkdownFilePath', () => {
  const originalEnv = { ...process.env };
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-precompact-'));
    process.env.HOME = testDir;
    process.env.CLAUDE_SESSION_ID = 'test-precompact-session';
    delete require.cache[require.resolve('../pre-compact/main')];
    delete require.cache[require.resolve('../../scripts/lib/utils')];
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should return path with .md extension', () => {
    const { getMarkdownFilePath } = require('../pre-compact/main');
    const result = getMarkdownFilePath('test-project', '2025-01-15', 'session-123');
    assert.ok(result.endsWith('.md'), `Expected .md extension, got: ${result}`);
  });

  it('should include project, date, and session in path', () => {
    const { getMarkdownFilePath } = require('../pre-compact/main');
    const result = getMarkdownFilePath('test-project', '2025-01-15', 'session-123');
    assert.ok(result.includes('test-project'), 'should contain project');
    assert.ok(result.includes('2025-01-15'), 'should contain date');
    assert.ok(result.includes('session-123'), 'should contain session ID');
  });
});
