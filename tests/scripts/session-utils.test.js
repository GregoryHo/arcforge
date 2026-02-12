// tests/scripts/session-utils.test.js

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  getDiaryPath,
  saveDiary,
  getProcessedLogPath,
  parseProcessedLog,
  updateProcessedLog,
} = require('../../scripts/lib/session-utils');

describe('session-utils', () => {
  const testDir = path.join(os.tmpdir(), `session-utils-test-${Date.now()}`);
  const originalHome = process.env.HOME;

  beforeAll(() => {
    // Create test directory structure
    fs.mkdirSync(testDir, { recursive: true });
    // Override HOME to use test directory
    process.env.HOME = testDir;
  });

  afterAll(() => {
    // Restore HOME
    process.env.HOME = originalHome;
    // Clean up test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('getDiaryPath', () => {
    it('returns correct path structure', () => {
      const result = getDiaryPath('my-project', '2026-01-15', 'abc123');
      expect(result).toContain('.claude');
      expect(result).toContain('sessions');
      expect(result).toContain('my-project');
      expect(result).toContain('2026-01-15');
      expect(result).toContain('diary-abc123.md');
    });
  });

  describe('getProcessedLogPath', () => {
    it('returns project-specific path when project provided', () => {
      const result = getProcessedLogPath('my-project');
      expect(result).toContain('diaryed');
      expect(result).toContain('my-project');
      expect(result).toContain('processed.log');
    });

    it('returns global path when no project', () => {
      const result = getProcessedLogPath(null);
      expect(result).toContain('diaryed');
      expect(result).toContain('global');
      expect(result).toContain('processed.log');
    });
  });

  describe('saveDiary', () => {
    it('creates directories and saves content', () => {
      const diaryPath = path.join(
        testDir,
        '.claude',
        'sessions',
        'test-project',
        '2026-01-15',
        'diary-test.md',
      );
      const content = '# Test Diary\n\nContent here';

      const result = saveDiary(diaryPath, content);

      expect(result).toBe(true);
      expect(fs.existsSync(diaryPath)).toBe(true);
      expect(fs.readFileSync(diaryPath, 'utf-8')).toBe(content);
    });
  });

  describe('parseProcessedLog', () => {
    it('returns empty set for non-existent file', () => {
      const result = parseProcessedLog('/nonexistent/path/processed.log');
      expect(result.size).toBe(0);
    });

    it('parses log entries correctly', () => {
      const logDir = path.join(testDir, 'test-log');
      fs.mkdirSync(logDir, { recursive: true });
      const logPath = path.join(logDir, 'processed.log');
      fs.writeFileSync(
        logPath,
        '# Comment\ndiary-abc.md | 2026-01-15 | reflection-1.md\ndiary-def.md | 2026-01-16 | reflection-2.md\n',
      );

      const result = parseProcessedLog(logPath);

      expect(result.size).toBe(2);
      expect(result.has('diary-abc.md')).toBe(true);
      expect(result.has('diary-def.md')).toBe(true);
    });
  });

  describe('updateProcessedLog', () => {
    it('appends entries to log', () => {
      const logDir = path.join(testDir, 'update-log-test');
      fs.mkdirSync(logDir, { recursive: true });
      const logPath = path.join(logDir, 'processed.log');

      updateProcessedLog(logPath, ['diary-new.md'], 'reflection-1.md');

      const content = fs.readFileSync(logPath, 'utf-8');
      expect(content).toContain('diary-new.md');
      expect(content).toContain('reflection-1.md');
    });
  });
});
