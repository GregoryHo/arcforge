const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  sanitizeFilename,
  commandExists,
  execCommand,
  ensureDir,
  loadSession,
  saveSession,
  getProjectName,
  getSessionsDir,
  getProjectSessionsDir,
  getCompactionLogPath,
  getDiaryedDir,
  clearCachedSessionId,
} = require('../../scripts/lib/utils');

describe('sanitizeFilename', () => {
  it('should accept valid filenames', () => {
    expect(sanitizeFilename('my-file')).toBe('my-file');
    expect(sanitizeFilename('report_2024.txt')).toBe('report_2024.txt');
    expect(sanitizeFilename('a')).toBe('a');
  });

  it('should reject path separators', () => {
    expect(() => sanitizeFilename('foo/bar')).toThrow(/path separators/);
    expect(() => sanitizeFilename('foo\\bar')).toThrow(/path separators/);
  });

  it('should reject parent directory traversal', () => {
    expect(() => sanitizeFilename('..')).toThrow(/parent directory/);
    expect(() => sanitizeFilename('foo..bar')).toThrow(/parent directory/);
  });

  it('should reject control characters', () => {
    expect(() => sanitizeFilename('foo\x00bar')).toThrow(/control characters/);
    expect(() => sanitizeFilename('foo\nbar')).toThrow(/control characters/);
    expect(() => sanitizeFilename('\x7f')).toThrow(/control characters/);
  });

  it('should reject empty and whitespace-only strings', () => {
    expect(() => sanitizeFilename('')).toThrow(/non-empty/);
    expect(() => sanitizeFilename('   ')).toThrow(/non-empty/);
    expect(() => sanitizeFilename(null)).toThrow(/non-empty/);
    expect(() => sanitizeFilename(undefined)).toThrow(/non-empty/);
  });
});

describe('commandExists', () => {
  it('should return true for node', () => {
    expect(commandExists('node')).toBe(true);
  });

  it('should return false for a nonexistent command', () => {
    expect(commandExists('definitely_not_a_real_command_xyz_123')).toBe(false);
  });
});

describe('execCommand', () => {
  it('should return stdout for successful command', () => {
    const result = execCommand('node', ['-e', 'console.log("hello")']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.stderr).toBe('');
  });

  it('should return non-zero exit code on failure', () => {
    const result = execCommand('node', ['-e', 'process.exit(2)']);
    expect(result.exitCode).toBe(2);
  });

  it('should capture stderr output', () => {
    const result = execCommand('node', ['-e', 'console.error("oops"); process.exit(1)']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('oops');
  });

  it('should return error for nonexistent command', () => {
    const result = execCommand('nonexistent_cmd_xyz');
    expect(result.exitCode).not.toBe(0);
    expect(result.error).toBeDefined();
  });
});

describe('ensureDir', () => {
  let testDir;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-ensure-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should create nested directories', () => {
    const deepPath = path.join(testDir, 'a', 'b', 'c');
    const result = ensureDir(deepPath);
    expect(fs.existsSync(deepPath)).toBe(true);
    expect(result).toBe(deepPath);
  });

  it('should be idempotent for existing directories', () => {
    const dirPath = path.join(testDir, 'existing');
    fs.mkdirSync(dirPath);
    expect(() => ensureDir(dirPath)).not.toThrow();
  });
});

describe('session persistence', () => {
  const originalEnv = { ...process.env };
  const sessionId = `test-persist-${Date.now()}`;
  let testDir;
  let sessionFilePath;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-session-'));
    clearCachedSessionId();
    process.env.CLAUDE_SESSION_ID = sessionId;
    process.env.CLAUDE_PROJECT_DIR = path.join(testDir, 'my-project');
    // Capture the session file path for cleanup
    const { getSessionFilePath: getSFP } = require('../../scripts/lib/utils');
    sessionFilePath = getSFP();
  });

  afterEach(() => {
    // Clean up the session file (written to ~/.arcforge/sessions/...)
    try {
      fs.unlinkSync(sessionFilePath);
    } catch {}
    try {
      fs.rmdirSync(path.dirname(sessionFilePath));
    } catch {}
    fs.rmSync(testDir, { recursive: true, force: true });
    clearCachedSessionId();
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('should return null when no session file exists', () => {
    expect(loadSession()).toBeNull();
  });

  it('should round-trip session data through save and load', () => {
    const session = { startedAt: '2026-01-15T10:00:00Z', toolCalls: 5 };
    const saved = saveSession(session);
    expect(saved).toBe(true);

    const loaded = loadSession();
    expect(loaded).toEqual(session);
  });
});

describe('path helpers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it('getProjectName should use CLAUDE_PROJECT_DIR basename', () => {
    process.env.CLAUDE_PROJECT_DIR = '/home/user/projects/my-app';
    expect(getProjectName()).toBe('my-app');
  });

  it('getSessionsDir should return ~/.arcforge/sessions/', () => {
    expect(getSessionsDir()).toBe(path.join(os.homedir(), '.arcforge', 'sessions'));
  });

  it('getProjectSessionsDir should append project name', () => {
    expect(getProjectSessionsDir('foo')).toBe(
      path.join(os.homedir(), '.arcforge', 'sessions', 'foo'),
    );
  });

  it('getCompactionLogPath should build correct path', () => {
    expect(getCompactionLogPath('bar')).toBe(
      path.join(os.homedir(), '.arcforge', 'sessions', 'bar', 'compaction-log.txt'),
    );
  });

  it('getDiaryedDir should separate project and global', () => {
    const base = path.join(os.homedir(), '.arcforge', 'diaryed');
    expect(getDiaryedDir('proj')).toBe(path.join(base, 'proj'));
    expect(getDiaryedDir()).toBe(path.join(base, 'global'));
  });
});
